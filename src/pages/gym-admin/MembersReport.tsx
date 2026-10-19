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
import DataTable, { type TableColumn } from '../../components/ui/DataTable';
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

// الأعمدة القابلة للترتيب = قائمة `SORTS` البيضا في `getMembersReport`
// (member_name · active_end_date · visits · subs_count) بالظبط، والاتجاه
// الافتراضي الذكي بقى `sortDescFirst` جوّه تعريف العمود.

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
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
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

  const statusCell = (r: MembersReportRow) => {
    if (r.is_blacklisted) return <StatusBadge status={rtl ? 'محظور' : 'Blacklisted'} variant="error" />;
    if (r.active_end_date) return <StatusBadge status={rtl ? 'نشط' : 'Active'} variant="success" />;
    return <span className="text-ink-faint">—</span>;
  };

  const endCell = (end: string | null) => {
    if (!end) return <span className="text-ink-faint">—</span>;
    const left = daysUntil(end);
    const soon = left !== null && left <= 7;
    return (
      <span className={soon ? 'font-bold text-destructive' : undefined}>
        {formatDate(end)}{' '}
        {left !== null && left >= 0 && (
          <span className={`text-xs font-bold ${soon ? 'text-destructive' : 'text-primary'}`}>
            ({rtl ? `${left} يوم` : `${left}d`})
          </span>
        )}
      </span>
    );
  };

  // brass-soft في الداكن (#594222) مفتاح hover مش خلفية نص: pine فوقه = 4.06
  // (مقيس computed). chalk (#f1f5f9) على نفس الخلفية = 8.61، وهو فوق مستوى
  // الاقتران في الفاتح (9.96).
  const countChip = (value: number | null | undefined) => (
    <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-brass-soft px-2 py-1 text-xs font-bold text-pine tabular-nums dark:text-foreground">
      {fmtNum(value ?? 0)}
    </span>
  );

  const columns: TableColumn<MembersReportRow>[] = [
    {
      id: '__n',
      label: rtl ? 'م' : '#',
      width: '2.5rem',
      cell: (_r, i) => (
        <span className="text-xs text-ink-faint tabular-nums">
          {((pagination?.page ?? 1) - 1) * (pagination?.limit ?? limit) + i + 1}
        </span>
      ),
    },
    {
      // الكود بطاقة العضو: LTR دايماً (أرقام وحروف لاتينية) جوه خلية الجدول RTL.
      id: 'card_code',
      label: rtl ? 'الكود' : 'Code',
      value: (r) => r.card_code,
      cell: (r) => (
        <span dir="ltr" className="font-extrabold text-foreground tabular-nums whitespace-nowrap">
          {r.card_code ?? '—'}
        </span>
      ),
    },
    {
      id: 'member_name',
      label: rtl ? 'الاسم' : 'Name',
      sortable: true,
      value: (r) => r.full_name,
      cell: (r) => <span className="font-semibold text-foreground whitespace-nowrap">{r.full_name}</span>,
    },
    {
      id: 'phone_number',
      label: rtl ? 'الهاتف' : 'Phone',
      value: (r) => r.phone_number,
      cell: (r) => (
        <span dir="ltr" className="whitespace-nowrap">{r.phone_number || '—'}</span>
      ),
    },
    { id: 'gender', label: rtl ? 'الجنس' : 'Gender', cell: (r) => genderLabel(r.gender, rtl) },
    {
      id: 'subs_count',
      label: rtl ? 'الاشتراكات' : 'Subscriptions',
      sortable: true,
      sortDescFirst: true,
      numeric: true,
      cell: (r) => countChip(r.subs_count),
    },
    {
      id: 'visits',
      label: rtl ? 'الحضور' : 'Visits',
      sortable: true,
      sortDescFirst: true,
      numeric: true,
      cell: (r) => countChip(r.visits),
    },
    {
      id: 'active_end_date',
      label: rtl ? 'انتهاء الاشتراك' : 'Sub ends',
      sortable: true,
      cell: (r) => endCell(r.active_end_date),
    },
    { id: 'status', label: rtl ? 'الحالة' : 'Status', cell: (r) => statusCell(r) },
  ];

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

          {/* 4) جدول الأعضاء — نفس الصدفة والعقد اللي بقوا لباقي الجداول. */}
          <DataTable
            columns={columns}
            data={rows}
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
            rowTitle={() => (rtl ? 'اضغط للتعديل السريع' : 'Click for quick edit')}
            minWidth="900px"
            empty={rtl ? 'لا أعضاء مطابقين للفلاتر' : 'No members match the filters'}
            footer={
              rows.length > 0 && pagination ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    {rtl ? 'عرض' : 'Show'}
                    <select
                      className="rounded-shell border border-hairline bg-card px-2 py-1.5 text-sm min-h-[40px]"
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
                            aria-current={page === p ? 'page' : undefined}
                            className={`w-9 h-9 rounded-shell text-sm font-medium transition min-w-[44px] ${
                              page === p
                                ? 'bg-primary text-primary-foreground'
                                : 'border border-hairline text-muted-foreground hover:bg-muted'
                            }`}
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
