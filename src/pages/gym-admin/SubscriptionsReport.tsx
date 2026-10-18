import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getSubscriptionsReport, listOffers, type MembershipOffer, type SubscriptionsReportRow } from '../../services/api';
import { formatMoney } from '../../utils/currency';
import { formatDate, daysUntil, fmtNum } from '../../utils/date';
import { escapeHtml, printDocument } from '../../utils/print';
import { buildExportMatrix, downloadMatrixXlsx } from '../../utils/csv';
import { StatCard, EmptyState } from '../../components/dashboard';
import StatusBadge from '../../components/ui/StatusBadge';
import DataTable, { type TableColumn } from '../../components/ui/DataTable';
import { SkeletonPanel, SkeletonStats, SkeletonTable } from '../../components/shared/Skeleton';
import { FileText, FileCsv as FileSpreadsheet, Users, CheckCircle as CheckCircle2, Clock, Wallet } from '@phosphor-icons/react';

// ====================================================================
// تقرير الاشتراكات (/admin/reports/subscriptions) — مربوط بزر
// «تقرير الاشتراكات» في شاشة التقارير. نفس تعريفات صفحة الاشتراكات،
// ومنطق الدفع موحّد مع الديون: المتبقي = الديون المفتوحة المرتبطة.
// ====================================================================

const STATUS_OPTIONS = [
  { value: 'all', ar: 'الكل', en: 'All' },
  { value: 'active', ar: 'نشط', en: 'Active' },
  { value: 'ending_soon', ar: 'ينتهي قريباً', en: 'Ending soon' },
  { value: 'expired', ar: 'منتهي', en: 'Expired' },
  { value: 'suspended', ar: 'موقوف', en: 'Suspended' },
];
const DATE_FIELD_OPTIONS = [
  { value: 'start', ar: 'تاريخ البداية', en: 'Start date' },
  { value: 'registered', ar: 'تاريخ التسجيل', en: 'Registration date' },
  { value: 'end', ar: 'تاريخ الانتهاء', en: 'End date' },
];
// مرآة حرفية للـwhitelist في `server/src/controllers/analytics.ts:907-910`
// (member_name · end_date · amount) — «من» مش مرتّب لأن السيرفر ما بيعرفش مفتاحه،
// وده الفرق عن صفحة الاشتراكات. ملاحظة عقد: هذا الـendpoint افتراضي asc
// (`order=desc` بس هو اللي بيرجع DESC)، بينما `/api/subscriptions` افتراضي DESC.
const SORTABLE: Record<string, { def: 'asc' | 'desc' }> = {
  member_name: { def: 'asc' },
  end_date: { def: 'asc' },
  amount: { def: 'desc' },
};

const inputCls =
  'h-11 min-w-[150px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none';

export default function SubscriptionsReport() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency;

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const firstOfMonth = `${today.slice(0, 8)}01`;

  const [draft, setDraft] = useState({ status: 'all', offer: 'all', dateField: 'start', from: firstOfMonth, to: today });
  const [applied, setApplied] = useState({ status: 'all', offer: 'all', dateField: 'start', from: firstOfMonth, to: today });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState('end_date');
  const [order, setOrder] = useState('asc');
  const [exporting, setExporting] = useState(false);

  const { data: offersRes } = useApiQuery(
    ['membership-offers'],
    async () => (((await listOffers()).data ?? []) as MembershipOffer[]),
    { staleTime: 60_000 },
  );
  const offers = offersRes ?? [];

  const { data, isLoading, isError } = useApiQuery(
    ['reports-subscriptions', applied.status, applied.offer, applied.dateField, applied.from, applied.to, String(page), String(limit), sort, order],
    () => getSubscriptionsReport({
      status: applied.status === 'all' ? undefined : applied.status,
      offer_id: applied.offer === 'all' ? undefined : applied.offer,
      date_field: applied.dateField,
      from: applied.from || undefined,
      to: applied.to || undefined,
      page, limit, sort, order,
    }),
    { staleTime: 30_000 },
  );
  const rows = data?.data ?? [];
  const stats = data?.stats;
  const pagination = data?.pagination;
  const pages = pagination ? pagination.total_pages : 0;

  const money = (v: unknown) => formatMoney(Number(v || 0), currency);

  const stateCell = (paid: number, price: number) => {
    const full = paid >= price;
    return (
      <StatusBadge
        status={full ? (rtl ? 'مدفوع' : 'Paid') : (rtl ? 'جزئي' : 'Partial')}
        variant={full ? 'success' : 'warning'}
      />
    );
  };

  const endCell = (end: string) => {
    const left = daysUntil(end);
    const soon = left !== null && left <= 7 && left >= 0;
    const past = left !== null && left < 0;
    return (
      <span className={past || soon ? 'text-red-600 font-bold' : 'text-gray-700'}>
        {formatDate(end)}{' '}
        {past && <span className="text-xs font-bold text-red-600">({rtl ? 'منتهي' : 'expired'})</span>}
      </span>
    );
  };

  // موجة 4 / دفعة ب — الأعمدة على صدفة `ui/DataTable`: `sortable` بس للمفاتيح اللي
  //عرفها السيرفر، و`align` منطقي + `tabular-nums` للمبالغ، والفوتر (عرض الصفوف
  // والترقيم) بقى جوّه نفس القشرة بدل كارت `bg-white` تاني.
  const columns: TableColumn<SubscriptionsReportRow>[] = [
    {
      id: '__n',
      label: rtl ? 'م' : '#',
      width: '2.5rem',
      cell: (_r, i) => (
        <span className="text-xs text-ink-faint tabular-nums">
          {((pagination?.page ?? 1) - 1) * ((pagination?.limit) ?? limit) + i + 1}
        </span>
      ),
    },
    {
      id: 'member_name',
      label: rtl ? 'العضو' : 'Member',
      sortable: true,
      sortDescFirst: SORTABLE.member_name.def === 'desc',
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-foreground leading-tight whitespace-nowrap">{r.member_name}</p>
          <p dir="ltr" className={`text-xs text-muted-foreground whitespace-nowrap ${rtl ? 'text-right' : 'text-left'}`}>
            {r.card_code ?? '—'}
          </p>
        </div>
      ),
    },
    {
      id: 'phone_number',
      label: rtl ? 'الهاتف' : 'Phone',
      value: (r) => r.phone_number || '—',
      cell: (r) => (
        <span dir="ltr" className={rtl ? 'text-right' : 'text-left'}>{r.phone_number || '—'}</span>
      ),
    },
    { id: 'offer_title', label: rtl ? 'الباقة' : 'Plan', value: (r) => r.offer_title },
    { id: 'start_date', label: rtl ? 'من' : 'From', value: (r) => formatDate(r.start_date) },
    {
      id: 'end_date',
      label: rtl ? 'إلى' : 'To',
      sortable: true,
      sortDescFirst: SORTABLE.end_date.def === 'desc',
      value: (r) => formatDate(r.end_date),
      cell: (r) => endCell(r.end_date),
    },
    {
      id: 'amount',
      label: rtl ? 'المبلغ' : 'Amount',
      sortable: true,
      sortDescFirst: SORTABLE.amount.def === 'desc',
      numeric: true,
      value: (r) => money(r.price),
    },
    {
      id: 'price_paid',
      label: rtl ? 'المدفوع' : 'Paid',
      numeric: true,
      value: (r) => money(r.price_paid),
    },
    {
      id: 'state',
      label: rtl ? 'الحالة' : 'Status',
      cell: (r) => stateCell(Number(r.price_paid), Number(r.price)),
    },
  ];

  const exportColumns = [
    { key: '__n', label: rtl ? 'م' : '#' },
    { key: 'full_name', label: rtl ? 'العضو' : 'Member' },
    { key: 'card_code', label: rtl ? 'الكود' : 'Code' },
    { key: 'phone_number', label: rtl ? 'الهاتف' : 'Phone' },
    { key: 'offer_title', label: rtl ? 'الباقة' : 'Plan' },
    { key: 'start_date', label: rtl ? 'من' : 'From' },
    { key: 'end_date', label: rtl ? 'إلى' : 'To' },
    { key: 'price', label: rtl ? 'المبلغ' : 'Amount' },
    { key: 'price_paid', label: rtl ? 'المدفوع' : 'Paid' },
    { key: 'state', label: rtl ? 'الحالة' : 'Status' },
  ];
  const toExportRow = (r: (typeof rows)[number], i: number) => ({
    ...r,
    __n: i + 1,
    start_date: formatDate(r.start_date),
    end_date: formatDate(r.end_date),
    price: money(r.price),
    price_paid: money(r.price_paid),
    state: Number(r.price_paid) >= Number(r.price) ? (rtl ? 'مدفوع' : 'Paid') : (rtl ? 'جزئي' : 'Partial'),
    phone_number: r.phone_number ?? '',
    card_code: r.card_code ?? '',
  });

  const fetchAll = async () => {
    const all: typeof rows = [];
    let pg = 1;
    for (;;) {
      const res = await getSubscriptionsReport({
        status: applied.status === 'all' ? undefined : applied.status,
        offer_id: applied.offer === 'all' ? undefined : applied.offer,
        date_field: applied.dateField,
        from: applied.from || undefined,
        to: applied.to || undefined,
        page: pg,
        limit: 300,
        sort,
        order,
      });
      all.push(...(res.data || []));
      if (all.length >= (res.pagination?.total || 0) || (res.data || []).length < 300) break;
      pg += 1;
    }
    return all;
  };

  const exportPdf = async () => {
    const all = await fetchAll();
    if (all.length === 0) { showToast(rtl ? 'لا صفوف للتصدير' : 'Nothing to export', 'error'); return; }
    const head = [rtl ? 'م' : '#', rtl ? 'العضو' : 'Member', rtl ? 'الباقة' : 'Plan', rtl ? 'من' : 'From', rtl ? 'إلى' : 'To', rtl ? 'المبلغ' : 'Amount', rtl ? 'المدفوع' : 'Paid', rtl ? 'الحالة' : 'Status'];
    const body = all.map((r, i) => {
      const e = toExportRow(r, i);
      return `<tr><td>${e.__n}</td><td>${escapeHtml(e.member_name)} (${escapeHtml(String(e.card_code))})</td><td>${escapeHtml(e.offer_title)}</td><td>${escapeHtml(String(e.start_date))}</td><td>${escapeHtml(String(e.end_date))}</td><td>${escapeHtml(String(e.price))}</td><td>${escapeHtml(String(e.price_paid))}</td><td>${escapeHtml(String(e.state))}</td></tr>`;
    }).join('');
    const ok = printDocument({
      title: rtl ? 'تقرير الاشتراكات' : 'Subscriptions report',
      innerHtml: `<h1>${escapeHtml(rtl ? 'تقرير الاشتراكات' : 'Subscriptions report')}</h1>
        <p class="muted">${escapeHtml(rtl ? `الإجمالي ${all.length}` : `Total ${all.length}`)}</p>
        <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const all = await fetchAll();
      if (all.length === 0) { showToast(rtl ? 'لا صفوف للتصدير' : 'Nothing to export', 'error'); return; }
      const matrix = buildExportMatrix(
        exportColumns,
        all.map((r, i) => toExportRow(r, i)) as unknown as Record<string, unknown>[],
        (_key, value) => (value === null || value === undefined ? '' : String(value)),
      );
      downloadMatrixXlsx('subscriptions-report.xlsx', matrix);
      showToast(rtl ? `تم تصدير ${all.length} سجل` : `Exported ${all.length} records`, 'success');
    } catch {
      showToast(rtl ? 'فشل التصدير' : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-5 bg-gray-50 min-h-screen -m-6 p-6">
      {/* 1) تصدير شمال: Excel أخضر + PDF */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button
          type="button"
          onClick={() => void exportExcel()}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-emerald-600 border border-emerald-600 rounded-xl px-3.5 py-2 hover:bg-emerald-700 transition min-h-[44px] disabled:opacity-60"
        >
          <FileSpreadsheet size={15} />
          {exporting ? '…' : 'Excel'}
        </button>
        <button
          type="button"
          onClick={() => void exportPdf()}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition min-h-[44px]"
        >
          <FileText size={15} />
          {rtl ? 'تصدير PDF' : 'Export PDF'}
        </button>
      </div>

      {/* 2) الفلاتر: صف أول + صف ثانٍ */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            {rtl ? 'الحالة' : 'Status'}
            <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} className={inputCls}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{rtl ? o.ar : o.en}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            {rtl ? 'الباقة' : 'Plan'}
            <select value={draft.offer} onChange={(e) => setDraft((d) => ({ ...d, offer: e.target.value }))} className={inputCls}>
              <option value="all">{rtl ? 'الكل' : 'All'}</option>
              {offers.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            {rtl ? 'التاريخ حسب' : 'Date by'}
            <select value={draft.dateField} onChange={(e) => setDraft((d) => ({ ...d, dateField: e.target.value }))} className={inputCls}>
              {DATE_FIELD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{rtl ? o.ar : o.en}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            {rtl ? 'من تاريخ' : 'From date'}
            <input type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            {rtl ? 'إلى تاريخ' : 'To date'}
            <input type="date" value={draft.to} min={draft.from || undefined} max={today} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className={inputCls} />
          </label>
          <button
            onClick={() => { setApplied({ ...draft }); setPage(1); }}
            className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition min-h-[44px] flex-1 min-w-[140px]"
          >
            {rtl ? 'تطبيق الفلاتر' : 'Apply filters'}
          </button>
          <button
            type="button"
            onClick={() => {
              const reset = { status: 'all', offer: 'all', dateField: 'start', from: firstOfMonth, to: today };
              setDraft(reset); setApplied(reset); setPage(1);
            }}
            className="h-11 px-4 rounded-xl text-sm font-bold transition min-h-[44px] bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            {rtl ? 'إعادة تعيين' : 'Reset'}
          </button>
        </div>
      </div>

      {isLoading ? (
        /* موجة 4 / دفعة ب — الفانطازة بنفس هندسة الشاشة النهائية: 4 كروت + جدول في
           قشرة واحدة. `rowHeight={58}` قياس حي لصف التقرير (اسم فوق كود) وطابق الحقيقي
           على 1440 و390 معًا (58/59)؛ الرأس الحقيقي 73 على 390 سببه أرضية اللمس 48px على
           زر الفرز (`styles/index.css`) لا اختلاف القشرة. */
        <div className="flex flex-col gap-5">
          <SkeletonStats columns={4} gridClassName="grid-cols-2 lg:grid-cols-4 gap-4" />
          <SkeletonPanel>
            <SkeletonTable bare rows={6} cols={columns.length} rowHeight={58} />
          </SkeletonPanel>
        </div>
      ) : isError ? (
        <EmptyState title={rtl ? 'تعذّر تحميل التقرير' : 'Failed to load report'} />
      ) : (
        <>
          {/* 3) الكروت الأربع */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label={rtl ? 'إجمالي النتائج' : 'Total results'} value={fmtNum(stats?.total ?? 0)} accent="emerald" />
            <StatCard icon={CheckCircle2} label={rtl ? 'مدفوع بالكامل' : 'Fully paid'} value={fmtNum(stats?.full_paid ?? 0)} accent="emerald" />
            <StatCard icon={Clock} label={rtl ? 'مدفوع جزئياً' : 'Partially paid'} value={fmtNum(stats?.partial ?? 0)} accent="amber" />
            <StatCard icon={Wallet} label={rtl ? 'المتبقي' : 'Remaining'} value={money(stats?.remaining ?? 0)} accent="rose" />
          </div>

          {/* 4) جدول الاشتراكات على صدفة `ui/DataTable` — القشرة نفسها (مش كارت
             `bg-white rounded-3xl` يدوي)، والترقيم جوّه نفس القشرة في `footer`. */}
          <DataTable
            columns={columns}
            data={rows}
            minWidth="900px"
            caption={rtl ? 'تقرير الاشتراكات' : 'Subscriptions report'}
            manualSorting
            sorting={[{ id: sort, desc: order === 'desc' }]}
            onSortingChange={(next) => {
              const picked = next[0];
              if (!picked) return;
              setSort(picked.id);
              setOrder(picked.desc ? 'desc' : 'asc');
              setPage(1);
            }}
            empty={
              <EmptyState
                icon={Users}
                accent="gray"
                title={rtl ? 'لا اشتراكات مطابقة للفلاتر' : 'No subscriptions match the filters'}
              />
            }
            footer={
              pagination ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="flex items-center gap-1.5 text-sm text-gray-500">
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
                  {pages > 1 && (
                    <div className="flex items-center gap-2" dir={rtl ? 'rtl' : 'ltr'}>
                      {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                        const start = pages <= 5 ? 1 : Math.max(1, Math.min(page - 2, pages - 4));
                        const p = start + i;
                        if (p > pages) return null;
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
        </>
      )}
    </div>
  );
}
