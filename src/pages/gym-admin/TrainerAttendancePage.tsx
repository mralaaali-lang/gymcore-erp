import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserCheck, Clock, UserMinus as UserX, Pencil, Plus, ChartBar as BarChart3 } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatDateTime, fmtNum } from '../../utils/date';
import {
  listCoachAttendance, bulkClockInCoaches, updateShift,
  listCoachesSummary,
  type CoachAttendanceRow,
} from '../../services/api';
import { DashboardPage, StatCard, Panel, EmptyState } from '../../components/dashboard';
import DataTable, { type TableColumn } from '../../components/ui/DataTable';
import { SkeletonStats, SkeletonTable } from '../../components/shared/Skeleton';
import Modal from '../../components/shared/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import { sportName, useSportsCatalog } from './subscriptions/shared';

// ====================================================================
// حضور المدربين (/admin/trainer-attendance) — نسخة مصغرة بهوية مستقلة:
// تسجيل يدوي فقط (بلا كاميرا/باركود — 20 مدربًا لا 200 عضو)، عمود تخصص،
// وزرار تقرير منفصل بتقرير شهري قابل للطباعة. «متواجد الآن» = شيفت مفتوح
// فقط. التسجيل الجماعي (تسجيل الكل) حدث واحد بطابع زمني واحد — موثّق
// كذلك في سجل الأنشطة بدل N حدثًا متطابقًا.
// ====================================================================

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDur(min: number | null): string {
  if (min == null) return '—';
  if (min < 60) return `${fmtNum(min)} دقيقة`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${fmtNum(h)} ساعة` : `${fmtNum(h)} ساعة ${fmtNum(m)} د`;
}

const inputCls =
  'h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none';

export default function TrainerAttendancePage() {
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';

  // الفلاتر بزرار بحث صريح (مسودة/مطبّق)
  const [draftDate, setDraftDate] = useState(localDateStr(new Date()));
  const [draftCoach, setDraftCoach] = useState('');
  const [applied, setApplied] = useState({ date: localDateStr(new Date()), coach: '' });

  const [editing, setEditing] = useState<CoachAttendanceRow | null>(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');

  const { data, isLoading, isError } = useApiQuery(
    ['coaches', 'attendance', applied.date, applied.coach],
    () => listCoachAttendance({ date: applied.date, coach_id: applied.coach || undefined }),
    { staleTime: 30_000 },
  );
  const rows = data?.data ?? [];
  const stats = data?.stats;

  const { data: coachesRes } = useApiQuery(['coaches', 'summary'], listCoachesSummary, { staleTime: 60_000 });
  const coaches = (coachesRes?.data ?? []).filter((c) => c.is_active);
  const { sports: catalogSports } = useSportsCatalog();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['coaches', 'attendance'] });
  };

  const bulkMut = useMutation({
    mutationFn: () => bulkClockInCoaches(),
    onSuccess: (r) => {
      invalidate();
      showToast(rtl ? `تم تسجيل حضور ${fmtNum(r.data.count)} مدرب (حدث جماعي واحد)` : `Checked in ${r.data.count} coaches`, 'success');
    },
    onError: (e) => showToast(
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'لا مدربين متاحين' : 'Nobody eligible'),
      'error',
    ),
  });

  const editMut = useMutation({
    mutationFn: () => updateShift(editing!.shift_id, {
      clock_in: editIn ? new Date(editIn).toISOString() : null,
      clock_out: editOut ? new Date(editOut).toISOString() : null,
    }),
    onSuccess: () => {
      invalidate(); setEditing(null);
      showToast(rtl ? 'تم حفظ التعديل' : 'Saved', 'success');
    },
    onError: (e) => showToast(
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'فشل الحفظ' : 'Save failed'),
      'error',
    ),
  });

  const openEdit = (r: CoachAttendanceRow) => {
    setEditing(r);
    const toLocal = (iso: string | null) => {
      if (!iso) return '';
      const d = new Date(iso);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    setEditIn(toLocal(r.clock_in));
    setEditOut(toLocal(r.clock_out));
  };

  // موجة 4 / دفعة ج — لا رؤوس متفرزات: `listCoachAttendance` (`staff.ts:375`)
  // بيرتّب ثابت ORDER BY ss.clock_in ASC وقايمة السيرفر بلا whitelist ترتيب،
  // فعدد الرؤوس المتفرزات على الشاشة = 0 حرفيًا.
  const columns: TableColumn<CoachAttendanceRow>[] = [
    {
      id: 'coach',
      label: rtl ? 'المدرب' : 'Coach',
      value: (r) => r.full_name,
      cell: (r) => (
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center font-bold shrink-0">
            {r.full_name.charAt(0)}
          </span>
          <div>
            <p className="font-medium whitespace-nowrap">{r.full_name}</p>
            {r.phone && <p className="text-xs text-gray-500" dir="ltr">{r.phone}</p>}
          </div>
        </div>
      ),
    },
    { id: 'sport_mode', label: rtl ? 'التخصص' : 'Specialty', value: (r) => (r.sport_mode ? sportName(r.sport_mode, catalogSports, rtl) : rtl ? 'عام' : 'General') },
    { id: 'clock_in', label: rtl ? 'وقت الحضور' : 'In', value: (r) => formatDateTime(r.clock_in) },
    { id: 'clock_out', label: rtl ? 'وقت الانصراف' : 'Out', value: (r) => (r.clock_out ? formatDateTime(r.clock_out) : '—') },
    { id: 'duration_min', label: rtl ? 'المدة' : 'Duration', value: (r) => fmtDur(r.duration_min) },
    {
      id: 'status',
      label: rtl ? 'الحالة' : 'Status',
      value: (r) => (r.clock_out ? (rtl ? 'انصرف' : 'Left') : (rtl ? 'متواجد' : 'Present')),
      cell: (r) => <StatusBadge status={r.clock_out ? (rtl ? 'انصرف' : 'Left') : (rtl ? 'متواجد' : 'Present')} variant={r.clock_out ? 'neutral' : 'success'} />,
    },
    {
      id: 'edit',
      label: rtl ? 'تعديل' : 'Edit',
      cell: (r) => (
        <button
          type="button"
          onClick={() => openEdit(r)}
          title={rtl ? 'تعديل الأوقات' : 'Edit times'}
          className="w-10 min-h-[40px] inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 touch-auto"
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ];

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate('/admin/trainer-attendance/add')}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl px-4 py-2.5 shadow-sm transition min-h-[44px]"
            >
              <Plus size={16} />
              {rtl ? 'تسجيل حضور' : 'Clock in'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/trainer-attendance/report')}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-700 bg-sky-100 hover:bg-sky-200 rounded-2xl px-4 py-2.5 transition min-h-[44px]"
            >
              <BarChart3 size={16} />
              {rtl ? 'تقرير' : 'Report'}
            </button>
          </>
        }
      >
        {/* ── الكروت الأربعة ── */}
        {isLoading ? (
          /* موجة 4 / دفعة ج — الفانطازة بنفس هندسة الشاشة النهائية: 4 كروت ← جدول.
             `rowHeight={64}` قياس حي على 1440 و390 (الصف سطران: أفاتار 36px فوقه
             الاسم/التليفون، وزرار تعديل 40px): الاسم عنده nowrap فالرقم ثابت على
             العرضين — نفس الرقم طلع في القياسين. */
          <>
            <SkeletonStats columns={4} gridClassName="grid-cols-2 lg:grid-cols-4 gap-5" />
            <SkeletonTable rows={5} cols={columns.length} rowHeight={64} />
          </>
        ) : (
          <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={Users} label={rtl ? 'إجمالي المدربين' : 'Total coaches'} value={fmtNum(stats?.total ?? 0)} accent="violet" onClick={() => navigate('/admin/trainers')} />
          <StatCard icon={UserCheck} label={rtl ? 'حضروا اليوم' : 'Present today'} value={fmtNum(stats?.present ?? 0)} accent="emerald" />
          <StatCard icon={Clock} label={rtl ? 'متواجدون الآن' : 'Present now'} value={fmtNum(stats?.now_present ?? 0)} accent="sky" />
          <StatCard icon={UserX} label={rtl ? 'لم يحضروا' : 'Absent'} value={fmtNum(stats?.absent ?? 0)} accent="rose" />
        </div>

        {/* ── الفلتر ── */}
        <Panel icon={Clock} accent="cyan" title={rtl ? 'الفلاتر' : 'Filters'}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">{rtl ? 'التاريخ' : 'Date'}</label>
              <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">{rtl ? 'المدرب' : 'Coach'}</label>
              <select value={draftCoach} onChange={(e) => setDraftCoach(e.target.value)} className={`${inputCls} min-w-[200px]`}>
                <option value="">{rtl ? 'الكل' : 'All'}</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setApplied({ date: draftDate, coach: draftCoach })}
              className="h-11 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition min-h-[44px]"
            >
              {rtl ? 'بحث' : 'Search'}
            </button>
          </div>
        </Panel>

        {/* ── جدول السجل ── */}
        <Panel
          icon={Clock}
          accent="emerald"
          title={`${rtl ? 'سجل الحضور' : 'Attendance log'} - ${applied.date} (${fmtNum(rows.length)})`}
          actions={
            <button
              type="button"
              onClick={() => bulkMut.mutate()}
              disabled={bulkMut.isPending}
              title={rtl ? 'تسجيل حضور كل المدربين الغائبين دفعة واحدة (حدث جماعي واحد)' : 'Clock in all absent coaches at once'}
              className="text-sm font-bold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
            >
              {rtl ? 'تسجيل الكل' : 'Clock in all'}
            </button>
          }
        >
          {isError ? (
            <p className="text-sm text-red-500 text-center py-8">{rtl ? 'فشل التحميل' : 'Failed to load'}</p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Clock}
              accent="gray"
              title={rtl ? 'لا حضور مسجل في هذا اليوم' : 'No attendance this day'}
              description={rtl ? 'سجّل حضور مدرب أو استخدم «تسجيل الكل».' : 'Clock in a coach or use bulk check-in.'}
            />
          ) : (
            /* الجدول على صدفة `ui/DataTable` — جوّه Panel بقشرة كاملة فالـ`bare` لازم. */
            <DataTable bare columns={columns} data={rows} rowKey={(r) => r.shift_id} caption={rtl ? 'سجل حضور المدربين' : 'Coach attendance log'} />
          )}
        </Panel>
          </>
        )}
      </DashboardPage>

      {/* تعديل صف */}
      {editing && (
        <Modal
          open
          title={editing.full_name}
          onClose={() => setEditing(null)}
          size="md"
          dir={rtl ? 'rtl' : 'ltr'}
          disableDismiss={editMut.isPending}
          footer={
            <>
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={editMut.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition disabled:opacity-50"
              >
                {rtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => editMut.mutate()}
                disabled={editMut.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition disabled:opacity-50"
              >
                {editMut.isPending ? (rtl ? 'جارٍ الحفظ…' : 'Saving…') : (rtl ? 'حفظ التعديل' : 'Save')}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'وقت الحضور' : 'Clock in'}</label>
              <input type="datetime-local" value={editIn} onChange={(e) => setEditIn(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'وقت الانصراف (فارغ = متواجد)' : 'Clock out (empty = present)'}</label>
              <input type="datetime-local" value={editOut} onChange={(e) => setEditOut(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm outline-none" />
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
