import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock, Save } from 'lucide-react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { fmtNum } from '../../utils/date';
import { getHrAttendance, saveHrAttendance } from '../../services/api';
import { StatCard, Panel, EmptyState } from '../../components/dashboard';
import { StaffAvatar } from './HrMainPage';
import PageLoader from '../../components/shared/PageLoader';

// ====================================================================
// حضور وانصراف الموظفين (/admin/hr/attendance) — دفتر تحضير يومي:
// التنقل السابق/التالي بدل التقويم + radio inline (حاضر/متأخر/غائب/
// إجازة/مرضية) — كل حالة بأثر مختلف. التأخير مقترح آليًا مقابل الشيفت
// + سماح الدقائق من ملف الموظف.
// ====================================================================

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shift(d: Date, n: number): string {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return localDateStr(c);
}

const STATUS = [
  { key: 'present', ar: 'حاضر', cls: 'bg-emerald-500 text-white border-emerald-500' },
  { key: 'late', ar: 'متأخر', cls: 'bg-amber-500 text-white border-amber-500' },
  { key: 'absent', ar: 'غائب', cls: 'bg-red-500 text-white border-red-500' },
  { key: 'leave', ar: 'إجازة', cls: 'bg-sky-500 text-white border-sky-500' },
  { key: 'sick', ar: 'مرضية', cls: 'bg-violet-500 text-white border-violet-500' },
] as const;

type StatusKey = (typeof STATUS)[number]['key'];

export default function HrAttendancePage() {
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const [date, setDate] = useState(localDateStr(new Date()));
  const [marks, setMarks] = useState<Record<string, StatusKey>>({});

  const { data, isLoading } = useApiQuery(
    ['hr', 'attendance', date],
    () => getHrAttendance(date),
    { staleTime: 30_000 },
  );
  const rows = data?.data ?? [];
  const stats = data?.stats;

  const statusOf = (r: (typeof rows)[number]): StatusKey =>
    marks[r.staff_id] ?? (r.saved_status as StatusKey | null) ?? (r.suggested as StatusKey | null) ?? 'absent';

  const save = useMutation({
    mutationFn: () => saveHrAttendance(date, rows.map((r) => ({ staff_user_id: r.staff_id, status: statusOf(r) }))),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'attendance'] });
      setMarks({});
      showToast(rtl ? `تم حفظ تحضير ${fmtNum(res.data.saved)} موظف` : `Saved ${res.data.saved}`, 'success');
    },
    onError: () => showToast(rtl ? 'فشل الحفظ' : 'Save failed', 'error'),
  });

  const dirty = Object.keys(marks).length > 0;

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-extrabold text-gray-900">{rtl ? 'حضور وانصراف الموظفين' : 'Staff attendance'}</h1>
          <button type="button" onClick={() => navigate('/admin/hr')}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl shadow-sm hover:bg-gray-50">
            <ArrowRight size={16} className={rtl ? '' : 'rotate-180'} />
            {rtl ? 'رجوع' : 'Back'}
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={Clock} label={rtl ? 'إجمالي الموظفين' : 'Total'} value={fmtNum(stats?.total ?? 0)} accent="violet" />
          <StatCard icon={Clock} label={rtl ? 'حاضر' : 'Present'} value={fmtNum(stats?.present ?? 0)} accent="emerald" />
          <StatCard icon={Clock} label={rtl ? 'متأخر' : 'Late'} value={fmtNum(stats?.late ?? 0)} accent="amber" />
          <StatCard icon={Clock} label={rtl ? 'غائب' : 'Absent'} value={fmtNum(stats?.absent ?? 0)} accent="rose" />
        </div>

        {/* التنقل اليومي */}
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => setDate((d) => shift(new Date(`${d}T00:00:00`), -1))}
            className="min-h-[44px] px-4 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">
            {rtl ? 'اليوم السابق' : 'Prev day'}
          </button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none" />
          <button type="button" onClick={() => setDate(localDateStr(new Date()))}
            className="min-h-[44px] px-4 rounded-xl bg-gray-900 text-white text-sm font-bold">
            {rtl ? 'عرض اليوم' : 'Today'}
          </button>
          <button type="button" onClick={() => setDate((d) => shift(new Date(`${d}T00:00:00`), 1))}
            className="min-h-[44px] px-4 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">
            {rtl ? 'اليوم التالي' : 'Next day'}
          </button>
          {dirty && (
            <button type="button" onClick={() => save.mutate()} disabled={save.isPending}
              className="min-h-[44px] px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">
              <Save size={16} />
              {rtl ? `حفظ التحضير (${fmtNum(Object.keys(marks).length)})` : `Save (${Object.keys(marks).length})`}
            </button>
          )}
        </div>

        <Panel title={`${rtl ? 'سجل الحضور' : 'Attendance log'} - ${date} (${fmtNum(rows.length)})`}>
          {isLoading ? (
            <PageLoader variant="skeleton" rows={6} />
          ) : rows.length === 0 ? (
            <EmptyState icon={Clock} accent="gray" title={rtl ? 'لا موظفين نشطين' : 'No active staff'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الموظف' : 'Staff'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحضور' : 'In'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الانصراف' : 'Out'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'التأخير' : 'Late'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'ملاحظات' : 'Notes'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const cur = statusOf(r);
                    return (
                      <tr key={r.staff_id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <StaffAvatar name={r.full_name} size="w-9 h-9 text-sm" />
                            <div>
                              <p className="font-medium whitespace-nowrap">{r.full_name}</p>
                              <p className="text-xs text-gray-400">{r.job_title || ''}{r.shift_start ? ` · ${String(r.shift_start).slice(0, 5)}` : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 tabular-nums whitespace-nowrap" dir="ltr">
                          {r.clock_in ? new Date(r.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 tabular-nums whitespace-nowrap" dir="ltr">
                          {r.clock_out ? new Date(r.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {cur === 'late' ? <span className="font-bold text-amber-600">{rtl ? 'متأخر' : 'Late'}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {STATUS.map((s) => (
                              <button
                                key={s.key}
                                type="button"
                                onClick={() => setMarks((p) => ({ ...p, [r.staff_id]: s.key }))}
                                className={`min-h-[36px] px-2.5 rounded-lg text-[11px] font-bold border transition-all ${
                                  cur === s.key ? s.cls + ' border-transparent' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-700'
                                }`}
                              >
                                {s.ar}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {r.saved_status ? (rtl ? 'محفوظ' : 'saved') : (r.suggested ? (rtl ? 'مقترح تلقائي' : 'auto') : '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
