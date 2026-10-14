import { useState, useMemo } from 'react';
import { formatDate } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  listGymClasses, createGymClass, updateGymClass, deleteGymClass,
  listStaff, listPayroll, getStaffAttendanceSummary,
  type GymClassData, type StaffData,
} from '../../services/api';
import { formatMoney } from '../../utils/currency';
import StatsGrid from '../../components/shared/StatsGrid';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';

// §37ب — الجدول الحقيقي: كل حصة هي occurrence بتاريخ ووقت فعليين
// (fitness_classes.start_time/end_time). شبكة الأسبوع تجلب النطاق الظاهر
// من الخادم (?from&to) — تنقّل الأسبوع يعيد القراءة فعليًا، والتواريخ في
// رؤوس الأعمدة هي تواريخ الأعمدة نفسها (لا إعادة تسمية جانب العميل).
// الأخطاء تُعرض ولا تُبتلع (كانت الصفحة تصمت أمام 403 ثم 500 من السيرفر).
// FALLBACK_PROGRAMS المحذوف: قائمة الفلاتر تُشتق من عناوين الحصص الحقيقية.

const GYM_TABS = ['Schedule', 'Staff', 'Payroll', 'Programs'] as const;
type GymTab = typeof GYM_TABS[number];

const TAB_LABELS: Record<GymTab, { en: string; ar: string }> = {
  Schedule: { en: 'Schedule', ar: 'الجدول' },
  Staff: { en: 'Managers & Staff', ar: 'المديرين والموظفين' },
  Payroll: { en: 'Payroll', ar: 'الرواتب' },
  Programs: { en: 'Programs', ar: 'البرامج' },
};

const TAB_ICONS: Record<GymTab, string> = {
  Schedule: 'calendar_month',
  Staff: 'group',
  Payroll: 'payments',
  Programs: 'fitness_center',
};

// أسبوع يبدأ السبت (المتعارف عليه محليًا) — فهرسة getDay(): س=6، ح=0، …، خ=5
const DAYS_EN = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAYS_AR = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const HOURS = Array.from({ length: 13 }, (_, i) => `${(i + 6).toString().padStart(2, '0')}`);

const VIEWS = ['List', 'Grid'] as const;

const CLASS_COLORS = [
  'bg-purple-100 text-purple-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-blue-100 text-blue-700',
  'bg-red-100 text-red-700',
  'bg-teal-100 text-teal-700',
  'bg-emerald-100 text-emerald-700',
];

const ROLE_LABELS: Record<string, { ar: string; en: string }> = {
  manager: { ar: 'مدير', en: 'Manager' },
  receptionist: { ar: 'استقبال', en: 'Reception' },
  coach: { ar: 'مدرب', en: 'Coach' },
  trainer: { ar: 'مدرب', en: 'Trainer' },
  member: { ar: 'عضو', en: 'Member' },
};

function roleLabel(role?: string, rtl = true): string {
  const key = (role || '').toLowerCase();
  const found = ROLE_LABELS[key];
  if (found) return rtl ? found.ar : found.en;
  return role || '-';
}

function toTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/** المفتاح المحلي YYYY-MM-DD لتاريخ ISO (توحيد §34هـ: لا أرقام شرقية). */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function getWeekDates(base: Date): Date[] {
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const diffToSaturday = (start.getDay() + 1) % 7; // سبت → 0، أحد → 1، …، جمعة → 6
  start.setDate(start.getDate() - diffToSaturday);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** رسالة عربية صادقة لأكواد أخطاء endpoint الحصص (§37ب). */
function classErrorMessage(err: unknown, rtl: boolean): string {
  const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  const map: Record<string, { ar: string; en: string }> = {
    COACH_BUSY: { ar: 'المدرب لديه حصة أخرى في نفس التوقيت', en: 'The coach already has another class at this time' },
    COACH_NOT_IN_GYM: { ar: 'المدرب المحدد غير موجود أو موقوف في هذه الصالة', en: 'Coach not found or inactive in this gym' },
    INVALID_TIME_RANGE: { ar: 'وقت النهاية يجب أن يكون بعد وقت البداية', en: 'End time must be after start time' },
    HAS_BOOKINGS: { ar: 'لا يمكن حذف حصة عليها حجوزات — ألغها بدل الحذف', en: 'Class has bookings — cancel it instead of deleting' },
  };
  if (code && map[code]) return rtl ? map[code].ar : map[code].en;
  return rtl ? 'فشل الحفظ — حاول مرة أخرى' : 'Save failed — please try again';
}

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-base text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

interface ClassModalProps {
  open: boolean;
  editing: GymClassData | null;
  defaultDateKey: string;
  coaches: StaffData[];
  rtl: boolean;
  onClose: () => void;
}

/** مودال وسطي (§feedback-centered-modals) لإنشاء/تعديل حصة — وكل إجراء
 *  الحذف/الإلغاء يمرر عبره أيضًا حتى تبقى الرسالة الصادقة قريبة من الفعل. */
function ClassModal({ open, editing, defaultDateKey, coaches, rtl, onClose }: ClassModalProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [coachId, setCoachId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [capacity, setCapacity] = useState('10');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // نعيد ضبط الحقول عند كل فتح بمطابقة مفتاح الغرض:
  const [seedKey, setSeedKey] = useState('');

  const key = `${open ? 'o' : 'c'}|${editing?.id ?? ''}|${defaultDateKey}`;
  if (open && key !== seedKey) {
    setSeedKey(key);
    setTitle(editing?.title ?? '');
    setCoachId(editing?.coach_id ?? '');
    const base = editing ? new Date(editing.start_time) : new Date(`${defaultDateKey}T18:00:00`);
    setDate(localDateKey(base));
    setStartTime(editing ? toTimeLabel(editing.start_time) : '18:00');
    setEndTime(editing ? toTimeLabel(editing.end_time) : '19:00');
    setCapacity(String(editing?.capacity ?? 10));
    setConfirmDelete(false);
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['gym-classes'] });

  const saveMutation = useMutation({
    mutationFn: (payload: { title: string; coach_id: string; capacity: number; start_time: string; end_time: string }) =>
      editing ? updateGymClass(editing.id, payload) : createGymClass(payload),
    onSuccess: () => {
      showToast(editing ? (rtl ? 'تم تعديل الحصة' : 'Class updated') : (rtl ? 'تمت إضافة الحصة' : 'Class added'), 'success');
      invalidate();
      onClose();
    },
    onError: (err) => showToast(classErrorMessage(err, rtl), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (nextCancelled: boolean) => updateGymClass(editing!.id, { is_cancelled: nextCancelled }),
    onSuccess: () => {
      showToast(rtl ? 'تم تحديث حالة الحصة' : 'Class status updated', 'success');
      invalidate();
      onClose();
    },
    onError: () => showToast(rtl ? 'فشل تحديث الحالة' : 'Could not update status', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteGymClass(editing!.id),
    onSuccess: () => {
      showToast(rtl ? 'تم حذف الحصة' : 'Class deleted', 'success');
      invalidate();
      onClose();
    },
    onError: (err) => showToast(classErrorMessage(err, rtl), 'error'),
  });

  if (!open) return null;

  const handleSave = () => {
    const cap = parseInt(capacity, 10);
    if (title.trim().length < 2) { showToast(rtl ? 'أدخل اسم الحصة' : 'Class title is required', 'warning'); return; }
    if (!coachId) { showToast(rtl ? 'اختر المدرب' : 'Select a coach', 'warning'); return; }
    if (!date || !startTime || !endTime) { showToast(rtl ? 'التاريخ والوقت مطلوبان' : 'Date and times are required', 'warning'); return; }
    if (endTime <= startTime) { showToast(rtl ? 'وقت النهاية يجب أن يكون بعد البداية' : 'End time must be after start', 'warning'); return; }
    if (!cap || cap < 1) { showToast(rtl ? 'السعة غير صحيحة' : 'Invalid capacity', 'warning'); return; }
    // توقيت محلي → ISO UTC يرسل للخادم كما هو (السيرفر يخزن timestamptz).
    saveMutation.mutate({
      title: title.trim(),
      coach_id: coachId,
      capacity: cap,
      start_time: new Date(`${date}T${startTime}:00`).toISOString(),
      end_time: new Date(`${date}T${endTime}:00`).toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
        dir={rtl ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">
            {editing ? (rtl ? 'تعديل الحصة' : 'Edit Class') : (rtl ? 'إضافة حصة' : 'Add Class')}
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-50" aria-label="close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>{rtl ? 'اسم الحصة' : 'Title'}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass}
              placeholder={rtl ? 'مثال: كروس فت' : 'e.g. CrossFit'} />
          </div>
          <div>
            <label className={labelClass}>{rtl ? 'المدرب' : 'Coach'}</label>
            {coaches.length === 0 ? (
              <p className="text-sm text-amber-600">{rtl ? 'لا يوجد مدربون نشطون — أضف مدربًا من صفحة الفريق أولًا' : 'No active coaches — add one in the Team page first'}</p>
            ) : (
              <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={inputClass}>
                <option value="">{rtl ? '— اختر المدرب —' : '— Select coach —'}</option>
                {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className={labelClass}>{rtl ? 'التاريخ' : 'Date'}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{rtl ? 'من' : 'From'}</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{rtl ? 'إلى' : 'To'}</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>{rtl ? 'السعة' : 'Capacity'}</label>
            <input type="number" min={1} max={1000} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputClass} />
          </div>

          {editing && (
            <p className="text-xs text-gray-500">
              {rtl
                ? `الحجوزات المؤكدة: ${editing.booked} — ${editing.is_cancelled ? 'الحصة ملغاة' : 'الحصة نشطة'}`
                : `Confirmed bookings: ${editing.booked} — ${editing.is_cancelled ? 'cancelled' : 'active'}`}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? (rtl ? 'جارٍ الحفظ...' : 'Saving...')
                : (rtl ? 'حفظ' : 'Save')}
            </Button>
            {editing && (
              <>
                <Button variant="outline" onClick={() => cancelMutation.mutate(!editing.is_cancelled)} disabled={cancelMutation.isPending}>
                  {editing.is_cancelled ? (rtl ? 'إرجاع نشطة' : 'Reactivate') : (rtl ? 'إلغاء الحصة' : 'Cancel class')}
                </Button>
                {editing.booked === 0 ? (
                  confirmDelete ? (
                    <Button variant="ghost" className="text-red-600" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                      {rtl ? 'تأكيد الحذف' : 'Confirm delete'}
                    </Button>
                  ) : (
                    <Button variant="ghost" className="text-red-600" onClick={() => setConfirmDelete(true)}>
                      {rtl ? 'حذف' : 'Delete'}
                    </Button>
                  )
                ) : (
                  <span className="text-xs text-gray-400">
                    {rtl ? 'لا يُحذف — عليه حجوزات (استخدم الإلغاء)' : 'Has bookings — use cancel'}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GymCalendar() {
  const { language, gymProfile } = useApp();
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const rtl = language === 'ar';
  const [activeTab, setActiveTab] = useState<GymTab>('Schedule');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<typeof VIEWS[number]>('Grid');
  const [programFilter, setProgramFilter] = useState('All');
  const [modal, setModal] = useState<{ open: boolean; editing: GymClassData | null; dateKey: string }>(
    { open: false, editing: null, dateKey: localDateKey(new Date()) }
  );

  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  // النطاق الظاهر يُرسل للخادم فعلًا: from = أول الأسبوع 00:00، to = بعد آخر يوم.
  const fromISO = weekDates[0].toISOString();
  const toISO = new Date(weekDates[6].getTime() + 24 * 3600 * 1000).toISOString();

  const {
    data: classesRes, isLoading: classesLoading, error: classesError, refetch: refetchClasses,
  } = useApiQuery<{ data: GymClassData[] }>(
    ['gym-classes', fromISO, toISO],
    () => listGymClasses(fromISO, toISO),
    { staleTime: 30_000 },
  );

  // الموظفون يُجلبون دائمًا: تبويب الجدول يحتاجهم لقائمة المدربين في المودال.
  const { data: staffRes, isLoading: staffLoading } = useApiQuery<{ data: StaffData[] }>(
    ['calendar-staff'],
    () => listStaff(),
  );
  const { data: payrollRes, isLoading: payrollLoading } = useApiQuery<{ data: any[] }>(
    ['calendar-payroll'],
    () => listPayroll(),
    { enabled: activeTab === 'Payroll' },
  );
  const { data: attendanceRes, isLoading: attendanceLoading } = useApiQuery<{ data: any[] }>(
    ['calendar-attendance'],
    () => getStaffAttendanceSummary(),
    { enabled: activeTab === 'Staff' },
  );

  const staff = staffRes?.data || [];
  const payroll = payrollRes?.data || [];
  const attendance = attendanceRes?.data || [];
  const classes = useMemo(() => classesRes?.data || [], [classesRes]);

  const coaches = useMemo(
    () => staff.filter((s) => ['coach', 'trainer'].includes((s.role || '').toLowerCase()) && s.is_active),
    [staff]
  );

  const attendanceMap = useMemo(() => {
    const map: Record<string, { monthly_shifts: number; today_clocked: number }> = {};
    attendance.forEach((a: any) => {
      map[a.id] = { monthly_shifts: Number(a.monthly_shifts || 0), today_clocked: Number(a.today_clocked || 0) };
    });
    return map;
  }, [attendance]);

  const payrollTotal = payroll.reduce(
    (sum: number, p: any) => sum + Number(p.base_salary_paid || 0) + Number(p.commissions_paid || 0),
    0,
  );

  // توزيع الحصص تحت تاريخها الفعلي (YYYY-MM-DD محلي من start_time).
  const byDate = useMemo(() => {
    const map: Record<string, GymClassData[]> = {};
    classes.forEach((c) => {
      const key = localDateKey(new Date(c.start_time));
      if (!map[key]) map[key] = [];
      map[key].push(c);
    });
    return map;
  }, [classes]);

  const programOptions = useMemo(() => {
    const names = [...new Set(classes.map((c) => c.title).filter(Boolean))];
    return ['All', ...names.sort()];
  }, [classes]);

  const visibleClasses = (dateKey: string) =>
    (byDate[dateKey] || []).filter((c) => programFilter === 'All' || c.title === programFilter);

  const dayLabels = rtl ? DAYS_AR : DAYS_EN;

  const navWeek = (dir: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  };

  const openCreate = (dateKey: string) => setModal({ open: true, editing: null, dateKey });
  const openEdit = (c: GymClassData) =>
    setModal({ open: true, editing: c, dateKey: localDateKey(new Date(c.start_time)) });

  const colorFor = (c: GymClassData) => {
    const idx = classes.findIndex((x) => x.id === c.id);
    return CLASS_COLORS[(idx < 0 ? 0 : idx) % CLASS_COLORS.length];
  };

  const renderSchedule = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navWeek(-1)} className="min-w-12 min-h-12 p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition" aria-label="previous week">
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[180px] text-center">
            {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
          </span>
          <button onClick={() => navWeek(1)} className="min-w-12 min-h-12 p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition" aria-label="next week">
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {rtl ? 'اليوم' : 'Today'}
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition ${
                  view === v ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {rtl ? (v === 'List' ? 'قائمة' : 'شبكة') : v}
              </button>
            ))}
          </div>
          <select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {programOptions.map((p) => (
              <option key={p} value={p}>{p === 'All' ? (rtl ? 'الكل' : 'All') : p}</option>
            ))}
          </select>
          <Button onClick={() => openCreate(localDateKey(new Date()))}>
            <span className="material-symbols-outlined text-lg">add</span>
            {rtl ? 'إضافة حصة' : 'Add Class'}
          </Button>
        </div>
      </div>

      {classesError ? (
        <Card className="text-center py-10">
          <span className="material-symbols-outlined text-4xl text-red-400 block mb-2">cloud_off</span>
          <p className="text-sm text-gray-600 mb-3">
            {rtl ? 'تعذر تحميل الجدول من الخادم' : 'Could not load the schedule from the server'}
          </p>
          <Button variant="outline" onClick={() => refetchClasses()}>
            {rtl ? 'إعادة المحاولة' : 'Retry'}
          </Button>
        </Card>
      ) : classesLoading ? (
        <PageLoader />
      ) : view === 'Grid' ? (
        <div className="grid grid-cols-7 gap-2">
          {weekDates.map((date, i) => {
            const dateKey = localDateKey(date);
            const dayClasses = visibleClasses(dateKey);
            const isToday = dateKey === localDateKey(new Date());
            return (
              <div
                key={dateKey}
                className={`bg-white border rounded-3xl p-2 min-h-[140px] shadow-sm ${
                  isToday ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-gray-100'
                }`}
              >
                <div className={`text-center mb-2 ${isToday ? 'text-emerald-600 font-bold' : 'text-gray-500'}`}>
                  <p className="text-[10px]">{dayLabels[i]}</p>
                  <p className="text-lg font-bold">{date.getDate()}</p>
                </div>
                <div className="space-y-1">
                  {dayClasses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openEdit(c)}
                      title={`${c.coach_name ?? ''} · ${rtl ? 'الحجوزات' : 'Booked'} ${c.booked}/${c.capacity}`}
                      className={`w-full text-start rounded-xl px-2 py-1.5 text-[10px] leading-tight ${colorFor(c)} ${c.is_cancelled ? 'opacity-50' : ''}`}
                    >
                      <p className={`font-semibold ${c.is_cancelled ? 'line-through' : ''}`}>{c.title}</p>
                      <p className="opacity-70">{toTimeLabel(c.start_time)} · {c.coach_name || '—'}</p>
                    </button>
                  ))}
                  {dayClasses.length === 0 && (
                    <button
                      type="button"
                      onClick={() => openCreate(dateKey)}
                      className="w-full text-center rounded-xl border border-dashed border-gray-200 py-1.5 text-[10px] text-gray-300 hover:text-emerald-500 hover:border-emerald-200"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="p-3 text-center text-gray-500 font-medium w-20">{rtl ? 'الوقت' : 'Time'}</th>
                  {weekDates.map((date, i) => (
                    <th key={localDateKey(date)} className="p-3 text-center text-gray-500 font-medium">
                      {dayLabels[i]}<br /><span className="text-xs">{date.getDate()}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map((hour) => (
                  <tr key={hour} className="border-b border-gray-100 last:border-0">
                    <td className="p-2 text-xs text-gray-500 text-center" dir="ltr">{hour}:00</td>
                    {weekDates.map((date, dayIdx) => {
                      const dateKey = localDateKey(date);
                      const cellClasses = visibleClasses(dateKey).filter((c) => toTimeLabel(c.start_time).startsWith(hour));
                      return (
                        <td key={dayIdx} className="p-1 border-r border-gray-100 last:border-r-0">
                          {cellClasses.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => openEdit(c)}
                              className={`w-full text-start rounded-xl px-2 py-1 text-[10px] mb-0.5 ${colorFor(c)} ${c.is_cancelled ? 'opacity-50 line-through' : ''}`}
                            >
                              <p className="font-semibold">{c.title}</p>
                              <p className="opacity-70">{c.coach_name || '—'}</p>
                            </button>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );

  const renderStaff = () => (
    <div className="space-y-4">
      <StatsGrid
        columns={3}
        stats={[
          { key: 'total', label: rtl ? 'إجمالي الموظفين' : 'Total Staff', value: staff.length, icon: 'group', color: 'primary' },
          { key: 'active', label: rtl ? 'على رأس العمل' : 'Active', value: staff.filter((s: StaffData) => s.is_active).length, icon: 'check_circle', color: 'secondary' },
          { key: 'today', label: rtl ? 'سجّلوا حضور اليوم' : 'Clocked In Today', value: attendance.filter((a: any) => Number(a.today_clocked) > 0).length, icon: 'schedule', color: 'info' },
        ]}
      />

      <Card>
        <h3 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'المديرين والموظفين' : 'Managers & Staff'}</h3>
        {staffLoading || attendanceLoading ? (
          <PageLoader />
        ) : staff.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <span className="material-symbols-outlined text-4xl block mb-2">group</span>
            <p className="text-sm">{rtl ? 'لا يوجد موظفون' : 'No staff yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 px-3 text-start font-medium">{rtl ? 'الاسم' : 'Name'}</th>
                  <th className="py-2 px-3 text-start font-medium">{rtl ? 'الدور' : 'Role'}</th>
                  <th className="py-2 px-3 text-start font-medium">{rtl ? 'الهاتف' : 'Phone'}</th>
                  <th className="py-2 px-3 text-center font-medium">{rtl ? 'ورديات الشهر' : 'Shifts (Month)'}</th>
                  <th className="py-2 px-3 text-end font-medium">{rtl ? 'الراتب' : 'Salary'}</th>
                  <th className="py-2 px-3 text-center font-medium">{rtl ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s: StaffData) => {
                  const att = attendanceMap[s.id];
                  return (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="py-2.5 px-3 font-medium text-gray-900">{s.full_name}</td>
                      <td className="py-2.5 px-3 text-gray-500">{roleLabel(s.role, rtl)}</td>
                      <td className="py-2.5 px-3 text-gray-500" dir="ltr">{s.phone || '—'}</td>
                      <td className="py-2.5 px-3 text-center text-gray-700">{att ? att.monthly_shifts : '—'}</td>
                      <td className="py-2.5 px-3 text-end font-bold text-gray-900">
                        {s.salary != null ? money(s.salary) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <StatusBadge
                          status={s.is_active ? (rtl ? 'نشط' : 'Active') : (rtl ? 'موقوف' : 'Inactive')}
                          variant={s.is_active ? 'success' : 'neutral'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );

  const renderPayroll = () => (
    <div className="space-y-4">
      <StatsGrid
        columns={2}
        stats={[
          { key: 'records', label: rtl ? 'عدد العمليات' : 'Payroll Records', value: payroll.length, icon: 'receipt_long', color: 'info' },
          { key: 'total', label: rtl ? 'إجمالي المدفوع' : 'Total Paid', value: money(payrollTotal), icon: 'payments', color: 'primary' },
        ]}
      />

      <Card>
        <h3 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'سجل الرواتب' : 'Payroll Ledger'}</h3>
        {payrollLoading ? (
          <PageLoader />
        ) : payroll.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <span className="material-symbols-outlined text-4xl block mb-2">payments</span>
            <p className="text-sm">{rtl ? 'لا توجد عمليات رواتب مسجلة' : 'No payroll records yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 px-3 text-start font-medium">{rtl ? 'الموظف' : 'Staff'}</th>
                  <th className="py-2 px-3 text-start font-medium">{rtl ? 'الدور' : 'Role'}</th>
                  <th className="py-2 px-3 text-start font-medium">{rtl ? 'التاريخ' : 'Date'}</th>
                  <th className="py-2 px-3 text-end font-medium">{rtl ? 'الراتب الأساسي' : 'Base'}</th>
                  <th className="py-2 px-3 text-end font-medium">{rtl ? 'عمولات' : 'Commissions'}</th>
                  <th className="py-2 px-3 text-end font-medium">{rtl ? 'الإجمالي' : 'Total'}</th>
                </tr>
              </thead>
              <tbody>
                {payroll.map((p: any, i: number) => {
                  const total = Number(p.base_salary_paid || 0) + Number(p.commissions_paid || 0);
                  return (
                    <tr key={p.id || i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="py-2.5 px-3 font-medium text-gray-900">{p.staff_name || '—'}</td>
                      <td className="py-2.5 px-3 text-gray-500">{roleLabel(p.role, rtl)}</td>
                      <td className="py-2.5 px-3 text-gray-500">{p.payment_date ? formatDate(p.payment_date) : '—'}</td>
                      <td className="py-2.5 px-3 text-end text-gray-700">{money(p.base_salary_paid)}</td>
                      <td className="py-2.5 px-3 text-end text-gray-700">{money(p.commissions_paid)}</td>
                      <td className="py-2.5 px-3 text-end font-bold text-gray-900">{money(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );

  // البرامج تُشتق من حصص الأسبوع الظاهر نفسها (عناوين متطابقة) — لا بيانات وهمية.
  const programs = useMemo(() => {
    const map: Record<string, { name: string; sessions: number; trainers: Set<string>; times: string[] }> = {};
    classes.forEach((c) => {
      if (!c.title) return;
      if (!map[c.title]) map[c.title] = { name: c.title, sessions: 0, trainers: new Set(), times: [] };
      if (!c.is_cancelled) map[c.title].sessions += 1;
      if (c.coach_name) map[c.title].trainers.add(c.coach_name);
      const t = toTimeLabel(c.start_time);
      if (t) map[c.title].times.push(`${localDateKey(new Date(c.start_time))} ${t}`);
    });
    return Object.values(map).sort((a, b) => b.sessions - a.sessions);
  }, [classes]);

  const renderPrograms = () => (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-gray-900">
        {rtl ? 'البرامج التدريبية (من حصص هذا الأسبوع)' : 'Training Programs (from this week’s classes)'}
      </h3>
      {programs.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">
          <span className="material-symbols-outlined text-4xl block mb-2">fitness_center</span>
          <p className="text-sm">{rtl ? 'لا توجد حصص هذا الأسبوع — أضف حصة من تبويب الجدول' : 'No classes this week — add one from the Schedule tab'}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((p) => (
            <Card key={p.name}>
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-base font-bold text-gray-900">{p.name}</h4>
                <StatusBadge
                  status={rtl ? `${p.sessions} حصة` : `${p.sessions} session${p.sessions > 1 ? 's' : ''}`}
                  variant="neutral"
                />
              </div>
              <p className="text-xs text-gray-400 mb-2">
                {rtl ? 'المدربون: ' : 'Trainers: '}
                <span className="text-gray-600">{[...p.trainers].join('، ') || '—'}</span>
              </p>
              {p.times.length > 0 && (
                <p className="text-xs text-gray-500 line-clamp-2" dir="ltr">{p.times.slice(0, 4).join(' · ')}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
      {/* §35ث — heading moved to the top bar */}

      <UnifiedTabs
        tabs={GYM_TABS.map((tab) => ({
          key: tab,
          labelAr: TAB_LABELS[tab].ar,
          labelEn: TAB_LABELS[tab].en,
          icon: TAB_ICONS[tab],
        }))}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as GymTab)}
      />

      {activeTab === 'Schedule' && renderSchedule()}
      {activeTab === 'Staff' && renderStaff()}
      {activeTab === 'Payroll' && renderPayroll()}
      {activeTab === 'Programs' && renderPrograms()}

      <ClassModal
        open={modal.open}
        editing={modal.editing}
        defaultDateKey={modal.dateKey}
        coaches={coaches}
        rtl={rtl}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
    </div>
  );
}
