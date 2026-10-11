import { lazy, Suspense } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useTranslation } from 'react-i18next';
import { useSetupProgress } from '../../hooks/useGymDashboard';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getEnrollmentTrend, getPeakHours, getRevenueBreakdown } from '../../services/analytics';
import { listMembers, getFinanceSummary, getTodayAttendance, getPlatformGym } from '../../services/api';
import { Gift, Bell, CreditCard, Plus, Calendar, TrendingUp, Users, DollarSign, Settings, Shield, Building2 } from 'lucide-react';
import { StatCard, Panel, Banner, DashboardPage, PrimaryAction, SecondaryAction } from '../../components/dashboard';

// Code-split: recharts is a large dependency (~400KB before this fix, per
// the `vite build` chunk-size warning). Lazy-loading these means the chart
// library only downloads for someone who actually opens this dashboard,
// and doesn't inflate the shared/base bundle every other route pays for.
const EnrollmentRetentionChart = lazy(() => import('../../components/charts/EnrollmentRetentionChart'));
const PeakHoursChart = lazy(() => import('../../components/charts/PeakHoursChart'));
const RevenueBreakdownChart = lazy(() => import('../../components/charts/RevenueBreakdownChart'));

const chartSkeleton = <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-80 animate-pulse" />;

// NOTE (engineering audit): this is a pure content component — the route's
// ProtectedRoute > AppLayout wrapper supplies the sidebar/header (RTL/LTR-aware,
// i18n-driven chrome). We must NOT render our own fixed sidebar+header here.

function BirthdaysCard() {
  const { t } = useTranslation();
  return (
    <Panel title={t('dashboard.birthdaysTitle')} icon={Gift} accent="emerald">
      <div className="flex items-center justify-center py-6 text-center">
        <p className="text-sm text-gray-400">{t('dashboard.noBirthdays')}</p>
      </div>
    </Panel>
  );
}

function NotificationsCard() {
  const { t } = useTranslation();
  return (
    <Panel title={t('header.notifications')} icon={Bell} accent="emerald">
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Bell size={32} className="text-gray-200 mb-3" strokeWidth={1.5} />
        <p className="text-sm text-gray-400">{t('dashboard.noNotifications')}</p>
      </div>
    </Panel>
  );
}

function OverduePaymentsCard() {
  const { t } = useTranslation();
  return (
    <Panel title={t('dashboard.agingReceivablesTitle')} icon={CreditCard} accent="rose">
      <div className="flex items-center justify-center py-6 text-center">
        <p className="text-sm text-gray-400">{t('dashboard.noOverduePayments')}</p>
      </div>
    </Panel>
  );
}

export default function GymAdminDashboard() {
  const { tenantId, isZeroState } = useApp();
  const { t } = useTranslation();
  const showSetup = isZeroState || localStorage.getItem('gymcore-setup-dismissed') !== '1';
  const { doneCount, total } = useSetupProgress(showSetup);
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Fetch gym info using the gym_id from the context
  const { data: gymInfo } = useApiQuery(
    ['gym', 'info'],
    () => getPlatformGym(tenantId).then((r) => r.data),
    { staleTime: 60_000, enabled: !!tenantId }
  );

  const { data: enrollmentTrend, isLoading: enrollmentLoading, isError: enrollmentError } = useApiQuery(
    ['analytics', 'enrollment-trend'],
    async () => (await getEnrollmentTrend()).data,
    { staleTime: 5 * 60_000 }
  );
  const { data: peakHours, isLoading: peakHoursLoading, isError: peakHoursError } = useApiQuery(
    ['analytics', 'peak-hours'],
    async () => (await getPeakHours()).data,
    { staleTime: 5 * 60_000 }
  );
  const { data: revenueBreakdown, isLoading: revenueLoading, isError: revenueError } = useApiQuery(
    ['analytics', 'revenue-breakdown'],
    async () => (await getRevenueBreakdown()).data,
    { staleTime: 5 * 60_000 }
  );

  // ── Real data sources (no hardcoded KPIs) ──
  const { data: membersRes } = useApiQuery(
    ['gym', 'members', 'summary'],
    () => listMembers({ limit: 200 }),
    { staleTime: 60_000 }
  );
  const { data: financeRes } = useApiQuery(
    ['gym', 'finance', 'summary'],
    getFinanceSummary,
    { staleTime: 60_000 }
  );
  const { data: attendanceRes } = useApiQuery(
    ['gym', 'attendance', 'today'],
    getTodayAttendance,
    { staleTime: 30_000 }
  );

  const members = membersRes?.members ?? [];
  const totalMembers = membersRes?.total ?? 0;
  const activeMembers = members.filter((m) => m.subscription_status === 'active').length;
  const monthlyRevenue = financeRes?.data?.monthly_revenue ?? 0;
  const todayCount = attendanceRes?.records.length ?? 0;
  const attendanceRate = activeMembers > 0 ? Math.round((todayCount / activeMembers) * 100) : 0;

  // ── Real sparkline series derived from API data ──
  const enrollmentSpark = enrollmentTrend?.map((r) => r.new_members) ?? [];
  const membersSpark = enrollmentSpark.reduce<number[]>((acc, v, i) => {
    acc.push((acc[i - 1] ?? 0) + v);
    return acc;
  }, []);
  const revenueSpark = revenueBreakdown
    ? [revenueBreakdown.memberships, revenueBreakdown.pos, revenueBreakdown.personal_training]
    : [];
  const attendanceSpark = peakHours?.map((h) => h.check_ins) ?? [];

  // Real month-over-month enrollment trend (replaces hardcoded "+x%").
  const enrollmentDelta = enrollmentSpark.length > 1
    ? enrollmentSpark[enrollmentSpark.length - 1] - enrollmentSpark[enrollmentSpark.length - 2]
    : 0;

  return (
    <div className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        title={gymInfo?.name || t('dashboard.welcome')}
        subtitle={gymInfo?.name ? `${gymInfo.name} · ${t('dashboard.welcomeSubtitle')}` : t('dashboard.welcomeSubtitle')}
        actions={
          <>
            <SecondaryAction>
              <Calendar size={16} />
              {t('dashboard.selectDates', 'Select dates')}
            </SecondaryAction>
            <PrimaryAction>
              <Plus size={16} />
              {t('dashboard.addStudents', 'Add new students')}
            </PrimaryAction>
          </>
        }
      >
        {/* Setup progress banner (light variant) */}
        {showSetup && (
          <Banner
            tone="emerald"
            title={t('dashboard.welcome')}
            description={t('dashboard.welcomeSubtitle')}
            progress={progress}
            progressLabel={`${t('dashboard.progress')} · ${doneCount} / ${total}`}
          />
        )}

        {/* Gym Info & Account Settings */}
        <Panel title={t('dashboard.gymInfo', 'معلومات الصالة')} icon={Building2} accent="emerald">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboard.gymName', 'اسم الصالة')}</label>
              <p className="text-lg font-semibold text-gray-900">{gymInfo?.name || t('dashboard.loading', 'جاري التحميل...')}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboard.subdomain', 'النطاق الفرعي')}</label>
              <p className="text-sm font-medium text-gray-900 font-mono">{gymInfo?.subdomain || '—'}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboard.plan', 'الباقة')}</label>
              <p className="text-sm font-medium text-gray-900">{gymInfo?.plan_tier || '—'}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboard.status', 'الحالة')}</label>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${gymInfo?.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                {gymInfo?.is_active ? t('dashboard.active', 'نشط') : t('dashboard.inactive', 'غير نشط')}
              </span>
            </div>
          </div>
        </Panel>

        {/* Account Settings */}
        <Panel title={t('dashboard.accountSettings', 'إعدادات الحساب')} icon={Settings} accent="violet">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboard.fullName', 'الاسم الكامل')}</label>
              <p className="text-sm font-medium text-gray-900">{gymInfo?.dba_name || gymInfo?.name || '—'}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboard.email', 'البريد الإلكتروني')}</label>
              <p className="text-sm font-medium text-gray-900 truncate">{gymInfo?.email || '—'}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboard.phone', 'الهاتف')}</label>
              <p className="text-sm font-medium text-gray-900">{gymInfo?.phone || '—'}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboard.address', 'العنوان')}</label>
              <p className="text-sm font-medium text-gray-900">{gymInfo?.address_street || gymInfo?.address_city || '—'}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <PrimaryAction onClick={() => { /* TODO: navigate to settings */ }}>
              <Settings size={16} /> {t('dashboard.editSettings', 'تعديل الإعدادات')}
            </PrimaryAction>
            <SecondaryAction onClick={() => { /* TODO: navigate to billing */ }}>
              <Shield size={16} /> {t('dashboard.billing', 'الفواتير والاشتراكات')}
            </SecondaryAction>
          </div>
        </Panel>

        {/* KPI Cards row — all values from real endpoints */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            icon={Calendar}
            label={t('dashboard.todayCheckin', 'حضور اليوم')}
            value={String(todayCount)}
            trend={`${attendanceRate}%`}
            trendPositive={attendanceRate >= 0}
            sparkData={attendanceSpark.length > 1 ? attendanceSpark : undefined}
            accent="emerald"
          />
          <StatCard
            icon={DollarSign}
            label={t('dashboard.monthlyRevenue', 'Monthly revenue')}
            value={`$${monthlyRevenue.toLocaleString()}`}
            sparkData={revenueSpark.length > 1 ? revenueSpark : undefined}
            accent="emerald"
          />
          <StatCard
            icon={Users}
            label={t('dashboard.activeMembers', 'Active members')}
            value={String(activeMembers || totalMembers)}
            trend={enrollmentDelta !== 0 ? `${enrollmentDelta > 0 ? '+' : ''}${enrollmentDelta}` : undefined}
            trendPositive={enrollmentDelta >= 0}
            sparkData={membersSpark.length > 1 ? membersSpark : undefined}
            accent="violet"
          />
          <StatCard
            icon={TrendingUp}
            label={t('dashboard.attendanceRate', 'Attendance rate')}
            value={`${attendanceRate}%`}
            sparkData={attendanceSpark.length > 1 ? attendanceSpark : undefined}
            accent="amber"
          />
        </div>

        {/* Analytics + side cards */}
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('dashboard.title')}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {enrollmentError ? (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 text-sm text-red-500">{t('dashboard.loadError')}</div>
              ) : enrollmentLoading || !enrollmentTrend ? (
                chartSkeleton
              ) : (
                <Suspense fallback={chartSkeleton}>
                  <EnrollmentRetentionChart data={enrollmentTrend} />
                </Suspense>
              )}

              {peakHoursError ? (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 text-sm text-red-500">{t('dashboard.loadError')}</div>
              ) : peakHoursLoading || !peakHours ? (
                chartSkeleton
              ) : (
                <Suspense fallback={chartSkeleton}>
                  <PeakHoursChart data={peakHours} />
                </Suspense>
              )}

              {revenueError ? (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 text-sm text-red-500 lg:col-span-2">{t('dashboard.loadError')}</div>
              ) : revenueLoading || !revenueBreakdown ? (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-80 animate-pulse lg:col-span-2" />
              ) : (
                <div className="lg:col-span-2 lg:max-w-xl">
                  <Suspense fallback={chartSkeleton}>
                    <RevenueBreakdownChart data={revenueBreakdown} />
                  </Suspense>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <BirthdaysCard />
            <NotificationsCard />
            <OverduePaymentsCard />
          </div>
        </div>
      </DashboardPage>
    </div>
  );
}
