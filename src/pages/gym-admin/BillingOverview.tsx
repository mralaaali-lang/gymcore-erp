import { useEffect, useState } from 'react';
import { formatDate, fmtNum } from '../../utils/date';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { formatMoney } from '../../utils/currency';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listPayments, getFinanceSummary, listExpenses, listCashboxSessions, listOffers } from '../../services/api';
import StatsGrid from '../../components/shared/StatsGrid';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';
import DebtsPanel from './billing/DebtsPanel';

// §26: DebtsPage merged in as the "Debts" tab; ?tab= deep links keep the old
// /admin/debts URL working through a redirect.
// §34ج — Discounts/Payment Forms/Growth/Settings removed: they only rendered
// a "قيد التطوير" card; they return when real screens exist.
// §43 — the Payments tab was removed: المدفوعات now has its own full screen
// at /admin/payments (PaymentsPage) with filters + summary cards + PDF.
const BILLING_TABS = ['Overview', 'Recurring', 'Accounting', 'Debts'] as const;
type BillingTab = typeof BILLING_TABS[number];

const TAB_LABELS: Record<BillingTab, { en: string; ar: string }> = {
  Overview: { en: 'Overview', ar: 'نظرة عامة' },
  Recurring: { en: 'Recurring', ar: 'المتكررة' },
  Accounting: { en: 'Accounting', ar: 'المحاسبة' },
  Debts: { en: 'Debts', ar: 'الديون' },
};

const TAB_ICONS: Record<BillingTab, string> = {
  Overview: 'dashboard',
  Recurring: 'autorenew',
  Accounting: 'account_balance',
  Debts: 'account_balance_wallet',
};

// §34هـ: month labels are ISO (2026-10), never names, in both languages.
function isoMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function BillingOverview() {
  const { language, gymProfile } = useApp();
  const rtl = language === 'ar';
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const [activeTab, setActiveTabState] = useState<BillingTab>(
    requestedTab && (BILLING_TABS as readonly string[]).includes(requestedTab)
      ? (requestedTab as BillingTab)
      : 'Overview',
  );
  // Keep in sync when arriving via /admin/debts redirect with the page already
  // mounted (same route, different ?tab).
  useEffect(() => {
    if (requestedTab && (BILLING_TABS as readonly string[]).includes(requestedTab)) {
      setActiveTabState(requestedTab as BillingTab);
    }
  }, [requestedTab]);
  const setActiveTab = (tab: BillingTab) => {
    setActiveTabState(tab);
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  };

  const money = (v: number | undefined | null) =>
    formatMoney(Number(v || 0), gymProfile?.currency);

  // Overview keeps the recent-payments feed (the Payments tab is now the
  // dedicated /admin/payments screen — §43).
  const { data: paymentsRes, isLoading: paymentsLoading } = useApiQuery<{ data: any[]; pagination: any; stats?: any }>(
    ['billing-payments'],
    () => listPayments(),
    { enabled: activeTab === 'Overview' },
  );
  const { data: summaryRes, isLoading: summaryLoading } = useApiQuery<any>(
    ['billing-summary'],
    () => getFinanceSummary(),
    { enabled: activeTab === 'Overview' || activeTab === 'Accounting' },
  );
  const { data: offersRes, isLoading: offersLoading } = useApiQuery<{ data: any[] }>(
    ['billing-offers'],
    () => listOffers(),
    { enabled: activeTab === 'Recurring' },
  );
  const { data: expensesRes, isLoading: expensesLoading } = useApiQuery<{ data: any[] }>(
    ['billing-expenses'],
    () => listExpenses(),
    { enabled: activeTab === 'Accounting' },
  );
  const { data: cashboxRes, isLoading: cashboxLoading } = useApiQuery<{ data: any[] }>(
    ['billing-cashbox'],
    () => listCashboxSessions(),
    { enabled: activeTab === 'Accounting' },
  );

  const payments = paymentsRes?.data || [];
  const summary = summaryRes?.data || {};
  const offers = offersRes?.data || [];
  const expenses = expensesRes?.data || [];
  const cashboxSessions = cashboxRes?.data || [];
  const latestSession = cashboxSessions[0];
  const monthlyRevenue = summary.monthly_revenue ?? 0;

  // §34ث: counters come from SERVER aggregates over ALL payment rows —
  // the old code counted the current 20-row page slice and filtered a
  // `status` column that financial_transactions does not even have.
  const payStats = paymentsRes?.stats || {};

  const fmtDate = (v?: string) => {
    if (!v) return '-';
    try {
      return formatDate(v);
    } catch {
      return '-';
    }
  };

  const renderOverview = () => (
    <div className="space-y-5">
      <StatsGrid
        columns={3}
        stats={[
          { key: 'monthcount', label: rtl ? 'مدفوعات هذا الشهر' : 'Payments this month', value: fmtNum(Number(payStats.month_count || 0)), icon: 'schedule', color: 'info' },
          { key: 'monthsum', label: rtl ? 'إيراد مدفوعات الشهر' : 'Payment revenue', value: money(payStats.month_sum), icon: 'check_circle', color: 'primary' },
          { key: 'totalsum', label: rtl ? 'إجمالي المدفوعات' : 'All-time payments', value: money(payStats.total_sum), icon: 'account_balance', color: 'secondary' },
        ]}
      />

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">{rtl ? 'الإيرادات الشهرية' : 'Monthly Revenue'}</h3>
            <p className="text-xs text-gray-500 mt-1">{isoMonth()}</p>
          </div>
          {summaryLoading ? (
            <span className="material-symbols-outlined text-2xl text-gray-300 animate-spin">progress_activity</span>
          ) : (
            <p className="text-2xl font-extrabold text-emerald-600">{money(monthlyRevenue)}</p>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'آخر المدفوعات' : 'Recent Payments'}</h3>
        {paymentsLoading ? (
          <PageLoader />
        ) : payments.length > 0 ? (
          <div className="space-y-2">
            {payments.slice(0, 5).map((p: any, i: number) => (
              <div key={p.id || i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.member_name || p.description || '-'}</p>
                  <p className="text-xs text-gray-500">{fmtDate(p.created_at)}{p.description && p.member_name ? ` · ${p.description}` : ''}</p>
                </div>
                <span className="text-sm font-bold text-emerald-600">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <span className="material-symbols-outlined text-4xl block mb-2">payments</span>
            <p className="text-sm">{rtl ? 'لا توجد مدفوعات حديثة' : 'No recent payments'}</p>
          </div>
        )}
      </Card>
    </div>
  );

  const renderRecurring = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-bold text-gray-900">
          {rtl ? 'باقات العضوية النشطة (مصدر واحد: membership_offers)' : 'Active membership plans (single source: membership_offers)'}
        </h3>
        <button
          onClick={() => navigate('/admin/plans')}
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
        >
          {rtl ? 'إدارة الباقات' : 'Manage plans'}
        </button>
      </div>
      {offersLoading ? (
        <Card><PageLoader /></Card>
      ) : offers.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">
          <span className="material-symbols-outlined text-4xl block mb-2">autorenew</span>
          <p className="text-sm">{rtl ? 'لا توجد باقات معرفة' : 'No membership plans defined'}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {offers.map((offer: any) => (
            <Card key={offer.id}>
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-base font-bold text-gray-900">{offer.title}</h4>
                <StatusBadge
                  status={offer.is_active ? (rtl ? 'مفعلة' : 'Active') : (rtl ? 'متوقفة' : 'Inactive')}
                  variant={offer.is_active ? 'success' : 'neutral'}
                />
              </div>
              <p className="text-2xl font-extrabold text-emerald-600">
                {money(Number(offer.price))}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {fmtNum(offer.duration_days)} {rtl ? 'يوم' : 'days'}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderAccounting = () => (
    <div className="space-y-5">
      <StatsGrid
        columns={4}
        stats={[
          { key: 'revenue', label: rtl ? 'إيرادات الشهر' : 'Monthly Revenue', value: money(summary.monthly_revenue), icon: 'trending_up', color: 'primary' },
          { key: 'expenses', label: rtl ? 'مصاريف الشهر' : 'Monthly Expenses', value: money(summary.monthly_expenses), icon: 'payments', color: 'error' },
          { key: 'debts', label: rtl ? 'ديون قائمة' : 'Outstanding Debts', value: money(summary.outstanding_debts), icon: 'account_balance_wallet', color: 'warning' },
          { key: 'sales', label: rtl ? 'مبيعات الشهر' : 'Monthly Sales', value: money(Number(summary.monthly_sales_sum)), icon: 'shopping_cart', color: 'info' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'آخر جلسة صندوق' : 'Latest Cashbox Session'}</h3>
          {cashboxLoading ? (
            <PageLoader />
          ) : !latestSession ? (
            <div className="text-center py-8 text-gray-500">
              <span className="material-symbols-outlined text-4xl block mb-2">point_of_sale</span>
              <p className="text-sm">{rtl ? 'لا توجد جلسات صندوق' : 'No cashbox sessions'}</p>
            </div>
          ) : (
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{rtl ? 'الرصيد الافتتاحي' : 'Opening balance'}</span>
                <span className="font-medium text-gray-900">{money(latestSession.opening_balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{rtl ? 'الرصيد الختامي' : 'Closing balance'}</span>
                <span className="font-medium text-gray-900">{latestSession.closing_balance != null ? money(latestSession.closing_balance) : (rtl ? 'الجلسة مفتوحة' : 'Session open')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{rtl ? 'الافتتاح' : 'Opened at'}</span>
                <span className="font-medium text-gray-900">{fmtDate(latestSession.opened_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{rtl ? 'الإغلاق' : 'Closed at'}</span>
                <span className="font-medium text-gray-900">{latestSession.closed_at ? fmtDate(latestSession.closed_at) : (rtl ? '—' : '—')}</span>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'آخر المصاريف' : 'Recent Expenses'}</h3>
          {expensesLoading ? (
            <PageLoader />
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <span className="material-symbols-outlined text-4xl block mb-2">receipt</span>
              <p className="text-sm">{rtl ? 'لا توجد مصاريف مسجلة' : 'No expenses recorded'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expenses.slice(0, 5).map((e: any, i: number) => (
                <div key={e.id || i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{e.description || '-'}</p>
                    <p className="text-xs text-gray-500">{fmtDate(e.created_at)}</p>
                  </div>
                  <span className="text-sm font-bold text-red-500">-{money(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
      {/* §35ث — heading moved to the top bar */}

      <UnifiedTabs
        tabs={BILLING_TABS.map((tab) => ({
          key: tab,
          labelAr: TAB_LABELS[tab].ar,
          labelEn: TAB_LABELS[tab].en,
          icon: TAB_ICONS[tab],
        }))}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as BillingTab)}
      />

      {activeTab === 'Overview' && renderOverview()}
      {activeTab === 'Recurring' && renderRecurring()}
      {activeTab === 'Accounting' && renderAccounting()}
      {activeTab === 'Debts' && <DebtsPanel />}
    </div>
  );
}
