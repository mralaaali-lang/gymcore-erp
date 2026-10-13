import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock, DollarSign, FileText, Plus, Receipt, UserCheck, X } from 'lucide-react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  listSubscriptions, cancelSubscription,
  type SubscriptionRow,
} from '../../services/api';
import { formatMoney } from '../../utils/currency';
import { fmtNum, formatDate } from '../../utils/date';
import { escapeHtml, printDocument } from '../../utils/print';
import { DashboardPage, PrimaryAction, SecondaryAction, Panel, EmptyState } from '../../components/dashboard';
import { QuickActionModals, type ActionKey } from '../../components/dashboard/QuickActionCenter';
import StatusBadge from '../../components/ui/StatusBadge';
import AddSubscription from './subscriptions/AddSubscription';
import { printSubscriptionInvoice } from './subscriptions/invoice';
import { SPORTS, durationLabelAr, sportLabel } from './subscriptions/shared';

/** Extract the server's own error text so the UI never hides a real rejection. */
function apiError(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { error?: string; details?: { field?: string; message: string }[] } } })?.response?.data;
  if (data?.details?.length) {
    const parts = data.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message));
    return `${data.error ?? 'Validation failed'} — ${parts.join(' · ')}`;
  }
  return data?.error || fallback;
}

const inputCls =
  'min-h-[48px] md:min-h-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-base md:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

const STATUS_OPTIONS = [
  { value: 'all', ar: 'الكل' },
  { value: 'active', ar: 'نشط' },
  { value: 'ending_soon', ar: 'ينتهي قريباً' },
  { value: 'expired', ar: 'منتهي' },
  { value: 'unpaid', ar: 'غير مدفوع' },
];

const DURATION_OPTIONS = [
  { value: '', ar: 'الكل' },
  { value: '30', ar: 'شهر' },
  { value: '90', ar: '3 شهور' },
  { value: '180', ar: '6 شهور' },
];

/**
 * §34ي — صفحة الاشتراكات (مواصفة صاحب المشروع): هيدر + أزرار سريعة،
 * شريط PDF/اشتراك جديد، 4 كروت إحصاء محسوبة على السيرفر من
 * member_subscriptions/member_debts، شريط فلاتر حقيقي، وجدول 10 أعمدة.
 * كل رقم هنا من API — الأعمدة الجديدة (رياضة/مدرب/أيام) تعرض «—» حتى
 * يُدخَل قيمها فعلياً عبر نموذج «اشتراك جديد».
 */
export default function SubscriptionsPage() {
  const { language, gymProfile, branding } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency;
  const gymName = gymProfile?.name || branding?.name;

  const [params] = useSearchParams();
  const initialStatus = STATUS_OPTIONS.some((s) => s.value === params.get('status')) ? params.get('status')! : 'all';

  const [status, setStatus] = useState(initialStatus);
  const [sport, setSport] = useState('');
  const [duration, setDuration] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [quick, setQuick] = useState<ActionKey | null>(null);
  const [showForm, setShowForm] = useState(params.get('new') === '1'); // §35ت — dashboard «اشتراك جديد» deep link
  const [cancelling, setCancelling] = useState<SubscriptionRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError } = useApiQuery(
    ['subscriptions', status, sport, duration, search, String(page), String(limit)],
    () => listSubscriptions({
      status: status === 'all' ? undefined : status,
      sport: sport || undefined,
      duration: duration || undefined,
      search: search || undefined,
      page, limit,
    }),
    { staleTime: 15_000 }
  );

  const rows = data?.data ?? [];
  const stats = data?.stats;
  const pagination = data?.pagination;

  const resetFilters = () => {
    setStatus('all'); setSport(''); setDuration(''); setSearchInput(''); setSearch(''); setPage(1);
  };
  const filtersDirty = status !== 'all' || sport !== '' || duration !== '' || search !== '';

  const cancel = useMutation({
    mutationFn: () => cancelSubscription(cancelling!.id, cancelReason.trim() || 'إلغاء من صفحة الاشتراكات'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'business-metrics'] });
      setCancelling(null); setCancelReason('');
      showToast(rtl ? 'تم إلغاء الاشتراك' : 'Subscription cancelled', 'success');
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل الإلغاء' : 'Cancel failed'), 'error'),
  });

  // تصدير PDF: جدول الصفحة الحالية بنفس الفلاتر — نافذة طباعة حقيقية.
  const exportPdf = () => {
    if (!rows.length) { showToast(rtl ? 'لا صفوف للتصدير' : 'Nothing to export', 'error'); return; }
    const head = ['العضو', 'الباقة', 'الرياضة', 'المدرب', 'من', 'إلى', 'المتبقي', 'المبلغ', 'الدفع'];
    const body = rows.map((r) => `<tr><td>${escapeHtml(r.member_name)}</td><td>${escapeHtml(r.offer_title)}</td><td>${escapeHtml(sportLabel(r.sport))}</td><td>${escapeHtml(r.coach_name || '—')}</td><td>${escapeHtml(formatDate(r.start_date))}</td><td>${escapeHtml(formatDate(r.end_date))}</td><td>${escapeHtml(remainingCell(r).text)}</td><td>${escapeHtml(formatMoney(Number(r.offer_price), currency))}</td><td>${escapeHtml(r.payment_state === 'paid' ? 'مدفوع' : 'غير مدفوع')}</td></tr>`).join('');
    const ok = printDocument({
      title: rtl ? 'تصدير الاشتراكات' : 'Subscriptions export',
      innerHtml: `<h1>${escapeHtml(rtl ? 'قائمة الاشتراكات' : 'Subscriptions')}${gymName ? ` — ${escapeHtml(gymName)}` : ''}</h1>
        <p class="muted">${escapeHtml(`الحالة: ${STATUS_OPTIONS.find((s) => s.value === status)?.ar ?? ''} · إجمالي ${fmtNum(pagination?.total ?? 0)} اشتراك · المُصدَّر ${rows.length} صفاً`)}</p>
        <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      {/* 1) الهيدر العلوي: العنوان + الأزرار السريعة */}
      <DashboardPage
        actions={
          <>
            <SecondaryAction onClick={() => setQuick('checkin')}>
              <UserCheck size={15} />{rtl ? 'حصة' : 'Check-in'}
            </SecondaryAction>
            <SecondaryAction onClick={() => navigate('/admin/sales')}>
              <DollarSign size={15} />{rtl ? 'بيع' : 'POS sale'}
            </SecondaryAction>
            <SecondaryAction onClick={() => setQuick('member')}>
              <Plus size={15} />{rtl ? 'عضو' : 'Member'}
            </SecondaryAction>
          </>
        }
      >
        {/* 2) شريط العنوان والأزرار */}
        <div className="flex items-center gap-2 flex-wrap">
          <SecondaryAction onClick={exportPdf}>
            <FileText size={15} /> PDF
          </SecondaryAction>
          <PrimaryAction onClick={() => setShowForm(true)}>
            <Plus size={16} />{rtl ? 'اشتراك جديد' : 'New subscription'}
          </PrimaryAction>
        </div>

        {/* 3) كروت الإحصائيات — من aggregate على السيرفر لنفس الجدول */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button type="button" onClick={() => { setStatus('active'); setPage(1); }} className="text-start">
            <Statish icon={<UserCheck size={22} />} color="text-emerald-600" bg="bg-emerald-50" value={fmtNum(stats?.active ?? 0)} label={rtl ? 'نشط' : 'Active'} />
          </button>
          <button type="button" onClick={() => { setStatus('ending_soon'); setPage(1); }} className="text-start">
            <Statish icon={<Clock size={22} />} color="text-amber-600" bg="bg-amber-50" value={fmtNum(stats?.ending_soon ?? 0)} label={rtl ? 'ينتهي قريباً (7 أيام)' : 'Ending soon (7d)'} />
          </button>
          <button type="button" onClick={() => { setStatus('unpaid'); setPage(1); }} className="text-start">
            <Statish icon={<AlertTriangle size={22} />} color="text-rose-600" bg="bg-rose-50" value={fmtNum(stats?.unpaid ?? 0)} label={rtl ? 'غير مدفوع' : 'Unpaid'} />
          </button>
          <button type="button" onClick={() => navigate('/admin/billing?tab=Debts')} className="text-start">
            <Statish icon={<DollarSign size={22} />} color="text-cyan-600" bg="bg-cyan-50" value={formatMoney(Number(stats?.dues ?? 0), currency)} label={rtl ? 'مستحقات (ديون مفتوحة)' : 'Dues (open debts)'} />
          </button>
        </div>

        {/* 4) شريط الفلاتر */}
        <div className="flex items-center gap-2 flex-wrap">
          <select aria-label={rtl ? 'الحالة' : 'Status'} className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{rtl ? 'الحالة' : 'Status'}: {o.ar}</option>)}
          </select>
          <select aria-label={rtl ? 'الرياضة' : 'Sport'} className={inputCls} value={sport} onChange={(e) => { setSport(e.target.value); setPage(1); }}>
            <option value="">{rtl ? 'الرياضة: الكل' : 'Sport: All'}</option>
            {SPORTS.map((s) => <option key={s.code} value={s.code}>{rtl ? s.ar : s.en}</option>)}
          </select>
          <select aria-label={rtl ? 'مدة الباقة' : 'Duration'} className={inputCls} value={duration} onChange={(e) => { setDuration(e.target.value); setPage(1); }}>
            {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{rtl ? `مدة الباقة: ${o.ar}` : `Duration: ${o.ar}`}</option>)}
          </select>
          <input
            className={`${inputCls} flex-1 min-w-[180px]`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={rtl ? 'بحث: اسم / تليفون / كود…' : 'Search: name / phone / code…'}
          />
          {filtersDirty && (
            <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-700 px-2 py-2">
              <X size={15} />{rtl ? 'إعادة تعيين' : 'Reset'}
            </button>
          )}
        </div>

        {/* 5) الجدول — 10 أعمدة، 50/100 صفوف */}
        <Panel>
          {isLoading ? (
            <p className="text-center py-12 text-gray-400">{rtl ? 'جاري التحميل...' : 'Loading…'}</p>
          ) : isError ? (
            <EmptyState title={rtl ? 'تعذّر تحميل الاشتراكات' : 'Failed to load subscriptions'} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={filtersDirty ? (rtl ? 'لا اشتراكات مطابقة للفلاتر' : 'No subscriptions match the filters') : (rtl ? 'لا اشتراكات بعد' : 'No subscriptions yet')}
              description={filtersDirty ? (rtl ? 'جرّب إعادة التعيين.' : 'Try resetting filters.') : (rtl ? 'أنشئ أول اشتراك من «اشتراك جديد».' : 'Create the first one above.')}
              actions={filtersDirty ? <SecondaryAction onClick={resetFilters}>{rtl ? 'إعادة تعيين' : 'Reset'}</SecondaryAction> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead>
                  <tr className="text-start text-gray-500 border-b border-gray-100">
                    <th className="py-3 px-2 font-semibold text-start">{rtl ? 'العضو' : 'Member'}</th>
                    <th className="py-3 px-2 font-semibold text-start">{rtl ? 'الباقة' : 'Plan'}</th>
                    <th className="py-3 px-2 font-semibold text-start">{rtl ? 'الرياضة' : 'Sport'}</th>
                    <th className="py-3 px-2 font-semibold text-start">{rtl ? 'المدرب' : 'Coach'}</th>
                    <th className="py-3 px-2 font-semibold text-start">{rtl ? 'من' : 'From'}</th>
                    <th className="py-3 px-2 font-semibold text-start">{rtl ? 'إلى' : 'To'}</th>
                    <th className="py-3 px-2 font-semibold text-start">{rtl ? 'المتبقي' : 'Remaining'}</th>
                    <th className="py-3 px-2 font-semibold text-start">{rtl ? 'المبلغ' : 'Amount'}</th>
                    <th className="py-3 px-2 font-semibold text-start">{rtl ? 'الدفع' : 'Payment'}</th>
                    <th className="py-3 px-2 font-semibold text-start">{rtl ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r) => {
                    const rem = remainingCell(r);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/60">
                        <td className="py-3 px-2">
                          <p className="font-bold text-gray-900">{r.member_name}</p>
                          <p className="text-xs text-gray-500">{r.member_phone || r.id.slice(0, 8)}</p>
                        </td>
                        <td className="py-3 px-2">
                          <p className="text-gray-800">{r.offer_title}</p>
                          <p className="text-xs text-gray-400">{durationLabelAr(r.duration_days)}</p>
                        </td>
                        <td className="py-3 px-2 text-gray-700">{sportLabel(r.sport)}</td>
                        <td className="py-3 px-2 text-gray-700">{r.coach_name || (rtl ? 'بدون مدرب' : 'No coach')}</td>
                        <td className="py-3 px-2 text-gray-700 whitespace-nowrap">{formatDate(r.start_date)}</td>
                        <td className="py-3 px-2 text-gray-700 whitespace-nowrap">{formatDate(r.end_date)}</td>
                        <td className="py-3 px-2"><StatusBadge status={rem.text} variant={rem.variant} /></td>
                        <td className="py-3 px-2 text-gray-900 font-semibold whitespace-nowrap">{formatMoney(Number(r.offer_price), currency)}</td>
                        <td className="py-3 px-2">
                          <StatusBadge status={r.payment_state === 'paid' ? (rtl ? 'مدفوع' : 'Paid') : (rtl ? 'غير مدفوع' : 'Unpaid')} variant={r.payment_state === 'paid' ? 'success' : 'error'} />
                          {r.payment_state === 'unpaid' && (
                            <p className="text-[11px] text-rose-500 mt-1">{rtl ? 'عليه' : 'owed'} {formatMoney(Number(r.outstanding_amount), currency)}</p>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title={rtl ? 'طباعة الفاتورة' : 'Print invoice'}
                              onClick={() => {
                                const ok = printSubscriptionInvoice(gymName, currency, { ...r, sport_label: sportLabel(r.sport) });
                                if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
                              }}
                              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                            >
                              <Receipt size={16} />
                            </button>
                            {r.status === 'active' && (
                              <button
                                type="button"
                                title={rtl ? 'إلغاء الاشتراك' : 'Cancel subscription'}
                                onClick={() => setCancelling(r)}
                                className="p-2 rounded-lg text-gray-500 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* عرض الصفوف + ترقيم */}
          {rows.length > 0 && pagination && (
            <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-gray-500">
                {rtl ? 'عرض' : 'Show'}
                <select
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                {rtl ? 'صف' : 'rows'} · {fmtNum(pagination.total)} {rtl ? 'إجمالي' : 'total'}
              </label>
              {/* §35ث — السابق/التالي removed per owner; «إجمالي» above carries the count. */}
              <span className="text-sm text-gray-600">{fmtNum(pagination.page)} / {fmtNum(pagination.total_pages)}</span>
            </div>
          )}
        </Panel>
      </DashboardPage>

      {/* أزرار سريعة + شاشة الاشتراك الجديد */}
      <QuickActionModals action={quick} onClose={() => setQuick(null)} />
      {showForm && <AddSubscription onClose={() => setShowForm(false)} />}

      {/* مودال إلغاء مصغّر — السيرفر يفرض سببًا */}
      {cancelling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCancelling(null)} aria-hidden />
          <div dir={rtl ? 'rtl' : 'ltr'} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-5 space-y-4">
            <h3 className="font-bold text-gray-900">{rtl ? `إلغاء اشتراك ${cancelling.member_name}` : `Cancel ${cancelling.member_name}'s subscription`}</h3>
            <p className="text-sm text-gray-500">{cancelling.offer_title} · {formatDate(cancelling.start_date)} ← {formatDate(cancelling.end_date)}</p>
            <input
              className={inputCls}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={rtl ? 'سبب الإلغاء (مطلوب)' : 'Reason (required)'}
            />
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50"
                onClick={() => setCancelling(null)}
              >
                {rtl ? 'تراجع' : 'Back'}
              </button>
              <button
                disabled={cancelReason.trim().length === 0 || cancel.isPending}
                className="flex-1 rounded-xl bg-rose-600 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                onClick={() => cancel.mutate()}
              >
                {cancel.isPending ? (rtl ? 'جارٍ…' : '…') : (rtl ? 'تأكيد الإلغاء' : 'Confirm cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** §35ث — أيقونة في اليمين عمودياً وبجانبها الرقم والوصف (نمط أفقي). */
function Statish({ icon, color, bg, value, label }: { icon: React.ReactNode; color: string; bg: string; value: string; label: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-gray-200 transition-colors flex items-center gap-4">
      <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${bg} ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-2xl md:text-3xl font-bold tracking-tight leading-none ${color}`}>{value}</p>
        <p className="text-sm text-gray-500 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

/** عمود «المتبقي»: ملغي/مجمّد ثم العد التنازلي — من حقول الصف نفسها. */
function remainingCell(r: SubscriptionRow): { text: string; variant: 'success' | 'warning' | 'error' | 'neutral' } {
  if (r.status === 'cancelled') return { text: 'ملغي', variant: 'neutral' };
  if (r.status === 'frozen') return { text: 'مجمّد', variant: 'neutral' };
  if (r.status === 'suspended') return { text: 'موقوف', variant: 'warning' };
  if (r.remaining_days < 0 || r.status === 'expired') return { text: 'منتهي', variant: 'error' };
  if (r.remaining_days <= 7) return { text: `${fmtNum(r.remaining_days)} يوم`, variant: 'warning' };
  return { text: `${fmtNum(r.remaining_days)} يوم`, variant: 'success' };
}
