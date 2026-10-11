// ── Platform Reports — Refactored with Shared Components & Phosphor Icons ──
import { useState, useMemo } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useQuery } from '@tanstack/react-query';
import { getReportsOverview, listPlatformGyms, getRevenueTrend, getOverduePayments } from '../../services/api';
import Chart from '../../components/charts/Chart';
import RevenueReport from './reports/RevenueReport';
import {
  TrendUp, Buildings, Users, CurrencyDollar, Pulse,
  Download, ArrowsClockwise, CreditCard, Wallet, Target,
  CaretUp, CaretDown,
} from '@phosphor-icons/react';
import PageHeader from '../../components/shared/PageHeader';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import { formatCurrency, formatNumber, tr } from './superAdminUtils';

const COLORS = ['#10b981', '#059669', '#f97316', '#22c55e', '#8b5cf6', '#ef4444'];
const PIE_COLORS = ['#114b5f', '#22c55e', '#10b981', '#8b5cf6'];

type TabKey = 'overview' | 'revenue' | 'gyms' | 'members' | 'advanced';

const tabs = [
  { key: 'overview' as TabKey, labelAr: 'نظرة عامة', labelEn: 'Overview', icon: 'bar_chart' },
  { key: 'revenue' as TabKey, labelAr: 'الإيرادات', labelEn: 'Revenue', icon: 'trending_up' },
  { key: 'gyms' as TabKey, labelAr: 'الصالات', labelEn: 'Gyms', icon: 'business' },
  { key: 'members' as TabKey, labelAr: 'الأعضاء', labelEn: 'Members', icon: 'group' },
  { key: 'advanced' as TabKey, labelAr: 'متقدم', labelEn: 'Advanced', icon: 'analytics' },
];

function StatCard({ icon: Icon, label, value, sub, trend, color = '#10b981' }: {
  icon: React.ElementType; label: string; value: string; sub?: string; trend?: 'up' | 'down'; color?: string;
}) {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-5 md:p-6 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15` }}>
          <Icon size={22} color={color} />
        </div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">{value}</p>
      {sub && (
        <div className="flex items-center gap-1 mt-1.5 text-xs">
          {trend === 'up' && <CaretUp size={12} className="text-green-600" />}
          {trend === 'down' && <CaretDown size={12} className="text-red-600" />}
          <span className="text-gray-500">{sub}</span>
        </div>
      )}
    </div>
  );
}

export default function PlatformReports() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const T = (en: string, ar: string) => tr(isRtl, en, ar);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const { data: overviewData, isLoading: overviewLoading, refetch: refetchOverview } = useQuery({
    queryKey: ['reports-overview'],
    queryFn: getReportsOverview,
    refetchInterval: 120000,
  });

  const { data: gymsData } = useQuery({
    queryKey: ['platform', 'gyms'],
    queryFn: listPlatformGyms,
    staleTime: 30000,
  });

  const overview = overviewData?.data;
  const gyms = gymsData?.data ?? [];

  const planDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const g of gyms) {
      dist[g.plan_tier] = (dist[g.plan_tier] || 0) + 1;
    }
    return Object.entries(dist).map(([name, value]) => ({ name, value }));
  }, [gyms]);

  const [period, setPeriod] = useState(12);
  const { data: revenueData, isLoading: revenueLoading, refetch: refetchRevenue } = useQuery({
    queryKey: ['reports', 'revenue-trend', period],
    queryFn: () => getRevenueTrend(period, true),
    staleTime: 60000,
  });
  const { data: overdueData } = useQuery({
    queryKey: ['reports', 'overdue-payments'],
    queryFn: () => getOverduePayments(30),
    staleTime: 60000,
  });

  if (overviewLoading) {
    return <PageLoader variant="skeleton" rows={6} fullPage />;
  }

  // ── Export CSV ──
  const handleExportCSV = () => {
    const rows = [['Metric', 'Value']];
    if (overview) {
      rows.push(['Total Gyms', String(overview.gyms.total_gyms)]);
      rows.push(['Active Gyms', String(overview.gyms.active_gyms)]);
      rows.push(['Total Members', String(overview.members.total_members)]);
      rows.push(['Active Members', String(overview.members.active_members)]);
      rows.push(['Paid Revenue', String(overview.revenue.paid_total)]);
      rows.push(['MRR', String(overview.mrr)]);
      rows.push(['ARR', String(overview.arr)]);
    }
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gymcore-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ── Render: Overview ──
  const renderOverview = () => {
    if (!overview) return null;
    const { gyms: g, members: m, revenue: r, mrr, arr } = overview;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Buildings} label={T('Total Gyms', 'إجمالي الصالات')} value={String(g.total_gyms)}
            sub={`${g.active_gyms} ${T('active', 'نشط')} / ${g.suspended_gyms} ${T('suspended', 'موقوف')}`} trend="up" color="#0ea5e9" />
          <StatCard icon={Users} label={T('Total Members', 'إجمالي الأعضاء')} value={formatNumber(m.total_members)}
            sub={`+${m.new_this_month} ${T('this month', 'هذا الشهر')}`} trend="up" color="#22c55e" />
          <StatCard icon={CurrencyDollar} label={T('Monthly Revenue (MRR)', 'العائد الشهري (MRR)')} value={formatCurrency(mrr)} color="#10b981" />
          <StatCard icon={TrendUp} label={T('Annual Revenue (ARR)', 'العائد السنوي (ARR)')} value={formatCurrency(arr)} color="#8b5cf6" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Invoice Summary */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">{T('Invoice Summary', 'ملخص الفواتير')}</h3>
            <div className="space-y-3">
              {[
                { label: T('Paid', 'مدفوعة'), value: r.paid_total, count: r.paid_invoices, color: 'text-green-600' },
                { label: T('Pending', 'معلقة'), value: r.pending_total, count: r.pending_invoices, color: 'text-amber-600' },
                { label: T('Overdue', 'متأخرة'), value: 0, count: r.overdue_invoices, color: 'text-red-600' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.color.replace('text-', 'bg-')}`} />
                    <span className="text-sm text-gray-500">{item.label}</span>
                  </div>
                  <div className="text-end">
                    <p className={`text-sm font-bold ${item.color}`}>{formatCurrency(item.value)}</p>
                    <p className="text-xs text-gray-500/60">{item.count} {T('invoices', 'فاتورة')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Plan Distribution */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">{T('Plan Distribution', 'توزيع الباقات')}</h3>
            <div className="h-48">
              <Chart type="donut" height={192} series={planDistribution.map(d => d.value)}
                categories={planDistribution.map(d => d.name)} colors={PIE_COLORS} showLegend />
            </div>
          </div>

          {/* Staff Overview */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">{T('Staff Overview', 'فريق العمل')}</h3>
            <div className="space-y-3">
              {[
                { label: T('Managers', 'المدراء'), value: overview.staff.managers },
                { label: T('Trainers', 'المدربين'), value: overview.staff.coaches },
                { label: T('Reception', 'الاستقبال'), value: overview.staff.receptionists },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between p-2.5 rounded-2xl bg-gray-50">
                  <span className="text-sm text-gray-500">{s.label}</span>
                  <span className="text-sm font-bold text-gray-900">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly Gyms Chart */}
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">{T('Gym Growth (Last 12 Months)', 'نمو الصالات (آخر 12 شهر)')}</h3>
          <div className="h-56">
            <Chart type="bar" height={224}
              categories={overview.monthly_gyms.map((d: any) => d.month)}
              series={[{ name: T('Gyms', 'صالات'), data: overview.monthly_gyms.map((d: any) => d.count) }]}
              colors={['#114b5f']} barRadius={4} />
          </div>
        </div>
      </div>
    );
  };

  // ── Render: Revenue ──
  const renderRevenue = () => {
    if (!overview) return null;
    const { revenue: r, monthly_revenue, mrr, arr } = overview;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={CurrencyDollar} label={T('Total Revenue', 'إجمالي الإيرادات')} value={formatCurrency(r.paid_total)} color="#22c55e" />
          <StatCard icon={CreditCard} label={T('Paid Invoices', 'الفواتير المدفوعة')} value={String(r.paid_invoices)}
            sub={`${T('out of', 'من أصل')} ${r.total_invoices}`} color="#0ea5e9" />
          <StatCard icon={Wallet} label="MRR" value={formatCurrency(mrr)} color="#10b981" />
          <StatCard icon={Target} label="ARR" value={formatCurrency(arr)} color="#8b5cf6" />
        </div>

        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">{T('Monthly Revenue Trend', 'الإيرادات الشهرية')}</h3>
          <div className="h-64">
            <Chart type="line" height={256}
              categories={monthly_revenue.map((d: any) => d.month)}
              series={[
                { name: T('Paid', 'مدفوع'), data: monthly_revenue.map((d: any) => d.paid_amount) },
                { name: T('Total', 'الإجمالي'), data: monthly_revenue.map((d: any) => d.total_amount) },
              ]}
              colors={['#22c55e', '#114b5f']} showLegend />
          </div>
        </div>

        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">{T('Invoice Status', 'حالة الفواتير')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: T('Paid', 'مدفوعة'), amount: r.paid_total, count: r.paid_invoices, pct: r.total_invoices ? Math.round(r.paid_invoices / r.total_invoices * 100) : 0, color: 'bg-green-500' },
              { label: T('Pending', 'معلقة'), amount: r.pending_total, count: r.pending_invoices, pct: r.total_invoices ? Math.round(r.pending_invoices / r.total_invoices * 100) : 0, color: 'bg-amber-500' },
              { label: T('Overdue', 'متأخرة'), amount: 0, count: r.overdue_invoices, pct: r.total_invoices ? Math.round(r.overdue_invoices / r.total_invoices * 100) : 0, color: 'bg-red-500' },
            ].map((item) => (
              <div key={item.label} className="p-4 rounded-xl border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-500">{item.label}</span>
                  <span className="text-xs text-gray-500/60">{item.count} {T('invoices', 'فاتورة')}</span>
                </div>
                <p className="text-xl font-bold text-gray-900 mb-2">{formatCurrency(item.amount)}</p>
                <div className="w-full bg-gray-50 rounded-full h-2">
                  <div className={`${item.color} h-2 rounded-full transition-all`} style={{ width: `${item.pct}%` }} />
                </div>
                <p className="text-xs text-gray-500/60 mt-1">{item.pct}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── Render: Gyms ──
  const renderGyms = () => {
    if (!overview) return null;
    const { gyms: g, gyms_by_currency } = overview;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Buildings} label={T('Total Gyms', 'إجمالي الصالات')} value={String(g.total_gyms)} color="#0ea5e9" />
          <StatCard icon={Pulse} label={T('Active Gyms', 'الصالات النشطة')} value={String(g.active_gyms)}
            sub={`${Math.round(g.active_gyms / g.total_gyms * 100)}% ${T('of total', 'من الإجمالي')}`} trend="up" color="#22c55e" />
          <StatCard icon={Users} label={T('Avg Members/Gym', 'متوسط الأعضاء لكل صالة')}
            value={String(g.active_gyms ? Math.round(overview.members.active_members / g.active_gyms) : 0)} color="#10b981" />
          <StatCard icon={TrendUp} label={T('Activity Rate', 'معدل النشاط')} value={`${Math.round(g.active_gyms / g.total_gyms * 100)}%`} color="#8b5cf6" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">{T('Plan Distribution', 'توزيع الباقات')}</h3>
            <div className="space-y-3">
              {[
                { label: T('Basic', 'أساسي'), count: g.basic_plan, pct: g.total_gyms ? Math.round(g.basic_plan / g.total_gyms * 100) : 0, color: 'bg-blue-500' },
                { label: T('Premium', 'ممتاز'), count: g.premium_plan, pct: g.total_gyms ? Math.round(g.premium_plan / g.total_gyms * 100) : 0, color: 'bg-green-500' },
                { label: T('Enterprise', 'مؤسسات'), count: g.enterprise_plan, pct: g.total_gyms ? Math.round(g.enterprise_plan / g.total_gyms * 100) : 0, color: 'bg-purple-500' },
              ].map((plan) => (
                <div key={plan.label} className="p-3 rounded-2xl bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500">{plan.label}</span>
                    <span className="text-sm font-bold text-gray-900">{plan.count}</span>
                  </div>
                  <div className="w-full bg-white rounded-full h-2.5">
                    <div className={`${plan.color} h-2.5 rounded-full transition-all`} style={{ width: `${plan.pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-500/60 mt-1">{plan.pct}%</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">{T('Currency Distribution', 'توزيع العملات')}</h3>
            <div className="h-48">
              <Chart type="pie" height={192} series={gyms_by_currency.map((d: any) => d.count)}
                categories={gyms_by_currency.map((d: any) => d.currency)} colors={COLORS} showLegend />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Render: Members ──
  const renderMembers = () => {
    if (!overview) return null;
    const { members: m } = overview;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label={T('Total Members', 'إجمالي الأعضاء')} value={formatNumber(m.total_members)} color="#0ea5e9" />
          <StatCard icon={Pulse} label={T('Active Members', 'الأعضاء النشطين')} value={formatNumber(m.active_members)} trend="up" color="#22c55e" />
          <StatCard icon={TrendUp} label={T('New This Month', 'جدد هذا الشهر')} value={String(m.new_this_month)} trend="up" color="#10b981" />
          <StatCard icon={Buildings} label={T('Avg per Gym', 'متوسط لكل صالة')}
            value={String(overview.gyms.active_gyms ? Math.round(m.active_members / overview.gyms.active_gyms) : 0)} color="#8b5cf6" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">{T('Activity Rate', 'معدل النشاط')}</h3>
            <div className="flex items-center justify-center h-48">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                  <circle cx="60" cy="60" r="54" fill="none" stroke="#22c55e" strokeWidth="8"
                    strokeDasharray={`${m.total_members ? (m.active_members / m.total_members) * 339.292 : 0} 339.292`}
                    strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900">{m.total_members ? Math.round(m.active_members / m.total_members * 100) : 0}%</p>
                    <p className="text-xs text-gray-500/60">{T('Active', 'نشط')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">{T('Quick Stats', 'إحصائيات سريعة')}</h3>
            <div className="space-y-4">
              {[
                { label: T('Total Gyms', 'إجمالي الصالات'), value: String(overview.gyms.total_gyms), icon: Buildings, color: '#0ea5e9' },
                { label: T('Total Staff', 'إجمالي الموظفين'), value: String(overview.staff.total_staff), icon: Users, color: '#22c55e' },
                { label: T('Members per Gym', 'نسبة الأعضاء لكل صالة'), value: String(overview.gyms.active_gyms ? Math.round(m.active_members / overview.gyms.active_gyms) : 0), icon: Pulse, color: '#10b981' },
                { label: T('New Members/Month', 'الأعضاء الجدد هذا الشهر'), value: String(m.new_this_month), icon: TrendUp, color: '#8b5cf6' },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div style={{ color: stat.color }}>{<stat.icon size={16} />}</div>
                    <span className="text-sm text-gray-500">{stat.label}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Render: Advanced ──
  const renderAdvanced = () => (
    <div className="space-y-6">
      <RevenueReport
        data={revenueData?.data}
        isLoading={revenueLoading}
        period={period}
        onPeriodChange={setPeriod}
        onRefresh={refetchRevenue}
        t={T}
        formatCurrency={formatCurrency}
      />

      {overdueData?.data && (
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">{T('Overdue Payments', 'المدفوعات المتأخرة')}</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500/60">{T('Total Overdue', 'إجمالي')}</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(overdueData.data.total_overdue)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500/60">{T('Invoice Count', 'عدد الفواتير')}</p>
              <p className="text-lg font-bold text-gray-900">{overdueData.data.total_count}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500/60">{T('Avg Invoice', 'متوسط الفاتورة')}</p>
              <p className="text-lg font-bold text-gray-900">
                {overdueData.data.total_count > 0 ? formatCurrency(overdueData.data.total_overdue / overdueData.data.total_count) : 0}
              </p>
            </div>
          </div>
          {overdueData.data.aging_summary && Object.keys(overdueData.data.aging_summary).length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-xs font-bold text-gray-500 mb-2">{T('Aging Summary', 'توزيع الأعمار')}</h4>
              <div className="space-y-2">
                {Object.entries(overdueData.data.aging_summary).map(([bucket, amount]) => (
                  <div key={bucket} className="flex justify-between items-center text-xs">
                    <span className="text-gray-500/70">{bucket}</span>
                    <span className="font-bold text-red-600">{formatCurrency(amount as number)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 bg-gray-50 min-h-screen" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={T('Reports & Analytics', 'التقارير والتحليلات')}
        subtitle={T('Comprehensive platform statistics and reports', 'إحصائيات وتقارير شاملة عن المنصة')}
        icon="bar_chart"
        actions={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => refetchOverview()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-100 bg-gray-50 text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">
              <ArrowsClockwise size={16} />
              {T('Refresh', 'تحديث')}
            </button>
            <button type="button" onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary/90 transition-colors">
              <Download size={16} />
              {T('Export CSV', 'تصدير CSV')}
            </button>
          </div>
        }
      />

      <UnifiedTabs
        tabs={tabs}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabKey)}
        variant="pills"
        className="mb-6"
      />

      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'revenue' && renderRevenue()}
      {activeTab === 'gyms' && renderGyms()}
      {activeTab === 'members' && renderMembers()}
      {activeTab === 'advanced' && renderAdvanced()}
    </div>
  );
}


