import { useEffect, useMemo, useState } from 'react';
import { formatTime } from '../../utils/date';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { getTodayAttendance, checkOutAttendance } from '../../services/api';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useMutation } from '@tanstack/react-query';
import Spinner from '../../components/ui/Spinner';
import CheckInCard from '../../components/attendance/CheckInCard';
import { StatCard, Panel, EmptyState } from '../../components/dashboard';
import { escapeHtml, printDocument } from '../../utils/print';
import {
  DoorOpen, LogOut,
  FileText, Users, Clock, Calendar, Activity,
} from 'lucide-react';

// ====================================================================
// §35ب — redesigned attendance screen.
// Layout, top to bottom: header (title right · quick actions left · PDF
// below them) → the unified CheckInCard (the SAME component that is now
// the first card of the dashboard) → live clock + day filter bar →
// three honest stat cards → "present now" and "day log" tables.
// Every number comes from /api/attendance/today (today or ?date=) and
// the server's lazy >1h auto-checkout — nothing is decorative.
// ====================================================================

// Row shape returned by GET /api/attendance/today → { data: [...] }.
// The backend column is full_name (NOT member_name). §34ح — check_out_time
// is NULL while the member is still inside.
interface AttendanceRow {
  id: string;
  check_in_time: string;
  check_out_time: string | null;
  entry_method: string;
  full_name: string;
  phone_number?: string;
  verified_by_name?: string;
}

/** Local-time YYYY-MM-DD (the server compares check_in_time::date in DB
 *  local time; the gym operates in one timezone, so local is honest). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Live clock in 12-hour format (front-desk wall clock convention). */
function clock12(d: Date, rtl: boolean): { time: string; suffix: string } {
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    time: `${pad(h12)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    suffix: rtl ? (h24 < 12 ? 'ص' : 'م') : (h24 < 12 ? 'AM' : 'PM'),
  };
}

export default function AttendanceRecords() {
  const { language, role } = useApp();
  const { showToast } = useToast();
  const rtl = language === 'ar';
  const queryClient = useQueryClient();

  const canManage = role === 'gym-admin' || role === 'reception';

  // Selected log day (§35ب filter: اليوم / أمس / تاريخ).
  const todayStr = localDateStr(new Date());
  const yesterdayStr = localDateStr(new Date(Date.now() - 24 * 3600_000));
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // §35ب — live clock HH:MM:SS beside the filter bar.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  // Today's rows — drive the "متواجدون الآن" table + stats + lookup already
  // refreshed by the card's own queries; react-query dedupes by key.
  const { data: todayRes, isLoading: todayLoading } = useApiQuery(
    ['gym', 'attendance', 'today'],
    () => getTodayAttendance(),
    { staleTime: 10_000, refetchInterval: 30_000 }
  );
  const todayRows = useMemo(() => ((todayRes?.records ?? []) as unknown as AttendanceRow[]), [todayRes]);
  const presentRows = todayRows.filter((r) => !r.check_out_time);

  // Selected-day log — the same endpoint with ?date= (§35ب server change).
  const { data: logRes, isLoading: logLoading } = useApiQuery<AttendanceRow[]>(
    ['attendance', 'log', selectedDate],
    async () => (await getTodayAttendance(selectedDate)).records as unknown as AttendanceRow[],
    { staleTime: selectedDate === todayStr ? 15_000 : 5 * 60_000 }
  );
  const logRows = logRes ?? [];
  const totalDay = logRows.length;
  const leftDay = logRows.filter((r) => r.check_out_time).length;

  // §34ح — manual check-out per open session.
  const checkOutMutation = useMutation({
    mutationFn: (id: string) => checkOutAttendance(id),
    onSuccess: () => {
      showToast(rtl ? 'تم تسجيل الخروج' : 'Check-out recorded', 'success');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['gym', 'attendance', 'today'] });
      queryClient.invalidateQueries({ queryKey: ['nav', 'badges'] });
    },
    onError: () => showToast(rtl ? 'فشل تسجيل الخروج' : 'Check-out failed', 'error'),
  });

  const typeLabels: Record<string, string> = {
    regular: rtl ? 'عادي' : 'Regular', pt: rtl ? 'تدريب شخصي' : 'PT', class: rtl ? 'حصة' : 'Class',
    qr: 'QR', qr_code: 'QR', manual: rtl ? 'يدوي' : 'Manual', manual_phone: rtl ? 'يدوي' : 'Manual',
  };

  // §35ب — PDF = print dialog of exactly the sheet currently displayed.
  const exportPdf = () => {
    const rows = logRows;
    const ok = printDocument({
      title: rtl ? `سجل الحضور ${selectedDate}` : `Attendance log ${selectedDate}`,
      innerHtml: `
        <h1>${escapeHtml(rtl ? 'سجل الحضور' : 'Attendance Log')} — ${escapeHtml(selectedDate)}</h1>
        <p class="muted">${escapeHtml(rtl ? 'إجمالي الحضور' : 'Total')}: ${rows.length} ·
          ${escapeHtml(rtl ? 'غادروا' : 'Checked out')}: ${rows.filter((r) => r.check_out_time).length} ·
          ${escapeHtml(rtl ? 'تاريخ التصدير' : 'Exported')}: ${escapeHtml(`${localDateStr(new Date())} ${formatTime(new Date().toISOString())}`)}</p>
        ${rows.length === 0 ? `<p class="muted">${escapeHtml(rtl ? 'لا توجد تسجيلات في هذا اليوم' : 'No records for this day')}</p>` : `
        <table>
          <thead><tr>
            <th>#</th><th>${escapeHtml(rtl ? 'الاسم' : 'Member')}</th>
            <th>${escapeHtml(rtl ? 'دخول' : 'Check-in')}</th><th>${escapeHtml(rtl ? 'خروج' : 'Check-out')}</th>
            <th>${escapeHtml(rtl ? 'الطريقة' : 'Method')}</th><th>${escapeHtml(rtl ? 'سجّله' : 'Recorded by')}</th>
          </tr></thead>
          <tbody>${rows.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(r.full_name)}</td>
              <td>${escapeHtml(formatTime(r.check_in_time))}</td>
              <td>${escapeHtml(r.check_out_time ? formatTime(r.check_out_time) : (rtl ? 'بالداخل' : 'inside'))}</td>
              <td>${escapeHtml(typeLabels[r.entry_method] || r.entry_method)}</td>
              <td>${escapeHtml(r.verified_by_name || '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>`}`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      {/* الأزرار السريعة (مشترك/بيع/حصة) حُذفت بطلب صاحب المشروع */}

      {/* §35ب — PDF export sits under the quick-action buttons */}
      <div className="flex">
        <button
          onClick={exportPdf}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition"
        >
          <FileText size={15} />
          {rtl ? 'تصدير PDF' : 'Export PDF'}
        </button>
      </div>

      {/* The unified check-in card — identical to the dashboard's first card */}
      <CheckInCard />

      {/* Filter bar — live clock + today label + day picker */}
      <Panel icon={Clock} accent="sky" title={rtl ? 'اليوم المعروض' : 'Displayed day'}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl md:text-3xl font-extrabold text-gray-900 tabular-nums" dir="ltr">
            {clock12(now, rtl).time}
          </span>
          <span className="text-sm font-bold text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1">
            {clock12(now, rtl).suffix}
          </span>
          <span className="text-sm text-gray-500 font-medium">{selectedDate}</span>
          <div className="flex items-center gap-2 ms-auto flex-wrap">
            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`min-h-[44px] md:min-h-0 px-4 py-2 rounded-xl text-sm font-bold transition ${selectedDate === todayStr ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {rtl ? 'اليوم' : 'Today'}
            </button>
            <button
              onClick={() => setSelectedDate(yesterdayStr)}
              className={`min-h-[44px] md:min-h-0 px-4 py-2 rounded-xl text-sm font-bold transition ${selectedDate === yesterdayStr ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {rtl ? 'أمس' : 'Yesterday'}
            </button>
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              aria-label={rtl ? 'اختر تاريخًا' : 'Pick a date'}
              className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            />
          </div>
        </div>
      </Panel>

      {/* Three honest stat cards — distinct icons, all from real rows */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard icon={Users} label={rtl ? 'إجمالي الحضور' : 'Total check-ins'} value={totalDay} accent="emerald" />
        <StatCard icon={DoorOpen} label={rtl ? 'متواجدون الآن' : 'Present now'} value={presentRows.length} accent="violet" />
        <StatCard icon={LogOut} label={rtl ? 'غادروا' : 'Checked out'} value={leftDay} accent="sky" />
      </div>

      {/* Table 1 — who is inside right now (open sessions, today only) */}
      <Panel icon={Activity} accent="emerald" title={rtl ? 'متواجدون الآن' : 'Present now'}>
        {todayLoading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : presentRows.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            accent="gray"
            title={rtl ? 'لا يوجد أعضاء بالداخل الآن' : 'Nobody is inside right now'}
            description={rtl ? 'كل الجلسات المفتوحة أُغلقت (خروج يدوي أو تلقائي بعد ساعة).' : 'All sessions are closed (manual exit or the one-hour auto check-out).'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الاسم' : 'Member'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'منذ' : 'Since'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الطريقة' : 'Method'}</th>
                  {canManage && <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'خروج' : 'Exit'}</th>}
                </tr>
              </thead>
              <tbody>
                {presentRows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium">{r.full_name}</td>
                    <td className="px-4 py-3 text-emerald-600 font-medium" dir="ltr">{formatTime(r.check_in_time)}</td>
                    <td className="px-4 py-3 text-gray-500">{typeLabels[r.entry_method] || r.entry_method}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => checkOutMutation.mutate(r.id)}
                          disabled={checkOutMutation.isPending}
                          className="px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 text-xs font-semibold hover:bg-sky-100 transition disabled:opacity-50 min-h-[36px]"
                        >
                          {rtl ? 'تسجيل خروج' : 'Check out'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Table 2 — the full log of the selected day */}
      <Panel icon={Calendar} accent="violet" title={selectedDate === todayStr ? (rtl ? 'سجل اليوم' : "Today's log") : (rtl ? `سجل ${selectedDate}` : `Log ${selectedDate}`)}>
        {logLoading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : logRows.length === 0 ? (
          <EmptyState
            icon={Calendar}
            accent="gray"
            title={rtl ? `لا توجد تسجيلات في ${selectedDate}` : `No records on ${selectedDate}`}
            description={rtl ? 'اختر يومًا آخر أو سجّل حضورًا من الكارت بالأعلى.' : 'Pick another day, or check someone in with the card above.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الاسم' : 'Member'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'دخول' : 'Check-in'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الطريقة' : 'Method'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'سجّله' : 'Recorded by'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'خروج' : 'Check-out'}</th>
                </tr>
              </thead>
              <tbody>
                {logRows.map((r, i) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{r.full_name}</td>
                    <td className="px-4 py-3 text-emerald-600 font-medium" dir="ltr">{formatTime(r.check_in_time)}</td>
                    <td className="px-4 py-3 text-gray-500">{typeLabels[r.entry_method] || r.entry_method}</td>
                    <td className="px-4 py-3 text-gray-500">{r.verified_by_name || '—'}</td>
                    <td className="px-4 py-3">
                      {r.check_out_time ? (
                        <span className="text-gray-500 font-medium" dir="ltr">{formatTime(r.check_out_time)}</span>
                      ) : (
                        <span className="text-emerald-600 font-semibold text-xs">{rtl ? 'بالداخل' : 'inside'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
