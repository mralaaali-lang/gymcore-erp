import { useState } from 'react';
import { formatDate } from '../../utils/date';
import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/GymBrandContext';
import { useSetupProgress } from '../../hooks/useGymDashboard';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getEnrollmentTrend, getPeakHours, getRevenueBreakdown, getBusinessMetrics } from '../../services/analytics';
import {
  listMembers, getFinanceSummary, listLeads,
  getExpiringSoon, getInactiveMembers, getOverdueDebts,
} from '../../services/api';
import { formatMoney } from '../../utils/currency';
import {
  Gift, Plus, TrendingUp, Users, DollarSign, Clock, AlertTriangle, UserX, UserPlus,
  ChevronLeft, CreditCard, Wallet, ShoppingCart, BarChart3, Banknote, DoorOpen,
} from 'lucide-react';
import { StatCard, Panel, Banner, DashboardPage, PrimaryAction } from '../../components/dashboard';
import { QuickActionModals, type ActionKey } from '../../components/dashboard/QuickActionCenter';
import CheckInCard from '../../components/attendance/CheckInCard';

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

/** §35ت — one interactive action card (icon + label, opens a modal or a page). */
function QuickCard({
  icon: Icon,
  label,
  accent,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  accent: 'emerald' | 'rose' | 'amber' | 'violet' | 'sky';
  onClick: () => void;
}) {
  const soft: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    sky: 'bg-sky-50 text-sky-600',
  };
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex flex-col items-center justify-center gap-2 min-h-[96px] hover:shadow-md hover:border-gray-200 transition-all active:scale-[0.98] cursor-pointer"
    >
      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${soft[accent]}`}>
        <Icon size={22} strokeWidth={1.75} />
      </span>
      <span className="text-sm font-bold text-gray-900 text-center leading-tight">{label}</span>
    </button>
  );
}

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
  // §34أ — money KPIs, all server-computed from member_subscriptions.
  const { data: biz } = useApiQuery(
    ['analytics', 'business-metrics'],
    async () => (await getBusinessMetrics()).data,
    { staleTime: 5 * 60_000 }
  );

  // ── Real data sources (no hardcoded KPIs) ──
  const { data: membersRes } = useApiQuery(
    ['gym', 'members', 'summary'],
    () => listMembers({ limit: 200 }),
    { staleTime: 60_000 }
  );
  const { data: financeRes } = useApiQuery(['gym', 'finance', 'summary'], getFinanceSummary, { staleTime: 60_000 });
  // §35ت — attendance numbers moved into CheckInCard (same query key), so this
  // page no longer fetches /attendance/today itself.

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

  const totalMembers = membersRes?.total ?? 0;
  const fin = financeRes?.data;
  const monthlyRevenue = Number(fin?.monthly_revenue ?? 0);
  const todayRevenue = Number(fin?.today_revenue ?? 0);

  // Hide charts that would render as an empty frame (§24).
  const hasPeakData = (peakHours ?? []).some((h) => h.check_ins > 0);
  const hasRevenueData = !!revenueBreakdown
    && (revenueBreakdown.memberships + revenueBreakdown.pos + revenueBreakdown.personal_training) > 0;

  const daysWord = (n: number) => language === 'ar' ? `${n} يوم` : `${n}d`;

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

        {/* §35ت — four number cards first (each carries its sub-figure inside it),
            then the unified check-in card, then the six interactive actions.
            QuickActionBar is gone: these cards replace it entirely. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            icon={Users}
            label={t('dashboard.members', 'المشتركين')}
            value={String(totalMembers)}
            sub={biz ? `+${biz.new_this_month} ${t('dashboard.newThisMonth', 'جديد هذا الشهر')}` : undefined}
            accent="emerald"
            onClick={() => navigate('/admin/members')}
          />
          <StatCard
            icon={CreditCard}
            label={t('dashboard.subscriptions', 'الاشتراكات')}
            value={biz ? String(biz.active_members) : '—'}
            sub={`${expiring?.total ?? 0} ${t('dashboard.expiring7d', 'تنتهي خلال 7 أيام')}`}
            accent="violet"
            onClick={() => navigate('/admin/subscriptions')}
          />
          <StatCard
            icon={Wallet}
            label={t('dashboard.revenueTodayCard', 'إيراد اليوم')}
            value={formatMoney(todayRevenue, currency)}
            sub={`${formatMoney(monthlyRevenue, currency)} ${t('dashboard.monthlyShort', 'شهرياً')}`}
            accent="amber"
            onClick={() => navigate('/admin/reports')}
          />
          <StatCard
            icon={ShoppingCart}
            label={t('dashboard.sales', 'مبيعات')}
            value={formatMoney(Number(fin?.today_sales_sum ?? 0), currency)}
            sub={`${fin?.today_sales_count ?? 0} ${t('dashboard.ordersToday', 'طلب اليوم')}`}
            accent="sky"
            onClick={() => navigate('/admin/sales')}
          />
        </div>

        {/* §35ب — the unified check-in card (same component as the top of
            /admin/attendance — one source). §35ت: «حضور اليوم» lives inside it. */}
        <CheckInCard listTo="/admin/attendance" />

        {/* §35ت — the six daily actions, real endpoints/modals only (replaces QuickActionBar) */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5">
          <QuickCard
            icon={UserPlus}
            label={t('dashboard.newMember', 'مشترك جديد')}
            accent="emerald"
            onClick={() => setAction('member')}
          />
          <QuickCard
            icon={CreditCard}
            label={t('dashboard.newSubscription', 'اشتراك جديد')}
            accent="violet"
            onClick={() => navigate('/admin/subscriptions?new=1')}
          />
          <QuickCard
            icon={ShoppingCart}
            label={t('dashboard.sell', 'بيع')}
            accent="sky"
            onClick={() => navigate('/admin/sales')}
          />
          <QuickCard
            icon={Banknote}
            label={t('dashboard.payment', 'دفعة')}
            accent="amber"
            onClick={() => setAction('payment')}
          />
          <QuickCard
            icon={DoorOpen}
            label={t('dashboard.attendance', 'الحضور')}
            accent="rose"
            onClick={() => navigate('/admin/attendance')}
          />
          <QuickCard
            icon={BarChart3}
            label={t('dashboard.reports', 'التقارير')}
            accent="emerald"
            onClick={() => navigate('/admin/reports')}
          />
        </div>

        {/* ── Row 1b (§34أ): money KPIs — every figure server-computed from member_subscriptions ── */}
        {biz && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('dashboard.moneyKpis', 'مؤشرات الفلوس')}</h2>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
              <StatCard
                icon={DollarSign}
                label={t('dashboard.mrr', 'الإيراد الشهري المتكرر')}
                value={formatMoney(biz.mrr, currency)}
                trend={`${biz.active_members} ${t('dashboard.activeSubsShort', 'اشتراك نشط')}`}
                trendPositive
                accent="emerald"
                onClick={() => navigate('/admin/reports')}
              />
              <StatCard
                icon={Users}
                label={t('dashboard.arpu', 'متوسط إيراد العضو')}
                value={biz.arpu != null ? formatMoney(biz.arpu, currency) : '—'}
                accent="sky"
                onClick={() => navigate('/admin/members')}
              />
              <StatCard
                icon={UserX}
                label={t('dashboard.churnRate', 'نسبة التسرّب')}
                value={biz.churn_rate_pct != null ? `${biz.churn_rate_pct}%` : '—'}
                trend={biz.active_at_month_start > 0 ? `${biz.churned_this_month}/${biz.active_at_month_start}` : undefined}
                trendPositive={(biz.churn_rate_pct ?? 0) <= 0}
                accent="rose"
                onClick={() => navigate('/admin/reports')}
              />
              <StatCard
                icon={TrendingUp}
                label={t('dashboard.netGrowth', 'صافي النمو')}
                value={`${biz.net_growth > 0 ? '+' : ''}${biz.net_growth}`}
                trend={`+${biz.new_this_month} · −${biz.churned_this_month}`}
                trendPositive={biz.net_growth >= 0}
                accent="violet"
                onClick={() => navigate('/admin/members')}
              />
            </div>
          </div>
        )}

        {/* ── Row 2: today's tasks — action cards ── */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('dashboard.todaysTasks', 'مهام اليوم')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {/* §35ت — the «حضور اليوم» panel is gone: those numbers now live
                inside the CheckInCard at the top of the page (no duplication). */}
            <ActionCard
              icon={Clock}
              title={t('dashboard.expiringSoon', 'اشتراكات تنتهي خلال 7 أيام')}
              count={expiring?.total ?? 0}
              accent="amber"
              to="/admin/subscriptions?status=ending_soon"
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
