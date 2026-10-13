import { useState } from 'react';
import { formatDate } from '../../utils/date';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  listBillingPlans, listInvoices,
  listCoupons, createCoupon, deleteCoupon,
  initiateFawryPayment,
  type BillingPlan, type BillingInvoice,
  type BillingCoupon,
} from '../../services/api';
import { FloppyDisk, Plus, X, MagnifyingGlass, CheckCircle, Calendar, Trash, ArrowSquareOut, Ticket, Bank } from '@phosphor-icons/react';
import PageLoader from '../../components/shared/PageLoader';
import PageHeader from '../../components/shared/PageHeader';
import UnifiedTabs from '../../components/shared/UnifiedTabs';

const CURRENCY_SYMBOL = 'ج.م';
const VAT_RATE = 0.14;

const statusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-700',
};

const statusLabels: Record<string, Record<string, string>> = {
  paid: { ar: 'مدفوع', en: 'Paid' },
  pending: { ar: 'معلق', en: 'Pending' },
  overdue: { ar: 'متأخر', en: 'Overdue' },
  cancelled: { ar: 'ملغي', en: 'Cancelled' },
};

type Tab = 'plans' | 'invoices' | 'coupons' | 'payments';

export default function BillingEngine() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';
  const t = (en: string, ar: string) => isRtl ? ar : en;

  const [activeTab, setActiveTab] = useState<Tab>('plans');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [invoiceSearch, setInvoiceSearch] = useState('');

  // ── Queries ──────────────────────────────────────────
  const plansQuery = useApiQuery(['billing-plans'], listBillingPlans, { staleTime: 30_000 });
  const invoicesQuery = useApiQuery(['billing-invoices'], () => listInvoices({ limit: 50 }), { staleTime: 15_000 });
  const couponsQuery = useApiQuery(['billing-coupons'], listCoupons, { staleTime: 15_000 });

  const plans: BillingPlan[] = plansQuery.data?.data ?? [];
  const invoices: BillingInvoice[] = invoicesQuery.data?.data ?? [];
  const coupons: BillingCoupon[] = couponsQuery.data?.data ?? [];

  // ── Coupon modal state ───────────────────────────────
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponDesc, setCouponDesc] = useState('');
  const [couponType, setCouponType] = useState<'percentage' | 'fixed'>('percentage');
  const [couponValue, setCouponValue] = useState(10);
  const [couponMaxUses, setCouponMaxUses] = useState(100);
  const [couponMaxDiscount, setCouponMaxDiscount] = useState(0);
  const [couponMinPlan, setCouponMinPlan] = useState('');
  const [couponValidUntil, setCouponValidUntil] = useState('');
  const [couponError, setCouponError] = useState('');

  // ── Fawry payment modal state ────────────────────────
  const [showFawryModal, setShowFawryModal] = useState(false);
  const [fawryInvoice, setFawryInvoice] = useState<BillingInvoice | null>(null);
  const [fawryResult, setFawryResult] = useState<{ ref: string; url: string } | null>(null);

  // ── Mutations ────────────────────────────────────────
  const createCouponMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createCoupon>[0]) => createCoupon(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-coupons'] });
      showToast(t('Coupon created', 'تم إنشاء الكوبون'), 'success');
      setShowCouponModal(false);
      resetCouponForm();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setCouponError(axiosErr?.response?.data?.error || t('Failed to create coupon', 'فشل إنشاء الكوبون'));
    },
  });

  const deleteCouponMutation = useMutation({
    mutationFn: (id: string) => deleteCoupon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-coupons'] });
      showToast(t('Coupon deleted', 'تم حذف الكوبون'), 'success');
    },
    onError: () => showToast(t('Failed to delete coupon', 'فشل حذف الكوبون'), 'error'),
  });

  const fawryMutation = useMutation({
    mutationFn: (payload: Parameters<typeof initiateFawryPayment>[0]) => initiateFawryPayment(payload),
    onSuccess: (res) => {
      setFawryResult({ ref: res.data.fawry_ref_number, url: res.data.payment_url });
      queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      showToast(t('Redirected to Fawry payment', 'تم تحويلك إلى بوابة الدفع فوري'), 'success');
    },
    onError: () => showToast(t('Failed to connect to Fawry', 'فشل الاتصال ببوابة فوري'), 'error'),
  });

  const resetCouponForm = () => {
    setCouponCode(''); setCouponDesc(''); setCouponType('percentage');
    setCouponValue(10); setCouponMaxUses(100); setCouponMaxDiscount(0);
    setCouponMinPlan(''); setCouponValidUntil(''); setCouponError('');
  };

  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    if (!couponCode || !couponValue) {
      setCouponError(t('Code and discount value are required', 'رمز الكوبون وقيمة الخصم مطلوبان'));
      return;
    }
    createCouponMutation.mutate({
      code: couponCode,
      discount_type: couponType,
      discount_value: couponValue,
      description: couponDesc || undefined,
      max_uses: couponMaxUses || undefined,
      max_discount_amount: couponType === 'percentage' && couponMaxDiscount > 0 ? couponMaxDiscount : undefined,
      min_plan_tier: couponMinPlan || undefined,
      valid_until: couponValidUntil || undefined,
    });
  };

  const handleFawryPayment = (invoice: BillingInvoice) => {
    setFawryInvoice(invoice);
    setFawryResult(null);
    setShowFawryModal(true);
    if (invoice.gym_id) {
      fawryMutation.mutate({ gym_id: invoice.gym_id, amount: invoice.amount, invoice_id: invoice.id });
    }
  };

  // Postgres numeric columns arrive as strings — coerce before math, otherwise
  // `amount + vat` becomes string concatenation ("1500.00210.00000000000003").
  const formatCurrency = (amount: number | string) => {
    const n = Number(amount) || 0;
    return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_SYMBOL}`;
  };

  const calcWithVAT = (amount: number | string) => {
    const base = Number(amount) || 0;
    const vat = base * VAT_RATE;
    return { subtotal: base, vat, total: base + vat };
  };

  const activeInvoices = invoices.filter((i) => !invoiceSearch || i.gym_name?.toLowerCase().includes(invoiceSearch.toLowerCase()));

  // ── Tab Definitions ──────────────────────────────────
  const tabs = [
    { key: 'plans' as Tab, labelAr: 'الباقات', labelEn: 'Plans', icon: 'credit-card' },
    { key: 'invoices' as Tab, labelAr: 'الفواتير', labelEn: 'Invoices', icon: 'receipt' },
    { key: 'coupons' as Tab, labelAr: 'كوبونات الخصم', labelEn: 'Coupons', icon: 'ticket' },
    { key: 'payments' as Tab, labelAr: 'بوابة الدفع', labelEn: 'Payments', icon: 'bank' },
  ];

  // ── Render: Plans ─────────────────────────────────────
  const renderPlans = () => (
    <div className="space-y-6">
      {/* Cycle Toggle */}
      <div className="flex items-center gap-3 bg-white rounded-3xl border shadow-sm border-gray-200 p-4 max-w-md">
        <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-gray-900' : 'text-gray-500'}`}>
          {t('Monthly', 'شهري')}
        </span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={billingCycle === 'yearly'}
            onChange={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
            className="sr-only peer" />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
        <span className={`text-sm font-medium ${billingCycle === 'yearly' ? 'text-gray-900' : 'text-gray-500'}`}>
          {t('Yearly', 'سنوي')}
        </span>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const rawPrice = billingCycle === 'monthly' ? plan.price_monthly : plan.price_yearly;
          const { subtotal, vat, total } = calcWithVAT(rawPrice);
          const features = Array.isArray(plan.features) ? plan.features : [];

          return (
            <div key={plan.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all">
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900">{isRtl ? plan.name_ar : plan.name}</h3>
                <div className="mt-4">
                  <span className="text-3xl font-bold text-primary">{formatCurrency(rawPrice)}</span>
                  <span className="text-sm text-gray-500 mr-1">
                    {billingCycle === 'monthly' ? (t('/mo', '/شهر')) : (t('/yr', '/سنة'))}
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {features.length > 0 && features.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle size={14} className="text-green-600 mt-0.5 shrink-0" weight="fill" />
                      <span className="text-gray-600">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-gray-100 px-6 py-3 bg-gray-50">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{t('Subtotal', 'المجموع')}: {formatCurrency(subtotal)}</span>
                  <span>{t('VAT 14%', 'ضريبة 14%')}: {formatCurrency(vat)}</span>
                </div>
                <div className="flex justify-between mt-1 text-sm font-bold text-gray-900">
                  <span>{t('Total', 'الإجمالي')}</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Render: Invoices ──────────────────────────────────
  const renderInvoices = () => (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3 bg-white rounded-3xl border shadow-sm border-gray-200 px-4 py-2.5 max-w-sm">
        <MagnifyingGlass size={18} className="text-gray-400" />
        <input
          type="text"
          value={invoiceSearch}
          onChange={(e) => setInvoiceSearch(e.target.value)}
          placeholder={t('Search by gym name...', 'بحث باسم الصالة...')}
          className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-400"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border shadow-sm border-gray-200 overflow-hidden">
        {invoicesQuery.isLoading ? (
          <PageLoader />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-gray-700 text-sm">
                  <th className="text-right p-4">{t('Gym', 'الصالة')}</th>
                  <th className="text-right p-4">{t('Plan', 'الباقة')}</th>
                  <th className="text-right p-4">{t('Amount', 'المبلغ')}</th>
                  <th className="text-right p-4">{t('VAT', 'الضريبة')}</th>
                  <th className="text-right p-4">{t('Status', 'الحالة')}</th>
                  <th className="text-right p-4">{t('Period', 'الفترة')}</th>
                  <th className="text-right p-4">{t('Actions', 'الإجراءات')}</th>
                </tr>
              </thead>
              <tbody>
                {activeInvoices.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-500">{t('No invoices', 'لا توجد فواتير')}</td></tr>
                )}
                {activeInvoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-4 text-gray-900 font-medium">{inv.gym_name}</td>
                    <td className="p-4 text-gray-500">{inv.plan_name || '—'}</td>
                    <td className="p-4 text-gray-900 font-mono">{formatCurrency(inv.amount)}</td>
                    <td className="p-4 text-gray-500 font-mono text-sm">{formatCurrency(inv.amount * VAT_RATE)}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[inv.status] || statusColors.pending}`}>
                        {statusLabels[inv.status]?.[isRtl ? 'ar' : 'en'] || inv.status}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 text-sm">
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                      </div>
                    </td>
                    <td className="p-4">
                      {inv.status === 'pending' && (
                        <button
                          type="button"
                          disabled={fawryMutation.isPending}
                          onClick={() => handleFawryPayment(inv)}
                          className="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {t('Pay via Fawry', 'دفع عبر فوري')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── Render: Coupons ──────────────────────────────────
  const renderCoupons = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          {t('{count} coupon(s)', `إجمالي ${coupons.length} كوبون`).replace('{count}', String(coupons.length))}
        </p>
        <button
          type="button"
          onClick={() => { resetCouponForm(); setShowCouponModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus size={18} />
          <span>{t('Add Coupon', 'إضافة كوبون')}</span>
        </button>
      </div>

      <div className="bg-white rounded-3xl border shadow-sm border-gray-200 overflow-hidden">
        {couponsQuery.isLoading ? (
          <PageLoader />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-gray-700 text-sm">
                  <th className="text-right p-4">{t('Code', 'الكود')}</th>
                  <th className="text-right p-4">{t('Description', 'الوصف')}</th>
                  <th className="text-right p-4">{t('Discount', 'الخصم')}</th>
                  <th className="text-right p-4">{t('Usage', 'الاستخدام')}</th>
                  <th className="text-right p-4">{t('Valid Until', 'صالح حتى')}</th>
                  <th className="text-right p-4">{t('Status', 'الحالة')}</th>
                  <th className="text-right p-4">{t('Actions', 'الإجراءات')}</th>
                </tr>
              </thead>
              <tbody>
                {coupons.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-500">{t('No coupons', 'لا توجد كوبونات')}</td></tr>
                )}
                {coupons.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-4">
                      <span className="font-mono font-bold text-gray-900 bg-gray-50 px-2 py-1 rounded">{c.code}</span>
                    </td>
                    <td className="p-4 text-gray-500 text-sm">{c.description || '-'}</td>
                    <td className="p-4 text-gray-900 font-mono">
                      {c.discount_type === 'percentage' ? `${c.discount_value}%` : formatCurrency(c.discount_value)}
                      {c.max_discount_amount && c.discount_type === 'percentage' ? ` (max ${formatCurrency(c.max_discount_amount)})` : ''}
                    </td>
                    <td className="p-4 text-gray-500 text-sm">{c.current_uses} / {c.max_uses}</td>
                    <td className="p-4 text-gray-500 text-sm">{c.valid_until ? formatDate(c.valid_until) : '—'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {c.is_active ? t('Active', 'نشط') : t('Inactive', 'غير نشط')}
                      </span>
                    </td>
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => { if (confirm(t(`Delete coupon ${c.code}?`, `حذف الكوبون ${c.code}؟`))) deleteCouponMutation.mutate(c.id); }}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── Render: Payments (Fawry) ──────────────────────────
  const renderPayments = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border shadow-sm border-gray-200 p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Bank size={22} className="text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{t('Fawry Payment Gateway', 'بوابة الدفع الإلكتروني — فوري')}</h3>
            <p className="text-sm text-gray-500">
              {t('Pay via Fawry — fastest payment method in Egypt', 'ادفع عبر فوري — أسرع وأسهل طريقة دفع في مصر')}
            </p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-600" weight="fill" />
            <span>{t('Accepts: mobile wallets, credit cards, Fawry Cash', 'مقبول: المحافظ الإلكترونية، بطاقات الائتمان، فوري كاش')}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-600" weight="fill" />
            <span>{t('Transaction fee: 2.5% + 1.50 EGP', 'رسوم المعاملة: 2.5% + 1.50 ج.م (قابلة للتعديل)')}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-600" weight="fill" />
            <span>{t('Settlement: within 24 business hours', 'التسوية: خلال 24 ساعة عمل')}</span>
          </div>
        </div>

        <p className="text-sm text-gray-500 mt-4">
          {t('To start a payment, go to the Invoices tab and click "Pay via Fawry" next to the desired invoice.',
            'لبدء عملية دفع، اذهب إلى تبويب "الفواتير" واضغط على "دفع عبر فوري" بجانب الفاتورة المطلوبة.')}
        </p>
      </div>

      {/* Fawry Integration Guide */}
      <div className="bg-white rounded-3xl border shadow-sm border-gray-200 p-6 max-w-xl">
        <h3 className="font-bold text-gray-900 mb-3">
          {t('Integration Details', 'معلومات التكامل')}
        </h3>
        <div className="space-y-2 text-sm text-gray-500">
          <p><strong>Merchant Code:</strong> <span className="font-mono bg-gray-50 px-2 py-0.5 rounded">GymCore-{Date.now().toString().slice(-6)}</span></p>
          <p><strong>API Endpoint:</strong> <span className="font-mono bg-gray-50 px-2 py-0.5 rounded">https://atfawry.com/api/v1</span></p>
          <p><strong>{t('Integration Status', 'حالة التكامل')}:</strong> <span className="text-green-700 font-semibold">{t('✅ Ready — Simulation Mode', '✅ جاهز — في وضع المحاكاة')}</span></p>
        </div>
      </div>
    </div>
  );

  // ── Fawry Payment Modal ──────────────────────────────
  const renderFawryModal = () => {
    if (!showFawryModal || !fawryInvoice) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!fawryMutation.isPending) { setShowFawryModal(false); setFawryResult(null); } }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Bank size={20} className="text-primary" />
              <h2 className="text-lg font-bold text-gray-900">{t('Fawry Payment', 'الدفع عبر فوري')}</h2>
            </div>
            <button onClick={() => { setShowFawryModal(false); setFawryResult(null); }} className="p-1.5 hover:bg-gray-50 rounded-lg">
              <X size={18} />
            </button>
          </div>

          {fawryMutation.isPending ? (
            <div className="flex flex-col items-center py-8">
              <PageLoader />
              <p className="mt-3 text-sm text-gray-500">{t('Connecting to Fawry...', 'جاري الاتصال ببوابة فوري...')}</p>
            </div>
          ) : fawryResult ? (
            <div className="text-center py-4">
              <CheckCircle size={48} className="text-green-600 mx-auto mb-3" weight="fill" />
              <p className="font-bold text-gray-900 text-lg">{t('Payment Created', 'تم إنشاء عملية الدفع')}</p>
              <div className="bg-gray-50 rounded-xl p-4 mt-4 space-y-2 text-right">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('Reference', 'رقم المرجع')}</span>
                  <span className="font-mono font-bold text-gray-900">{fawryResult.ref}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('Amount', 'المبلغ')}</span>
                  <span className="font-mono font-bold text-gray-900">{formatCurrency(fawryInvoice.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('Gym', 'الصالة')}</span>
                  <span className="font-medium text-gray-900">{fawryInvoice.gym_name}</span>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <a href={fawryResult.url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-xl font-bold hover:opacity-90 transition-opacity">
                  <ArrowSquareOut size={16} />
                  {t('Open Fawry', 'فتح بوابة فوري')}
                </a>
                <button
                  type="button"
                  onClick={() => { setShowFawryModal(false); setFawryResult(null); }}
                  className="px-5 py-3 border border-gray-200 rounded-xl text-gray-500 font-medium hover:bg-gray-50 transition-colors"
                >
                  {t('Close', 'إغلاق')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  // ── Coupon Create Modal ──────────────────────────────
  const renderCouponModal = () => {
    if (!showCouponModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCouponModal(false)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Ticket size={20} className="text-primary" />
              <h2 className="text-lg font-bold text-gray-900">{t('Add Discount Coupon', 'إضافة كوبون خصم')}</h2>
            </div>
            <button onClick={() => setShowCouponModal(false)} className="p-1.5 hover:bg-gray-50 rounded-lg"><X size={18} /></button>
          </div>

          <form onSubmit={handleCreateCoupon} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1.5">{t('Coupon Code', 'رمز الكوبون')} *</label>
              <input type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent font-mono uppercase"
                placeholder="SAVE20" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1.5">{t('Description', 'الوصف')}</label>
              <input type="text" value={couponDesc} onChange={(e) => setCouponDesc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder={t('20% off Professional plan', 'خصم 20% على الباقة الاحترافية')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1.5">{t('Discount Type', 'نوع الخصم')} *</label>
                <select value={couponType} onChange={(e) => setCouponType(e.target.value as 'percentage' | 'fixed')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent">
                  <option value="percentage">{t('Percentage', 'نسبة مئوية')}</option>
                  <option value="fixed">{t('Fixed Amount', 'قيمة ثابتة')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1.5">{t('Discount Value', 'قيمة الخصم')} *</label>
                <input type="number" min={1} value={couponValue} onChange={(e) => setCouponValue(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>
            {couponType === 'percentage' && (
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1.5">{t('Max Discount Amount', 'الحد الأقصى للخصم')}</label>
                <input type="number" min={0} value={couponMaxDiscount} onChange={(e) => setCouponMaxDiscount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1.5">{t('Max Uses', 'الحد الأقصى للاستخدام')}</label>
                <input type="number" min={1} value={couponMaxUses} onChange={(e) => setCouponMaxUses(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1.5">{t('Valid Until', 'صالح حتى')}</label>
                <input type="date" value={couponValidUntil} onChange={(e) => setCouponValidUntil(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1.5">{t('Min Plan Tier', 'الحد الأدنى للباقة')}</label>
              <select value={couponMinPlan} onChange={(e) => setCouponMinPlan(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent">
                <option value="">{t('All Plans', 'جميع الباقات')}</option>
                <option value="basic">{t('Basic', 'أساسي')}</option>
                <option value="professional">{t('Professional', 'احترافي')}</option>
                <option value="enterprise">{t('Enterprise', 'مؤسسات')}</option>
              </select>
            </div>

            {couponError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{couponError}</p>}

            <div className="flex gap-3">
              <button type="submit" disabled={createCouponMutation.isPending}
                className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                {createCouponMutation.isPending && (<span className="material-symbols-outlined animate-spin text-base">progress_activity</span>)}
                <FloppyDisk size={16} />
                {t('Create Coupon', 'إنشاء الكوبون')}
              </button>
              <button type="button" onClick={() => setShowCouponModal(false)}
                className="px-5 py-3 border border-gray-200 rounded-xl text-gray-500 font-medium hover:bg-gray-50 transition-colors">
                {t('Cancel', 'إلغاء')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t('Billing Engine', 'محرك الفواتير')}
        subtitle={t('Manage billing plans, invoices, coupons, and payments', 'إدارة خطط الفواتير والفواتير والكوبونات والمدفوعات')}
        icon="credit-card"
      />

      <UnifiedTabs
        tabs={tabs}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
        variant="pills"
        className="mb-6"
      />

      {activeTab === 'plans' && renderPlans()}
      {activeTab === 'invoices' && renderInvoices()}
      {activeTab === 'coupons' && renderCoupons()}
      {activeTab === 'payments' && renderPayments()}

      {renderCouponModal()}
      {renderFawryModal()}
    </div>
  );
}
