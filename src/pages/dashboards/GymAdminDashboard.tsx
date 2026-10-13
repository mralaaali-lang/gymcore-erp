import { useState } from 'react';
import { formatDate } from '../../utils/date';
import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/GymBrandContext';
import { useSetupProgress } from '../../hooks/useGymDashboard';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getEnrollmentTrend, getPeakHours, getRevenueBreakdown } from '../../services/analytics';
import {
  listMembers, getFinanceSummary, getTodayAttendance, listLeads,
  getExpiringSoon, getInactiveMembers, getOverdueDebts,
} from '../../services/api';
import { formatMoney } from '../../utils/currency';
import {
  Gift, Plus, TrendingUp, Users, DollarSign,
  Clock, AlertTriangle, UserX, UserPlus, ChevronLeft, QrCode,
} from 'lucide-react';
import { StatCard, Panel, Banner, DashboardPage, PrimaryAction, AccentAction } from '../../components/dashboard';
import { QuickActionBar, QuickActionModals, PRESENT_WINDOW_HOURS, type ActionKey } from '../../components/dashboard/QuickActionCenter';

// §24 redesign — "today's tasks first" (competitor pattern: Mindbody/Glofox/
// Wodify owner dashboards lead with what needs action today, not vanity KPIs).
// Removed: the 403 platform /platform/gyms/:id call (gym name/plan/currency
// now come from /auth/me via context), the duplicated welcome hero, the
// static Birthdays/Notifications/Overdue cards, the big Gym-Info/Account
// panels, and the no-op header buttons.

const EnrollmentRetentionChart = lazy(() => import('../../components/charts/EnrollmentRetentionChart'));
const PeakHoursChart = lazy(() => import('../../components/charts/PeakHoursChart'));
const RevenueBreakdownChart = lazy(() => import('../../components/charts/RevenueBreakdownChart'));

const chartSkeleton = <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-80 animate-pulse" />;

/** One "needs your action" card: count badge + top rows + jump link. */
function ActionCard({
  icon: Icon,
  title,
  subtitle,
  count,
  accent,
  to,
  rows,
  emptyText,
}: {
  icon: typeof Users;
  title: string;
  subtitle?: string;
  count: number;
  accent: 'emerald' | 'rose' | 'amber' | 'violet';
  to: string;
  rows: { key: string; primary: string; secondary?: string }[];
  emptyText: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const soft: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      icon={Icon}
      accent={accent}
      actions={
        <span className={`inline-flex items-center min-w-7 h-7 px-2 rounded-full text-sm font-bold ${count > 0 ? soft[accent] : 'bg-gray-100 text-gray-400'}`}>
          {count}
        </span>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-gray-900 truncate">{r.primary}</span>
              {r.secondary && <span className="text-gray-500 shrink-0 text-xs">{r.secondary}</span>}
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => navigate(to)}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
      >
        {t('dashboard.viewAll', 'عرض الكل')}
        <ChevronLeft size={15} className="rtl:hidden" />
        <ChevronLeft size={15} className="hidden rtl:block rotate-180" />
      </button>
    </Panel>
  );
}

export default function GymAdminDashboard() {
  const { isZeroState, gymProfile, account, language } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currency = gymProfile?.currency;

  // §33أ-تنظيف — gym name/date/plan moved to the sidebar brand block; the page
  // header keeps only the add-member CTA, and quick actions live in cards.
  const [action, setAction] = useState<ActionKey | null>(null);

  // Setup banner only for a brand-new gym — an operating gym never sees it (§24).
  const { doneCount, total } = useSetupProgress(isZeroState);
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

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
  const { data: financeRes } = useApiQuery(['gym', 'finance', 'summary'], getFinanceSummary, { staleTime: 60_000 });
  const { data: attendanceRes } = useApiQuery(['gym', 'attendance', 'today'], getTodayAttendance, { staleTime: 30_000 });

  // ── "Needs your action" feeds (§24 new manager-only endpoints) ──
  const { data: expiring } = useApiQuery(
    ['dashboard', 'expiring-soon'],
    () => getExpiringSoon(7),
    { staleTime: 60_000 }
  );
  const { data: inactive } = useApiQuery(
    ['dashboard', 'inactive-members'],
    () => getInactiveMembers(14),
    { staleTime: 5 * 60_000 }
  );
  const { data: overdue } = useApiQuery(
    ['dashboard', 'overdue-debts'],
    getOverdueDebts,
    { staleTime: 60_000 }
  );
  const { data: newLeads } = useApiQuery(
    ['dashboard', 'new-leads'],
    () => listLeads({ status: 'new', limit: 5 }),
    { staleTime: 60_000 }
  );

  const members = membersRes?.members ?? [];
  const totalMembers = membersRes?.total ?? 0;
  const activeMembers = members.filter((m) => m.subscription_status === 'active').length;
  const fin = financeRes?.data;
  const monthlyRevenue = Number(fin?.monthly_revenue ?? 0);
  const todayRevenue = Number(fin?.today_revenue ?? 0);
  const yesterdayRevenue = Number(fin?.yesterday_revenue ?? 0);
  const todayCount = attendanceRes?.records.length ?? 0;

  const revenueDeltaPct = yesterdayRevenue > 0
    ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
    : null;

  // ── Sparklines/deltas from real series ──
  const enrollmentSpark = enrollmentTrend?.map((r) => r.new_members) ?? [];
  const membersSpark = enrollmentSpark.reduce<number[]>((acc, v, i) => {
    acc.push((acc[i - 1] ?? 0) + v);
    return acc;
  }, []);
  const revenueSpark = revenueBreakdown
    ? [revenueBreakdown.memberships, revenueBreakdown.pos, revenueBreakdown.personal_training]
    : [];
  const enrollmentDelta = enrollmentSpark.length > 1
    ? enrollmentSpark[enrollmentSpark.length - 1] - enrollmentSpark[enrollmentSpark.length - 2]
    : 0;

  // Hide charts that would render as an empty frame (§24).
  const hasPeakData = (peakHours ?? []).some((h) => h.check_ins > 0);
  const hasRevenueData = !!revenueBreakdown
    && (revenueBreakdown.memberships + revenueBreakdown.pos + revenueBreakdown.personal_training) > 0;

  const daysWord = (n: number) => language === 'ar' ? `${n} يوم` : `${n}d`;

  // "متواجدون الآن" = check-ins within the last PRESENT_WINDOW_HOURS (no check-out exists).
  const presentRecords = attendanceRes?.records ?? [];
  const presentCount = presentRecords.filter((r) => {
    const ts = new Date((r as { check_in_time?: string }).check_in_time ?? 0).getTime();
    return Number.isFinite(ts) && ts >= Date.now() - PRESENT_WINDOW_HOURS * 3600_000;
  }).length;

  return (
    <div className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        actions={
          <PrimaryAction onClick={() => setAction('member')}>
            <Plus size={16} />
            {t('dashboard.addMember', 'إضافة عضو')}
          </PrimaryAction>
        }
      >
        {/* Setup progress — only for a zero-state (brand new) gym */}
        {isZeroState && (
          <Banner
            tone="emerald"
            title={t('dashboard.welcome')}
            description={t('dashboard.welcomeSubtitle')}
            progress={progress}
            progressLabel={`${t('dashboard.progress')} · ${doneCount} / ${total}`}
          />
        )}

        {/* §33 دفعة 1 — every daily admin action starts here (real endpoints, no page detour) */}
        <QuickActionBar onOpen={setAction} />

        {/* ── Row 1: today at a glance ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <StatCard
            icon={DollarSign}
            label={t('dashboard.todayRevenue', 'مبيعات اليوم')}
            value={formatMoney(todayRevenue, currency)}
            trend={revenueDeltaPct !== null ? `${revenueDeltaPct > 0 ? '+' : ''}${revenueDeltaPct}%` : undefined}
            trendPositive={(revenueDeltaPct ?? 0) >= 0}
            accent="violet"
            onClick={() => navigate('/admin/sales')}
          />
          <StatCard
            icon={TrendingUp}
            label={t('dashboard.monthlyRevenue', 'الإيراد الشهري')}
            value={formatMoney(monthlyRevenue, currency)}
            sparkData={revenueSpark.length > 1 ? revenueSpark : undefined}
            accent="amber"
            onClick={() => navigate('/admin/reports')}
          />
          <StatCard
            icon={Users}
            label={t('dashboard.activeMembers', 'الأعضاء النشطون')}
            value={String(activeMembers || totalMembers)}
            trend={enrollmentDelta !== 0 ? `${enrollmentDelta > 0 ? '+' : ''}${enrollmentDelta}` : undefined}
            trendPositive={enrollmentDelta >= 0}
            sparkData={membersSpark.length > 1 ? membersSpark : undefined}
            accent="emerald"
            onClick={() => navigate('/admin/members')}
          />
        </div>

        {/* ── Row 2: today's tasks — action cards first (check-in + attendance live here) ── */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('dashboard.todaysTasks', 'مهام اليوم')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <Panel
              icon={QrCode}
              accent="emerald"
              title={t('dashboard.checkInCard', 'تسجيل حضور')}
              subtitle={t('dashboard.checkInCardSub', 'مسح باركود · كود · رقم هاتف')}
            >
              <p className="text-sm text-gray-500 leading-relaxed">
                {t('dashboard.checkInCardDesc', 'افتح شاشة الحضور: كاميرا تمسح QR/الباركود وتسجّل تلقائيًا بشكل مستمر، أو أدخل الكود/رقم الهاتف يدويًا.')}
              </p>
              <AccentAction className="mt-4 w-full" onClick={() => setAction('checkin')}>
                <QrCode size={16} />
                {t('dashboard.openCheckIn', 'فتح شاشة الحضور')}
              </AccentAction>
            </Panel>
            <Panel
              icon={Users}
              accent="violet"
              title={t('dashboard.todayAttendance', 'حضور اليوم')}
              subtitle={t('dashboard.presentNow', 'متواجدون الآن (آخر {{n}} ساعات)', { n: PRESENT_WINDOW_HOURS })}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-bold text-emerald-700 tabular-nums">{todayCount}</p>
                  <p className="text-xs font-semibold text-emerald-600 mt-1">{t('dashboard.checkedInToday', 'حضور اليوم')}</p>
                </div>
                <div className="bg-violet-50 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-bold text-violet-700 tabular-nums">{presentCount}</p>
                  <p className="text-xs font-semibold text-violet-600 mt-1">{t('dashboard.presentNowShort', 'متواجدون الآن')}</p>
                </div>
              </div>
              <button
                onClick={() => setAction('today')}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
              >
                {t('dashboard.viewList', 'عرض القائمة')}
                <ChevronLeft size={15} className="rtl:hidden" />
                <ChevronLeft size={15} className="hidden rtl:block rotate-180" />
              </button>
            </Panel>
            <ActionCard
              icon={Clock}
              title={t('dashboard.expiringSoon', 'اشتراكات تنتهي خلال 7 أيام')}
              count={expiring?.total ?? 0}
              accent="amber"
              to="/admin/subscriptions"
              rows={(expiring?.data ?? []).slice(0, 4).map((r) => ({
                key: r.member_id,
                primary: r.member_name,
                secondary: r.days_left >= 0
                  ? t('dashboard.inDays', { n: r.days_left, defaultValue: daysWord(r.days_left) })
                  : t('dashboard.lateBy', { n: -r.days_left, defaultValue: daysWord(-r.days_left) }),
              }))}
              emptyText={t('dashboard.allClear', 'لا شيء هنا — كل الاشتراكات بعيدة عن الانتهاء')}
            />
            <ActionCard
              icon={AlertTriangle}
              title={t('dashboard.overdueDebts', 'مستحقات متأخرة')}
              subtitle={overdue && overdue.total_amount > 0 ? formatMoney(Number(overdue.total_amount), currency) : undefined}
              count={overdue?.data.length ?? 0}
              accent="rose"
              to="/admin/billing?tab=Debts"
              rows={(overdue?.data ?? []).slice(0, 4).map((r) => ({
                key: r.id,
                primary: r.member_name,
                secondary: `${formatMoney(Number(r.remaining_amount), currency)} · ${daysWord(Number(r.days_overdue))}`,
              }))}
              emptyText={t('dashboard.noOverduePayments')}
            />
            <ActionCard
              icon={UserX}
              title={t('dashboard.inactiveMembers', 'أعضاء غائبون 14+ يوم')}
              count={inactive?.total ?? 0}
              accent="violet"
              to="/admin/members"
              rows={(inactive?.data ?? []).slice(0, 4).map((r) => ({
                key: r.member_id,
                primary: r.member_name,
                secondary: r.last_check_in
                  ? t('dashboard.lastSeen', { defaultValue: 'آخر حضور' }) + ' ' + formatDate(r.last_check_in)
                  : t('dashboard.neverCheckedIn', 'لم يحضر قط'),
              }))}
              emptyText={t('dashboard.allClearInactive', 'كل الأعضاء النشطين يحضرون بانتظام')}
            />
            <ActionCard
              icon={UserPlus}
              title={t('dashboard.newLeads', 'عملاء محتملون بحاجة لمتابعة')}
              count={newLeads?.pagination.total ?? 0}
              accent="emerald"
              to="/admin/crm"
              rows={(newLeads?.data ?? []).slice(0, 4).map((r) => ({
                key: r.id,
                primary: r.name,
                secondary: r.phone,
              }))}
              emptyText={t('dashboard.noNewLeads', 'لا يوجد عملاء محتملون جدد')}
            />
          </div>
        </div>

        {/* ── Row 3: analytics (only cards with real data) ── */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('dashboard.analytics', 'التحليلات')}</h2>
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

            {!peakHoursError && !peakHoursLoading && peakHours && !hasPeakData ? null :
              peakHoursError ? (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 text-sm text-red-500">{t('dashboard.loadError')}</div>
              ) : peakHoursLoading || !peakHours ? (
                chartSkeleton
              ) : (
                <Suspense fallback={chartSkeleton}>
                  <PeakHoursChart data={peakHours} />
                </Suspense>
              )}

            {hasRevenueData && (
              revenueError ? (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 text-sm text-red-500 lg:col-span-2">{t('dashboard.loadError')}</div>
              ) : revenueLoading || !revenueBreakdown ? (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-80 animate-pulse lg:col-span-2" />
              ) : (
                <div className="lg:col-span-2 lg:max-w-xl">
                  <Suspense fallback={chartSkeleton}>
                    <RevenueBreakdownChart data={revenueBreakdown} currency={currency} />
                  </Suspense>
                </div>
              ))
            }
          </div>
        </div>

        {/* Account footer — who is logged in (from /auth/me, no platform call) */}
        {account?.full_name && (
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <Gift size={13} />
            {account.full_name}{account.email ? ` · ${account.email}` : ''}
          </p>
        )}
      </DashboardPage>

      {/* Centered popups for every quick action (member/staff/check-in/today/payment/expense) */}
      <QuickActionModals action={action} onClose={() => setAction(null)} />
    </div>
  );
}
