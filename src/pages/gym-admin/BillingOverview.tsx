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
const BILLING_TABS = ['Overview', 'Payments', 'Recurring', 'Discounts', 'Payment Forms', 'Accounting', 'Debts', 'Growth', 'Settings'] as const;
type BillingTab = typeof BILLING_TABS[number];

const TAB_LABELS: Record<BillingTab, { en: string; ar: string }> = {
  Overview: { en: 'Overview', ar: 'نظرة عامة' },
  Payments: { en: 'Payments', ar: 'المدفوعات' },
  Recurring: { en: 'Recurring', ar: 'المتكررة' },
  Discounts: { en: 'Discounts', ar: 'الخصومات' },
  'Payment Forms': { en: 'Payment Forms', ar: 'نماذج الدفع' },
  Accounting: { en: 'Accounting', ar: 'المحاسبة' },
  Debts: { en: 'Debts', ar: 'الديون' },
  Growth: { en: 'Growth', ar: 'النمو' },
  Settings: { en: 'Settings', ar: 'الإعدادات' },
};

const TAB_ICONS: Record<BillingTab, string> = {
  Overview: 'dashboard',
  Payments: 'receipt_long',
  Recurring: 'autorenew',
  Discounts: 'sell',
  'Payment Forms': 'credit_card',
  Accounting: 'account_balance',
  Debts: 'account_balance_wallet',
  Growth: 'trending_up',
  Settings: 'settings',
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
  const [page, setPage] = useState(1);

  const money = (v: number | undefined | null) =>
    formatMoney(Number(v || 0), gymProfile?.currency);

  // Overview + Payments share the payments feed
  const { data: paymentsRes, isLoading: paymentsLoading } = useApiQuery<{ data: any[]; pagination: any; stats?: any }>(
    ['billing-payments', String(page)],
    () => listPayments(page),
    { enabled: activeTab === 'Overview' || activeTab === 'Payments' },
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

  const pagination: any = paymentsRes?.pagination || {};
  const totalPages: number = pagination.total_pages || 1;

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

  const renderPayments = () => (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-gray-900">{rtl ? 'سجل المدفوعات' : 'Payments Log'}</h3>
        <span className="text-xs text-gray-400">
          {pagination.total ? `${pagination.total} ${rtl ? 'عملية' : 'records'}` : ''}
        </span>
      </div>

      {paymentsLoading ? (
        <PageLoader />
      ) : payments.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <span className="material-symbols-outlined text-4xl block mb-2">receipt_long</span>
          <p className="text-sm">{rtl ? 'لا توجد مدفوعات' : 'No payments yet'}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 px-3 text-start font-medium">{rtl ? 'العضو' : 'Member'}</th>
                  <th className="py-2 px-3 text-start font-medium">{rtl ? 'الوصف' : 'Description'}</th>
                  <th className="py-2 px-3 text-start font-medium">{rtl ? 'التاريخ' : 'Date'}</th>
                  <th className="py-2 px-3 text-start font-medium">{rtl ? 'طريقة الدفع' : 'Method'}</th>
                  <th className="py-2 px-3 text-end font-medium">{rtl ? 'المبلغ' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any, i: number) => (
                  <tr key={p.id || i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="py-2.5 px-3 font-medium text-gray-900">{p.member_name || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-500">{p.description || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                    <td className="py-2.5 px-3 text-gray-500">
                      {p.payment_method
                        ? ({ cash: rtl ? 'نقدًا' : 'Cash', card: rtl ? 'بطاقة' : 'Card', bank: rtl ? 'بنك' : 'Bank', wallet: rtl ? 'محفظة' : 'Wallet' } as Record<string, string>)[p.payment_method] || p.payment_method
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-end font-bold text-gray-900">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setPage((v) => Math.max(1, v - 1))}
                disabled={page <= 1}
                className="px-4 py-1.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200"
              >
                {rtl ? 'السابق' : 'Prev'}
              </button>
              <span className="text-xs text-gray-500">
                {rtl ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
              </span>
              <button
                onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
                disabled={page >= totalPages}
                className="px-4 py-1.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200"
              >
                {rtl ? 'التالي' : 'Next'}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
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
          { key: 'sales', label: rtl ? 'مبيعات الشهر' : 'Monthly Sales', value: money(summary.monthly_sales), icon: 'shopping_cart', color: 'info' },
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

  const renderPlaceholder = (tab: BillingTab) => (
    <Card className="p-12 text-center">
      <span className="material-symbols-outlined text-5xl text-gray-500/30 block mb-3">
        {TAB_ICONS[tab]}
      </span>
      <p className="text-gray-500 font-medium">{rtl ? TAB_LABELS[tab].ar : TAB_LABELS[tab].en}</p>
      <p className="text-sm text-gray-500/60 mt-1">{rtl ? 'قيد التطوير' : 'Coming soon'}</p>
    </Card>
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
      {activeTab === 'Payments' && renderPayments()}
      {activeTab === 'Recurring' && renderRecurring()}
      {activeTab === 'Accounting' && renderAccounting()}
      {activeTab === 'Debts' && <DebtsPanel />}
      {['Discounts', 'Payment Forms', 'Growth', 'Settings'].includes(activeTab) && renderPlaceholder(activeTab)}
    </div>
  );
}
