import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Warning as AlertTriangle, Clock, CurrencyDollar as DollarSign, FileText, Plus, UserCheck, X } from '@phosphor-icons/react';
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
import { SkeletonStats, SkeletonTable } from '../../components/shared/Skeleton';
import Modal from '../../components/shared/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import DataTable, { type TableColumn } from '../../components/ui/DataTable';
import AddSubscription from './subscriptions/AddSubscription';
import EditSubscription from './subscriptions/EditSubscription';
import { SPORTS, sportName, useSportsCatalog } from './subscriptions/shared';

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

// الأعمدة القابلة للترتيب = مرآة حرفية للـwhitelist في السيرفر
// (`server/src/controllers/subscriptions.ts:74-80`: member_name · start_date ·
// end_date · remaining · amount، والافتراضي start_date DESC). أي رأس ضاغط هنا
// لازم يكون مفتاحًا مقبولًا هناك — «الترتيب مش ادعاء».
// الاتجاه الافتراضي ذكي لكل عمود (إلى/المتبقي: الأقرب أولاً — الأهم للتجديد؛
// المبلغ: الأعلى أولاً) وبيمرّر لـ`DataTable` عبر `sortDescFirst`.
const SORTABLE: Record<string, { def: 'asc' | 'desc' }> = {
  member_name: { def: 'asc' },
  start_date: { def: 'desc' },
  end_date: { def: 'asc' },
  remaining: { def: 'asc' },
  amount: { def: 'desc' },
};

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
  const { sports: catalogSports } = useSportsCatalog();
  const sportOptions = catalogSports.length > 0
    ? catalogSports.map((s) => ({ code: s.code, label: s.name_ar }))
    : SPORTS.map((s) => ({ code: s.code, label: rtl ? s.ar : s.en }));
  const sName = (code?: string | null) => sportName(code, catalogSports, rtl);

  const [params] = useSearchParams();
  const initialStatus = STATUS_OPTIONS.some((s) => s.value === params.get('status')) ? params.get('status')! : 'all';

  const [status, setStatus] = useState(initialStatus);
  const [sport, setSport] = useState('');
  const [duration, setDuration] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  // الترتيب: العمود + الاتجاه — الافتراضي الأحدث أولاً (نفس ترتيب السيرفر القديم).
  const [sort, setSort] = useState('start_date');
  const [order, setOrder] = useState('desc');

  const [showForm, setShowForm] = useState(params.get('new') === '1'); // §35ت — dashboard «اشتراك جديد» deep link
  const [cancelling, setCancelling] = useState<SubscriptionRow | null>(null);
  const [editing, setEditing] = useState<SubscriptionRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError } = useApiQuery(
    ['subscriptions', status, sport, duration, search, String(page), String(limit), sort, order],
    () => listSubscriptions({
      status: status === 'all' ? undefined : status,
      sport: sport || undefined,
      duration: duration || undefined,
      search: search || undefined,
      page, limit, sort, order,
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

  // الأعمدة: المفاتيح اللي لها مكان في الـwhitelist بس هي `sortable`، و`value`
  // موجودة لكل عمود مرتّب عشان الفانطازة والترقيم الحي يستخدم نفس المفتاح.
  const columns: TableColumn<SubscriptionRow>[] = [
    {
      id: '__n',
      label: rtl ? 'م' : '#',
      width: '2.5rem',
      cell: (_r, i) => (
        <span className="text-xs text-ink-faint tabular-nums">{(page - 1) * limit + i + 1}</span>
      ),
    },
    {
      id: 'member_name',
      label: rtl ? 'العضو' : 'Member',
      sortable: true,
      sortDescFirst: SORTABLE.member_name.def === 'desc',
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-bold text-foreground">{r.member_name}</p>
          <p className="text-xs text-muted-foreground">
            {rtl ? 'كود' : 'Code'} {r.member_code ?? '—'}
            {r.member_phone ? ` · ${r.member_phone}` : ''}
          </p>
        </div>
      ),
    },
    { id: 'offer_title', label: rtl ? 'الباقة' : 'Plan', value: (r) => r.offer_title },
    { id: 'sport', label: rtl ? 'الرياضة' : 'Sport', value: (r) => sName(r.sport) },
    {
      id: 'coach',
      label: rtl ? 'المدرب' : 'Coach',
      value: (r) => r.coach_name || (rtl ? 'بدون مدرب' : 'No coach'),
    },
    {
      id: 'start_date',
      label: rtl ? 'من' : 'From',
      sortable: true,
      sortDescFirst: SORTABLE.start_date.def === 'desc',
      value: (r) => formatDate(r.start_date),
    },
    {
      id: 'end_date',
      label: rtl ? 'إلى' : 'To',
      sortable: true,
      sortDescFirst: SORTABLE.end_date.def === 'desc',
      value: (r) => formatDate(r.end_date),
    },
    {
      id: 'remaining',
      label: rtl ? 'المتبقي' : 'Remaining',
      sortable: true,
      sortDescFirst: SORTABLE.remaining.def === 'desc',
      cell: (r) => {
        const rem = remainingCell(r);
        return <StatusBadge status={rem.text} variant={rem.variant} />;
      },
    },
    {
      id: 'amount',
      label: rtl ? 'المبلغ' : 'Amount',
      sortable: true,
      sortDescFirst: SORTABLE.amount.def === 'desc',
      numeric: true,
      value: (r) => formatMoney(Number(r.offer_price), currency),
    },
    {
      id: 'payment',
      label: rtl ? 'الدفع' : 'Payment',
      cell: (r) => (
        <div className="min-w-0">
          <StatusBadge
            status={r.payment_state === 'paid' ? (rtl ? 'مدفوع' : 'Paid') : (rtl ? 'غير مدفوع' : 'Unpaid')}
            variant={r.payment_state === 'paid' ? 'success' : 'error'}
          />
          {r.payment_state === 'unpaid' && (
            <p className="mt-1 text-[11px] text-rose-500">
              {rtl ? 'عليه' : 'owed'} {formatMoney(Number(r.outstanding_amount), currency)}
            </p>
          )}
        </div>
      ),
    },
  ];

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
    const body = rows.map((r) => `<tr><td>${escapeHtml(r.member_name)}</td><td>${escapeHtml(r.offer_title)}</td><td>${escapeHtml(sName(r.sport))}</td><td>${escapeHtml(r.coach_name || '—')}</td><td>${escapeHtml(formatDate(r.start_date))}</td><td>${escapeHtml(formatDate(r.end_date))}</td><td>${escapeHtml(remainingCell(r).text)}</td><td>${escapeHtml(formatMoney(Number(r.offer_price), currency))}</td><td>${escapeHtml(r.payment_state === 'paid' ? 'مدفوع' : 'غير مدفوع')}</td></tr>`).join('');
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
      {/* 1) الهيدر العلوي (الأزرار السريعة حُذفت بطلب صاحب المشروع) */}
      <DashboardPage
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

        {/* 3) كروت الإحصائيات — من aggregate على السيرفر لنفس الجدول. أثناء التحميل
            الكروت بتافانطازة (مش أصفار): «0 نشط» رقم مقروء ومغرض، والفانطازة بتقول
            «لسه ما اتقاسش». */}
        {isLoading ? (
          <SkeletonStats columns={4} gridClassName="grid-cols-2 md:grid-cols-4 gap-4" />
        ) : (
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
          <button type="button" onClick={() => navigate('/admin/debts')} className="text-start">
            <Statish icon={<DollarSign size={22} />} color="text-cyan-600" bg="bg-cyan-50" value={formatMoney(Number(stats?.dues ?? 0), currency)} label={rtl ? 'مستحقات (ديون مفتوحة)' : 'Dues (open debts)'} />
          </button>
        </div>
        )}

        {/* 4) شريط الفلاتر */}
        <div className="flex items-center gap-2 flex-wrap">
          <select aria-label={rtl ? 'الحالة' : 'Status'} className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{rtl ? 'الحالة' : 'Status'}: {o.ar}</option>)}
          </select>
          <select aria-label={rtl ? 'الرياضة' : 'Sport'} className={inputCls} value={sport} onChange={(e) => { setSport(e.target.value); setPage(1); }}>
            <option value="">{rtl ? 'الرياضة: الكل' : 'Sport: All'}</option>
            {sportOptions.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
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

        {/* 5) الجدول — 10 أعمدة، 10/50/100/300 صفوف (الافتراضي 10)، والضغط على الصف يفتح مودال التعديل.
            موجة 4 / دفعة ب: `ui/DataTable` بـ`bare` جوّه `Panel` — القشرة والحشو والـ`aria-sort`
            بقوا ملك المكوّن، و`minWidth` بترمة الـ850px القديمة. */}
        <Panel>
          {isLoading ? (
            /* موجة 4 / دفعة ب — صف الاشتراك سطران (اسم العضو فوق الكود/التليفون).
               `rowHeight` قياس حي على 1440: 77px للصفوف اللي عمود الدفع فيها شارة فقط،
               و89px لما يزيد سطر «غير مدفوع عليه …» — بنثبّت الأغلب (77) والفارق سطر واحد
               لا أكثر. على 390 الصفوف 97/89 لأن عمود العضو (124px) يلف السطر الثالث،
               والرأس الحقيقي 73 بدل 41 لأن أرضية اللمس (‎min-height:48px تحت 768px في
               styles/index.css) بتفرض نفسها على زر الفرز — قرار وصول مقصود مش اختلاف
               فانطازة: الفانطازة مفيهاش أزرار فبتفضل 41. */
            <SkeletonTable bare rows={6} cols={columns.length} rowHeight={77} />
          ) : isError ? (
            <EmptyState title={rtl ? 'تعذّر تحميل الاشتراكات' : 'Failed to load subscriptions'} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={filtersDirty ? (rtl ? 'لا اشتراكات مطابقة للفلاتر' : 'No subscriptions match the filters') : (rtl ? 'لا اشتراكات بعد' : 'No subscriptions yet')}
              description={filtersDirty ? (rtl ? 'جرّب إعادة التعيين.' : 'Try resetting filters.') : (rtl ? 'أنشئ أول اشتراك من «اشتراك جديد».' : 'Create the first one above.')}
              actions={filtersDirty ? <SecondaryAction onClick={resetFilters}>{rtl ? 'إعادة تعيين' : 'Reset'}</SecondaryAction> : undefined}
            />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              bare
              minWidth="850px"
              caption={rtl ? 'قائمة الاشتراكات' : 'Subscriptions'}
              manualSorting
              sorting={[{ id: sort, desc: order === 'desc' }]}
              onSortingChange={(next) => {
                const picked = next[0];
                if (!picked) return;
                setSort(picked.id);
                setOrder(picked.desc ? 'desc' : 'asc');
                setPage(1);
              }}
              onRowClick={(r) => setEditing(r)}
              rowTitle={() => (rtl ? 'اضغط للتعديل' : 'Click to edit')}
              footer={
                pagination ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <label className="flex items-center gap-2 text-sm text-gray-500">
                      {rtl ? 'عرض' : 'Show'}
                      <select
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm min-h-[40px]"
                        value={limit}
                        onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                      >
                        <option value={10}>10</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={300}>300</option>
                      </select>
                    </label>
                    {/* §35ج — numbered pages replace the deleted «السابق/التالي»: a click
                        jumps straight to the page, and 300-per-view shrinks the window. */}
                    {pagination.total_pages > 1 && (
                      <div className="flex items-center gap-2" dir={rtl ? 'rtl' : 'ltr'}>
                        {Array.from({ length: Math.min(pagination.total_pages, 5) }, (_, i) => {
                          const start = pagination.total_pages <= 5 ? 1
                            : Math.max(1, Math.min(pagination.page - 2, pagination.total_pages - 4));
                          const p = start + i;
                          if (p > pagination.total_pages) return null;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setPage(p)}
                              aria-label={rtl ? `الصفحة ${p}` : `Page ${p}`}
                              className={`w-9 h-9 rounded-xl text-sm font-medium transition min-w-[44px] ${page === p ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : undefined
              }
            />
          )}
        </Panel>
      </DashboardPage>

      {/* شاشة الاشتراك الجديد */}
      {showForm && (
        <AddSubscription
          onClose={() => setShowForm(false)}
          initialOfferId={params.get('offer')}
          initialSport={params.get('sport')}
          initialWeekly={params.get('weekly')}
        />
      )}
      {editing && (
        <EditSubscription
          sub={editing}
          onClose={() => setEditing(null)}
          onRequestCancel={() => { setEditing(null); setCancelling(editing); }}
        />
      )}

      {/* مودال إلغاء مصغّر — السيرفر يفرض سببًا */}
      {cancelling && (
        <Modal
          open
          title={rtl ? `إلغاء اشتراك ${cancelling.member_name}` : `Cancel ${cancelling.member_name}'s subscription`}
          description={`${cancelling.offer_title} · ${formatDate(cancelling.start_date)} ← ${formatDate(cancelling.end_date)}`}
          onClose={() => setCancelling(null)}
          size="md"
          dir={rtl ? 'rtl' : 'ltr'}
          disableDismiss={cancel.isPending}
          footer={
            <>
              <button
                type="button"
                onClick={() => setCancelling(null)}
                disabled={cancel.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition disabled:opacity-50"
              >
                {rtl ? 'تراجع' : 'Back'}
              </button>
              <button
                type="button"
                onClick={() => cancel.mutate()}
                disabled={cancelReason.trim().length === 0 || cancel.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition disabled:opacity-50"
              >
                {cancel.isPending ? (rtl ? 'جارٍ الإلغاء…' : 'Cancelling…') : (rtl ? 'تأكيد الإلغاء' : 'Confirm cancel')}
              </button>
            </>
          }
        >
          <input
            className={inputCls}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder={rtl ? 'سبب الإلغاء (مطلوب)' : 'Reason (required)'}
          />
        </Modal>
      )}
    </div>
  );
}

/** §35ث — أيقونة في اليمين عمودياً وبجانبها الرقم والوصف (نمط أفقي). */
function Statish({ icon, color, bg, value, label }: { icon: React.ReactNode; color: string; bg: string; value: string; label: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-gray-200 transition-colors flex items-center gap-4 [container-type:inline-size]">
      <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${bg} ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`font-bold tracking-tight leading-none whitespace-nowrap text-[clamp(18px,8cqw,30px)] ${color}`}>{value}</p>
        <p className="text-gray-500 mt-1 truncate whitespace-nowrap text-[clamp(11px,4.5cqw,14px)]">{label}</p>
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
