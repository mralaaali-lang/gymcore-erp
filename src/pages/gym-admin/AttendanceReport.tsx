import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getAttendanceReport } from '../../services/api';
import { formatDate, formatTime, fmtNum } from '../../utils/date';
import { escapeHtml, printDocument } from '../../utils/print';
import { buildExportMatrix, downloadMatrixXlsx } from '../../utils/csv';
import { StatCard, Panel, EmptyState } from '../../components/dashboard';
import Chart from '../../components/charts/Chart';
import Spinner from '../../components/ui/Spinner';
import { FileText, FileCsv as FileSpreadsheet, DoorOpen, Users, CalendarDots as CalendarDays, ActivityIcon as Activity } from '@phosphor-icons/react';

// ====================================================================
// تقرير الحضور (/admin/reports/attendance) — مربوط بزر «تقرير الحضور»
// في شاشة التقارير. 4 طبقات من attendance_logs نفسه (سجل اليوم):
// كروت ← ترند يومي ← أيام الذروة ← توزيع ساعات ← السجل (بإعدادات
// جدول المشتركين: مقاس/ترتيب/مسلسل/ترقيم RTL).
// ====================================================================

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 60 → «1س 0د». */
function durationAr(min: number | null, rtl: boolean): string {
  if (min == null) return rtl ? 'بالداخل' : 'Inside';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return rtl ? `${h}س ${m}د` : `${h}h ${m}m`;
}

const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SORTABLE: Record<string, { labelAr: string; labelEn: string; def: 'asc' | 'desc' }> = {
  time: { labelAr: 'الوقت', labelEn: 'Time', def: 'desc' },
  member: { labelAr: 'العضو', labelEn: 'Member', def: 'asc' },
};

const inputCls =
  'h-11 min-w-[160px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none';

export default function AttendanceReport() {
  const { language } = useApp();
  const { showToast } = useToast();
  const rtl = language === 'ar';

  const today = localDateStr(new Date());
  const firstOfMonth = `${today.slice(0, 8)}01`;

  const [draftFrom, setDraftFrom] = useState(firstOfMonth);
  const [draftTo, setDraftTo] = useState(today);
  const [applied, setApplied] = useState({ from: firstOfMonth, to: today });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState('time');
  const [order, setOrder] = useState('desc');
  const [exporting, setExporting] = useState(false);

  const { data: res, isLoading, isError } = useApiQuery(
    ['reports-attendance', applied.from, applied.to, String(page), String(limit), sort, order],
    () => getAttendanceReport({ ...applied, page, limit, sort, order }),
    { staleTime: 30_000 },
  );
  const data = res?.data;
  const k = data?.kpis;
  const log = data?.log;

  const toggleSort = (key: string) => {
    if (sort === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setOrder(SORTABLE[key].def); }
    setPage(1);
  };
  const sortTh = (key: string, label: string) => {
    const active = sort === key;
    return (
      <th key={key} className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">
        <button
          type="button"
          onClick={() => toggleSort(key)}
          title={rtl ? 'اضغط للترتيب' : 'Click to sort'}
          className={`inline-flex items-center gap-1 hover:text-gray-900 ${active ? 'text-emerald-700' : ''}`}
        >
          {label}
          <span className="material-symbols-outlined text-base">
            {active ? (order === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
          </span>
        </button>
      </th>
    );
  };

  // أيام الذروة: تجميع الترند اليومي حسب يوم الأسبوع.
  const busyDays = (() => {
    const byDow = new Array(7).fill(0) as number[];
    (data?.daily ?? []).forEach((d) => {
      const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      byDow[dow] += d.count;
    });
    return byDow
      .map((count, dow) => ({ dow, count }))
      .sort((a, b) => b.count - a.count || a.dow - b.dow)
      .slice(0, 5);
  })();

  const hours = Array.from({ length: 24 }, (_, h) => data?.hours.find((x) => x.hour === h)?.count ?? 0);

  const exportColumns = [
    { key: '__n', label: rtl ? 'م' : '#' },
    { key: 'date', label: rtl ? 'التاريخ' : 'Date' },
    { key: 'full_name', label: rtl ? 'العضو' : 'Member' },
    { key: 'card_code', label: rtl ? 'الكود' : 'Code' },
    { key: 'in', label: rtl ? 'الدخول' : 'In' },
    { key: 'out', label: rtl ? 'الخروج' : 'Out' },
    { key: 'dur', label: rtl ? 'المدة' : 'Duration' },
  ];

  const fetchAllLog = async () => {
    const all: { check_in_time: string; check_out_time: string | null; full_name: string; card_code: string | null; duration_min: number | null }[] = [];
    let pg = 1;
    for (;;) {
      const r = await getAttendanceReport({ ...applied, page: pg, limit: 300, sort, order });
      all.push(...(r.data.log.rows || []));
      if (all.length >= (r.data.log.pagination?.total || 0) || (r.data.log.rows || []).length < 300) break;
      pg += 1;
    }
    return all;
  };

  const exportPdf = async () => {
    const all = await fetchAllLog();
    if (all.length === 0) { showToast(rtl ? 'لا صفوف للتصدير' : 'Nothing to export', 'error'); return; }
    const head = [rtl ? 'م' : '#', rtl ? 'التاريخ' : 'Date', rtl ? 'العضو' : 'Member', rtl ? 'الدخول' : 'In', rtl ? 'الخروج' : 'Out', rtl ? 'المدة' : 'Duration'];
    const body = all.map((r, i) =>
      `<tr><td>${i + 1}</td><td>${escapeHtml(formatDate(String(r.check_in_time)))}</td><td>${escapeHtml(r.full_name)} (${escapeHtml(r.card_code || '—')})</td><td>${escapeHtml(r.check_in_time ? formatTime(String(r.check_in_time)) : '—')}</td><td>${escapeHtml(r.check_out_time ? formatTime(String(r.check_out_time)) : rtl ? 'بالداخل' : 'inside')}</td><td>${escapeHtml(durationAr(r.duration_min, rtl))}</td></tr>`
    ).join('');
    const ok = printDocument({
      title: rtl ? 'تقرير الحضور' : 'Attendance report',
      innerHtml: `<h1>${escapeHtml(rtl ? 'تقرير الحضور' : 'Attendance report')}</h1>
        <p class="muted">${escapeHtml(applied.from)} ← ${escapeHtml(applied.to)}</p>
        <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const all = await fetchAllLog();
      if (all.length === 0) { showToast(rtl ? 'لا صفوف للتصدير' : 'Nothing to export', 'error'); return; }
      const matrix = buildExportMatrix(
        exportColumns,
        all.map((r, i) => ({
          __n: i + 1,
          date: formatDate(String(r.check_in_time)),
          full_name: r.full_name,
          card_code: r.card_code ?? '',
          in: r.check_in_time ? formatTime(String(r.check_in_time)) : '',
          out: r.check_out_time ? formatTime(String(r.check_out_time)) : '',
          dur: durationAr(r.duration_min, rtl),
        })) as unknown as Record<string, unknown>[],
        (_key, value) => (value === null || value === undefined ? '' : String(value)),
      );
      downloadMatrixXlsx('attendance-report.xlsx', matrix);
      showToast(rtl ? `تم تصدير ${all.length} سجل` : `Exported ${all.length} records`, 'success');
    } catch {
      showToast(rtl ? 'فشل التصدير' : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-5 bg-gray-50 min-h-screen -m-6 p-6">
      {/* 1) تصدير شمال */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button
          type="button"
          onClick={() => void exportPdf()}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition min-h-[44px]"
        >
          <FileText size={15} />
          {rtl ? 'تصدير PDF' : 'Export PDF'}
        </button>
        <button
          type="button"
          onClick={() => void exportExcel()}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition min-h-[44px] disabled:opacity-60"
        >
          <FileSpreadsheet size={15} />
          {exporting ? '…' : 'Excel'}
        </button>
      </div>

      {/* فلتر */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 flex items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          {rtl ? 'من تاريخ' : 'From date'}
          <input type="date" value={draftFrom} max={draftTo} onChange={(e) => setDraftFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          {rtl ? 'إلى تاريخ' : 'To date'}
          <input type="date" value={draftTo} min={draftFrom} max={today} onChange={(e) => setDraftTo(e.target.value)} className={inputCls} />
        </label>
        <button
          onClick={() => { setApplied({ from: draftFrom, to: draftTo }); setPage(1); }}
          className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition min-h-[44px]"
        >
          {rtl ? 'تطبيق الفلتر' : 'Apply filter'}
        </button>
        <button
          type="button"
          onClick={() => { setDraftFrom(today); setDraftTo(today); setApplied({ from: today, to: today }); setPage(1); }}
          className={`h-11 px-4 rounded-xl text-sm font-bold transition min-h-[44px] ${applied.from === today && applied.to === today ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {rtl ? 'اليوم' : 'Today'}
        </button>
      </div>

      {isLoading || !k ? (
        <div className="py-16 flex justify-center"><Spinner /></div>
      ) : isError ? (
        <EmptyState title={rtl ? 'تعذّر تحميل التقرير' : 'Failed to load report'} />
      ) : (
        <>
          {/* 2) الكروت الأربع */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={DoorOpen} label={rtl ? 'إجمالي الحضور' : 'Total visits'} value={fmtNum(k.total)} accent="emerald" />
            <StatCard icon={Users} label={rtl ? 'أعضاء فريدين' : 'Unique members'} value={fmtNum(k.unique_members)} accent="sky" />
            <StatCard icon={CalendarDays} label={rtl ? 'المعدل اليومي' : 'Daily avg'} value={fmtNum(k.daily_avg, { max: 1 })} accent="violet" />
            <StatCard icon={Activity} label={rtl ? 'متواجدون الآن' : 'Present now'} value={fmtNum(k.present_now)} accent="amber" />
          </div>

          {/* 3) المقسوم: الترند يمين + أيام الذروة شمال */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel icon={CalendarDays} accent="amber" title={rtl ? 'الحضور اليومي' : 'Daily visits'}>
              {(data.daily ?? []).every((d) => d.count === 0) ? (
                <EmptyState icon={CalendarDays} accent="gray" title={rtl ? 'لا حضور في هذا النطاق' : 'No visits in this range'} />
              ) : (
                <Chart
                  type="line"
                  height={260}
                  palette="brass"
                  categories={data.daily.map((d) => d.date.slice(5))}
                  series={[{ name: rtl ? 'عدد الحضور' : 'Visits', data: data.daily.map((d) => d.count) }]}
                  extraOptions={{
                    stroke: { curve: 'smooth', width: 3 },
                    markers: { size: 4, strokeWidth: 0 },
                    fill: { type: 'gradient', gradient: { shadeIntensity: 0.35, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
                    tooltip: { shared: true, intersect: false },
                  }}
                />
              )}
            </Panel>
            <Panel icon={CalendarDays} accent="sky" title={rtl ? 'أكثر الأيام ازدحاماً' : 'Busiest days'}>
              <ul className="divide-y divide-gray-100">
                {busyDays.map((b, i) => (
                  <li key={b.dow} className="flex items-center gap-3 py-2.5">
                    <span className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 text-sm font-extrabold flex items-center justify-center shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="text-sm font-bold text-gray-900 flex-1">{rtl ? WEEKDAYS_AR[b.dow] : WEEKDAYS_EN[b.dow]}</span>
                    <span className="text-lg font-extrabold text-gray-900 tabular-nums">{b.count}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {/* 4) توزيع الساعات بعرض الصفحة */}
          <Panel icon={Activity} accent="amber" title={rtl ? 'توزيع الحضور على الساعات' : 'Visits by hour'}>
            {hours.every((c) => c === 0) ? (
              <EmptyState icon={Activity} accent="gray" title={rtl ? 'لا حضور في هذا النطاق' : 'No visits in this range'} />
            ) : (
              <Chart
                type="bar"
                height={260}
                palette="brass"
                categories={hours.map((_, h) => String(h).padStart(2, '0'))}
                series={[{ name: rtl ? 'الحضور' : 'Visits', data: hours }]}
                showLegend
              />
            )}
          </Panel>

          {/* 5) سجل الحضور بإعدادات جدول المشتركين */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-start">
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 w-10">#</th>
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'التاريخ' : 'Date'}</th>
                    {sortTh('member', rtl ? 'العضو' : 'Member')}
                    {sortTh('time', rtl ? 'الدخول' : 'In')}
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'الخروج' : 'Out'}</th>
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'المدة' : 'Duration'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(log?.rows ?? []).length === 0 && (
                    <tr><td colSpan={7} className="p-10 text-center text-gray-400 text-sm">
                      {rtl ? 'لا سجلات في هذا النطاق' : 'No records in this range'}
                    </td></tr>
                  )}
                  {(log?.rows ?? []).map((r, idx) => (
                    <tr key={`${r.check_in_time}-${idx}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3 text-start text-gray-400 tabular-nums text-xs">
                        {((log?.pagination.page ?? 1) - 1) * ((log?.pagination.limit) ?? limit) + idx + 1}
                      </td>
                      <td className="py-3 px-3 text-gray-700 text-start whitespace-nowrap">{formatDate(String(r.check_in_time))}</td>
                      <td className="py-3 px-3 text-start">
                        <p className="font-semibold text-gray-900 leading-tight whitespace-nowrap">{r.full_name}</p>
                        <p dir="ltr" className={`text-xs text-gray-500 whitespace-nowrap ${rtl ? 'text-right' : 'text-left'}`}>{r.card_code ?? '—'}</p>
                      </td>
                      <td className={`py-3 px-3 font-semibold tabular-nums whitespace-nowrap text-emerald-600 ${rtl ? 'text-right' : 'text-left'}`} dir="ltr">
                        {r.check_in_time ? formatTime(String(r.check_in_time)) : '—'}
                      </td>
                      <td className={`py-3 px-3 text-gray-500 tabular-nums whitespace-nowrap ${rtl ? 'text-right' : 'text-left'}`} dir="ltr">
                        {r.check_out_time ? formatTime(String(r.check_out_time)) : '—'}
                      </td>
                      <td className="py-3 px-3 text-start whitespace-nowrap">
                        <span className={`text-xs font-bold tabular-nums ${r.duration_min == null ? 'text-emerald-600' : 'text-gray-600'}`}>
                          {durationAr(r.duration_min, rtl)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(log?.rows ?? []).length > 0 && log?.pagination && (
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
                {log.pagination.total_pages > 1 && (
                  <div className="flex items-center gap-2" dir={rtl ? 'rtl' : 'ltr'}>
                    {Array.from({ length: Math.min(log.pagination.total_pages, 5) }, (_, i) => {
                      const start = log.pagination.total_pages <= 5 ? 1 : Math.max(1, Math.min(page - 2, log.pagination.total_pages - 4));
                      const p = start + i;
                      if (p > log.pagination.total_pages) return null;
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
