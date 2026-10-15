import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getSubscriptionsReport, listOffers, type MembershipOffer } from '../../services/api';
import { formatMoney } from '../../utils/currency';
import { formatDate, daysUntil, fmtNum } from '../../utils/date';
import { escapeHtml, printDocument } from '../../utils/print';
import { buildExportMatrix, downloadMatrixXlsx } from '../../utils/csv';
import { StatCard, EmptyState } from '../../components/dashboard';
import Spinner from '../../components/ui/Spinner';
import StatusBadge from '../../components/ui/StatusBadge';
import { FileText, FileSpreadsheet, Users, CheckCircle2, Clock, Wallet } from 'lucide-react';

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
const SORTABLE: Record<string, { labelAr: string; labelEn: string; def: 'asc' | 'desc' }> = {
  member_name: { labelAr: 'العضو', labelEn: 'Member', def: 'asc' },
  end_date: { labelAr: 'إلى', labelEn: 'To', def: 'asc' },
  amount: { labelAr: 'المبلغ', labelEn: 'Amount', def: 'desc' },
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

  const toggleSort = (key: string) => {
    if (sort === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setOrder(SORTABLE[key].def); }
    setPage(1);
  };
  const sortTh = (key: string) => {
    const cfg = SORTABLE[key];
    const active = sort === key;
    return (
      <th key={key} className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">
        <button
          type="button"
          onClick={() => toggleSort(key)}
          title={rtl ? 'اضغط للترتيب' : 'Click to sort'}
          className={`inline-flex items-center gap-1 hover:text-gray-900 ${active ? 'text-emerald-700' : ''}`}
        >
          {rtl ? cfg.labelAr : cfg.labelEn}
          <span className="material-symbols-outlined text-base">
            {active ? (order === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
          </span>
        </button>
      </th>
    );
  };

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
        <div className="py-16 flex justify-center"><Spinner /></div>
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

          {/* 4) جدول الاشتراكات بإعدادات جدول المشتركين */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-start">
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 w-10">#</th>
                    {sortTh('member_name')}
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'الهاتف' : 'Phone'}</th>
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'الباقة' : 'Plan'}</th>
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'من' : 'From'}</th>
                    {sortTh('end_date')}
                    {sortTh('amount')}
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'المدفوع' : 'Paid'}</th>
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={10} className="p-10 text-center text-gray-400 text-sm">
                      {rtl ? 'لا اشتراكات مطابقة للفلاتر' : 'No subscriptions match the filters'}
                    </td></tr>
                  )}
                  {rows.map((r, idx) => {
                    return (
                      <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-3 text-start text-gray-400 tabular-nums text-xs">
                          {((pagination?.page ?? 1) - 1) * ((pagination?.limit) ?? limit) + idx + 1}
                        </td>
                        <td className="py-3 px-3 text-start">
                          <p className="font-semibold text-gray-900 leading-tight whitespace-nowrap">{r.member_name}</p>
                          <p dir="ltr" className={`text-xs text-gray-500 whitespace-nowrap ${rtl ? 'text-right' : 'text-left'}`}>{r.card_code ?? '—'}</p>
                        </td>
                        <td className={`py-3 px-3 text-gray-500 whitespace-nowrap ${rtl ? 'text-right' : 'text-left'}`} dir="ltr">{r.phone_number || '—'}</td>
                        <td className="py-3 px-3 text-gray-800 text-start whitespace-nowrap">{r.offer_title}</td>
                        <td className="py-3 px-3 text-gray-600 text-start tabular-nums whitespace-nowrap">{formatDate(r.start_date)}</td>
                        <td className="py-3 px-3 text-start whitespace-nowrap">{endCell(r.end_date)}</td>
                        <td className="py-3 px-3 text-gray-900 font-semibold text-start tabular-nums whitespace-nowrap">{money(r.price)}</td>
                        <td className="py-3 px-3 text-emerald-600 font-semibold text-start tabular-nums whitespace-nowrap">{money(r.price_paid)}</td>
                        <td className="py-3 px-3 text-start">{stateCell(Number(r.price_paid), Number(r.price))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 0 && pagination && (
              <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-100 flex-wrap">
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
