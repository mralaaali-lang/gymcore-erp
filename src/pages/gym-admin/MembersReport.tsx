import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getMembersReport, type MembersReportRow } from '../../services/api';
import { formatDate, daysUntil, fmtNum } from '../../utils/date';
import { escapeHtml, printDocument } from '../../utils/print';
import { buildExportMatrix, downloadMatrixXlsx } from '../../utils/csv';
import { StatCard, EmptyState } from '../../components/dashboard';
import Spinner from '../../components/ui/Spinner';
import StatusBadge from '../../components/ui/StatusBadge';
import { FileText, Users, User, CreditCard, FileCsv as FileSpreadsheet } from '@phosphor-icons/react';
import EditMemberModal from './EditMemberModal';
import type { MemberResponse } from '../../services/api';

// ====================================================================
// تقرير الأعضاء (/admin/reports/members) — مربوط بزر «تقرير الأعضاء»
// في شاشة التقارير. نفس خواص جدول المشتركين بالكامل: مقاس صفحة،
// ترتيب سيرفر-side، مسلسل عام، ترقيم RTL، وضغطة الصف للتعديل السريع.
// تعريف الحالة: نشط = اشتراك سارٍ، محظور = blacklist، وغيرهما «—»
// (الفاضي = بدون اشتراك سارٍ، وليس موقوفًا).
// ====================================================================

const STATUS_OPTIONS = [
  { value: 'all', ar: 'الكل', en: 'All' },
  { value: 'active', ar: 'نشط', en: 'Active' },
  { value: 'suspended', ar: 'موقوف', en: 'Suspended' },
  { value: 'blacklisted', ar: 'محظور', en: 'Blacklisted' },
];
const GENDER_OPTIONS = [
  { value: 'all', ar: 'الكل', en: 'All' },
  { value: 'male', ar: 'ذكر', en: 'Male' },
  { value: 'female', ar: 'أنثى', en: 'Female' },
];
const SUBS_OPTIONS = [
  { value: 'all', ar: 'الكل', en: 'All' },
  { value: 'active', ar: 'اشتراك نشط', en: 'Active subscription' },
  { value: 'none', ar: 'بدون اشتراك', en: 'No subscription' },
];

// الأعمدة القابلة للترتيب + الاتجاه الافتراضي الذكي لكل عمود.
const SORTABLE: Record<string, { labelAr: string; labelEn: string; def: 'asc' | 'desc' }> = {
  member_name: { labelAr: 'الاسم', labelEn: 'Name', def: 'asc' },
  subs_count: { labelAr: 'الاشتراكات', labelEn: 'Subscriptions', def: 'desc' },
  visits: { labelAr: 'الحضور', labelEn: 'Visits', def: 'desc' },
  active_end_date: { labelAr: 'انتهاء الاشتراك', labelEn: 'Sub ends', def: 'asc' },
};

const inputCls =
  'h-11 min-w-[150px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none';

function genderLabel(g: string | null, rtl: boolean): string {
  if (g === 'male') return rtl ? 'ذكر' : 'Male';
  if (g === 'female') return rtl ? 'أنثى' : 'Female';
  return '—';
}

export default function MembersReport() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';

  const [draft, setDraft] = useState({ status: 'all', gender: 'all', subscription: 'all' });
  const [applied, setApplied] = useState({ status: 'all', gender: 'all', subscription: 'all' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState('member_name');
  const [order, setOrder] = useState('asc');
  const [editing, setEditing] = useState<MembersReportRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError } = useApiQuery(
    ['reports-members', applied.status, applied.gender, applied.subscription, String(page), String(limit), sort, order],
    () => getMembersReport({
      status: applied.status === 'all' ? undefined : applied.status,
      gender: applied.gender === 'all' ? undefined : applied.gender,
      subscription: applied.subscription === 'all' ? undefined : applied.subscription,
      page, limit, sort, order,
    }),
    { staleTime: 30_000 },
  );
  const rows = data?.data ?? [];
  const stats = data?.stats;
  const pagination = data?.pagination;
  const pages = pagination ? pagination.total_pages : 0;

  const toggleSort = (key: string) => {
    if (sort === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder(SORTABLE[key].def);
    }
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

  const statusCell = (r: MembersReportRow) => {
    if (r.is_blacklisted) return <StatusBadge status={rtl ? 'محظور' : 'Blacklisted'} variant="error" />;
    if (r.active_end_date) return <StatusBadge status={rtl ? 'نشط' : 'Active'} variant="success" />;
    return <span />;
  };

  const endCell = (end: string | null) => {
    if (!end) return <span className="text-gray-400">—</span>;
    const left = daysUntil(end);
    const soon = left !== null && left <= 7;
    return (
      <span className={soon ? 'text-red-600 font-bold' : 'text-gray-700'}>
        {formatDate(end)}{' '}
        {left !== null && left >= 0 && (
          <span className={`text-xs font-bold ${soon ? 'text-red-600' : 'text-emerald-600'}`}>
            ({rtl ? `${left} يوم` : `${left}d`})
          </span>
        )}
      </span>
    );
  };

  const exportColumns = [
    { key: '__n', label: rtl ? 'م' : '#' },
    { key: 'card_code', label: rtl ? 'الكود' : 'Code' },
    { key: 'full_name', label: rtl ? 'الاسم' : 'Name' },
    { key: 'phone_number', label: rtl ? 'الهاتف' : 'Phone' },
    { key: 'gender', label: rtl ? 'الجنس' : 'Gender' },
    { key: 'subs_count', label: rtl ? 'الاشتراكات' : 'Subscriptions' },
    { key: 'visits', label: rtl ? 'الحضور' : 'Visits' },
    { key: 'active_end_date', label: rtl ? 'انتهاء الاشتراك' : 'Sub ends' },
    { key: 'status', label: rtl ? 'الحالة' : 'Status' },
  ];

  const toExportRow = (r: MembersReportRow, i: number) => ({
    ...r,
    __n: i + 1,
    gender: genderLabel(r.gender, rtl),
    active_end_date: r.active_end_date ? formatDate(r.active_end_date) : '',
    status: r.is_blacklisted ? (rtl ? 'محظور' : 'Blacklisted') : r.active_end_date ? (rtl ? 'نشط' : 'Active') : '',
    phone_number: r.phone_number ?? '',
    card_code: r.card_code ?? '',
  });

  const exportPdf = () => {
    const all = rows;
    if (all.length === 0) { showToast(rtl ? 'لا صفوف للتصدير' : 'Nothing to export', 'error'); return; }
    const head = [rtl ? 'م' : '#', rtl ? 'الكود' : 'Code', rtl ? 'الاسم' : 'Name', rtl ? 'الهاتف' : 'Phone', rtl ? 'الجنس' : 'Gender', rtl ? 'اشتراكات' : 'Subs', rtl ? 'حضور' : 'Visits', rtl ? 'ينتهي' : 'Ends', rtl ? 'الحالة' : 'Status'];
    const body = all.map((r, i) => {
      const e = toExportRow(r, i);
      return `<tr><td>${e.__n}</td><td>${escapeHtml(String(e.card_code))}</td><td>${escapeHtml(e.full_name)}</td><td>${escapeHtml(String(e.phone_number))}</td><td>${escapeHtml(String(e.gender))}</td><td>${e.subs_count}</td><td>${e.visits}</td><td>${escapeHtml(String(e.active_end_date))}</td><td>${escapeHtml(String(e.status))}</td></tr>`;
    }).join('');
    const ok = printDocument({
      title: rtl ? 'تقرير الأعضاء' : 'Members report',
      innerHtml: `<h1>${escapeHtml(rtl ? 'تقرير الأعضاء' : 'Members report')}</h1>
        <p class="muted">${escapeHtml(rtl ? `الإجمالي ${all.length}` : `Total ${all.length}`)}</p>
        <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const all: MembersReportRow[] = [];
      let pg = 1;
      for (;;) {
        const res = await getMembersReport({
          status: applied.status === 'all' ? undefined : applied.status,
          gender: applied.gender === 'all' ? undefined : applied.gender,
          subscription: applied.subscription === 'all' ? undefined : applied.subscription,
          page: pg,
          limit: 300,
          sort,
          order,
        });
        all.push(...(res.data || []));
        if (all.length >= (res.pagination?.total || 0) || (res.data || []).length < 300) break;
        pg += 1;
      }
      if (all.length === 0) { showToast(rtl ? 'لا صفوف للتصدير' : 'Nothing to export', 'error'); return; }
      const matrix = buildExportMatrix(
        exportColumns,
        all.map((r, i) => toExportRow(r, i)) as unknown as Record<string, unknown>[],
        (_key, value) => (value === null || value === undefined ? '' : String(value)),
      );
      downloadMatrixXlsx('members-report.xlsx', matrix);
      showToast(rtl ? `تم تصدير ${all.length} سجل` : `Exported ${all.length} records`, 'success');
    } catch {
      showToast(rtl ? 'فشل التصدير' : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-5 bg-gray-50 min-h-screen -m-6 p-6">
      {/* 1) الهيدر: العنوان يمين (الشريط العلوي) + تصدير شمال */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button
          type="button"
          onClick={exportPdf}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition min-h-[44px]"
        >
          <FileText size={15} />
          {rtl ? 'تصدير PDF' : 'Export PDF'}
        </button>
        <button
          type="button"
          onClick={exportExcel}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition min-h-[44px] disabled:opacity-60"
        >
          <FileSpreadsheet size={15} />
          {exporting ? '…' : 'Excel'}
        </button>
      </div>

      {/* 2) كارت الفلاتر */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 flex items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          {rtl ? 'حالة العضو' : 'Status'}
          <select value={draft.status} onChange={(e) => { setDraft((d) => ({ ...d, status: e.target.value })); }} className={inputCls}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{rtl ? o.ar : o.en}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          {rtl ? 'الجنس' : 'Gender'}
          <select value={draft.gender} onChange={(e) => { setDraft((d) => ({ ...d, gender: e.target.value })); }} className={inputCls}>
            {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{rtl ? o.ar : o.en}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          {rtl ? 'الاشتراك' : 'Subscription'}
          <select value={draft.subscription} onChange={(e) => { setDraft((d) => ({ ...d, subscription: e.target.value })); }} className={inputCls}>
            {SUBS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{rtl ? o.ar : o.en}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => { setApplied({ ...draft }); setPage(1); }}
          className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition min-h-[44px] ms-auto"
        >
          {rtl ? 'تطبيق' : 'Apply'}
        </button>
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
            <StatCard icon={User} label={rtl ? 'ذكور' : 'Males'} value={fmtNum(stats?.males ?? 0)} accent="sky" />
            <StatCard icon={User} label={rtl ? 'إناث' : 'Females'} value={fmtNum(stats?.females ?? 0)} accent="rose" />
            <StatCard icon={CreditCard} label={rtl ? 'اشتراك نشط' : 'Active subscription'} value={fmtNum(stats?.with_active ?? 0)} accent="violet" />
          </div>

          {/* 4) جدول الأعضاء — نفس خواص جدول المشتركين */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-start">
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 w-10">#</th>
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'الكود' : 'Code'}</th>
                    {sortTh('member_name')}
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'الهاتف' : 'Phone'}</th>
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'الجنس' : 'Gender'}</th>
                    {sortTh('subs_count')}
                    {sortTh('visits')}
                    {sortTh('active_end_date')}
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={10} className="p-10 text-center text-gray-400 text-sm">
                      {rtl ? 'لا أعضاء مطابقين للفلاتر' : 'No members match the filters'}
                    </td></tr>
                  )}
                  {rows.map((r, idx) => (
                    <tr
                      key={r.id}
                      onClick={() => setEditing(r)}
                      title={rtl ? 'اضغط للتعديل السريع' : 'Click for quick edit'}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-3 text-start text-gray-400 tabular-nums text-xs">
                        {((pagination?.page ?? 1) - 1) * ((pagination?.limit) ?? limit) + idx + 1}
                      </td>
                      <td className={`py-3 px-3 font-extrabold text-gray-900 tabular-nums whitespace-nowrap ${rtl ? 'text-right' : 'text-left'}`} dir="ltr">{r.card_code ?? '—'}</td>
                      <td className="py-3 px-3 font-semibold text-gray-900 text-start whitespace-nowrap">{r.full_name}</td>
                      <td className={`py-3 px-3 text-gray-500 whitespace-nowrap ${rtl ? 'text-right' : 'text-left'}`} dir="ltr">{r.phone_number || '—'}</td>
                      <td className="py-3 px-3 text-gray-600 text-start whitespace-nowrap">{genderLabel(r.gender, rtl)}</td>
                      <td className="py-3 px-3 text-start">
                        <span className="inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full bg-orange-50 text-orange-600 text-xs font-bold tabular-nums">
                          {fmtNum(r.subs_count)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-start">
                        <span className="inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full bg-sky-50 text-sky-700 text-xs font-bold tabular-nums">
                          {fmtNum(r.visits)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-start whitespace-nowrap">{endCell(r.active_end_date)}</td>
                      <td className="py-3 px-3 text-start">{statusCell(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ترقيم + مقاس */}
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

      {editing && (
        <EditMemberModal
          member={editing as unknown as MemberResponse}
          onClose={() => setEditing(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['reports-members'] })}
        />
      )}
    </div>
  );
}
