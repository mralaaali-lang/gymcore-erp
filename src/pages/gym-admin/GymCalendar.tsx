import { useState, useMemo } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getUpcomingClasses, listStaff, listPayroll, getStaffAttendanceSummary, type UpcomingClassData, type StaffData } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';

const GYM_TABS = ['Schedule', 'Bookings', 'Staff', 'Payroll', 'Programs'] as const;
type GymTab = typeof GYM_TABS[number];

const TAB_LABELS: Record<GymTab, { en: string; ar: string }> = {
  Schedule: { en: 'Schedule', ar: 'الجدول' },
  Bookings: { en: 'Bookings', ar: 'الحجوزات' },
  Staff: { en: 'Managers & Staff', ar: 'المديرين والموظفين' },
  Payroll: { en: 'Payroll', ar: 'الرواتب' },
  Programs: { en: 'Programs', ar: 'البرامج' },
};

const TAB_ICONS: Record<GymTab, string> = {
  Schedule: 'calendar_month',
  Bookings: 'calendar_month',
  Staff: 'group',
  Payroll: 'payments',
  Programs: 'fitness_center',
};

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAYS_AR = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const HOURS = Array.from({ length: 13 }, (_, i) => `${(i + 6).toString().padStart(2, '0')}:00`);

const FALLBACK_PROGRAMS = ['All', 'Yoga', 'CrossFit', 'Zumba', 'Spinning', 'Boxing', 'Pilates'];
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

interface ScheduleEntry { name: string; trainer: string; color: string; time: string }

function toTimeLabel(startTime: string): string {
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function getWeekDates(base: Date): Date[] {
  const start = new Date(base);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export default function GymCalendar() {
  const { language } = useApp();
  const rtl = language === 'ar';
  const [activeTab, setActiveTab] = useState<GymTab>('Schedule');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<typeof VIEWS[number]>('Grid');
  const [programFilter, setProgramFilter] = useState('All');

  const { data: classesRes } = useApiQuery<{ data: UpcomingClassData[] }>(
    ['upcoming-classes'],
    () => getUpcomingClasses(),
    { staleTime: 30_000 },
  );

  const { data: staffRes, isLoading: staffLoading } = useApiQuery<{ data: StaffData[] }>(
    ['calendar-staff'],
    () => listStaff(),
    { enabled: activeTab === 'Staff' },
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

  const schedule: Record<string, ScheduleEntry[]> = useMemo(() => {
    const map: Record<string, ScheduleEntry[]> = {};
    (classesRes?.data || []).forEach((c, idx) => {
      const dayKey = DAYS.find((d) => d.toLowerCase() === (c.day || '').toLowerCase()) || c.day;
      if (!dayKey) return;
      if (!map[dayKey]) map[dayKey] = [];
      map[dayKey].push({
        name: c.name,
        trainer: c.trainer_name,
        color: CLASS_COLORS[idx % CLASS_COLORS.length],
        time: toTimeLabel(c.start_time),
      });
    });
    return map;
  }, [classesRes]);

  const programOptions = useMemo(() => {
    const names = [...new Set((classesRes?.data || []).map((c) => c.name).filter(Boolean))];
    return names.length > 0 ? ['All', ...names] : FALLBACK_PROGRAMS;
  }, [classesRes]);

  const weekDates = getWeekDates(currentDate);
  const dayLabels = rtl ? DAYS_AR : DAYS;

  const navWeek = (dir: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  };

  const renderSchedule = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navWeek(-1)} className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition">
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[180px] text-center">
            {weekDates[0].toLocaleDateString(rtl ? 'ar-EG' : 'en-US', { month: 'long', day: 'numeric' })} – {weekDates[6].toLocaleDateString(rtl ? 'ar-EG' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={() => navWeek(1)} className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition">
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
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
            className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {programOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {view === 'Grid' ? (
        <div className="grid grid-cols-7 gap-2">
          {weekDates.map((date, i) => {
            const dayName = DAYS[i];
            const classes = schedule[dayName] || [];
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <div key={i} className={`bg-white border rounded-3xl p-2 min-h-[140px] shadow-sm ${isToday ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-gray-100'}`}>
                <div className={`text-center mb-2 ${isToday ? 'text-emerald-600 font-bold' : 'text-gray-500'}`}>
                  <p className="text-[10px]">{dayLabels[i]}</p>
                  <p className="text-lg font-bold">{date.getDate()}</p>
                </div>
                <div className="space-y-1">
                  {classes.filter((c) => programFilter === 'All' || c.name === programFilter).map((c, j) => (
                    <div key={j} className={`${c.color} rounded-xl px-2 py-1 text-[10px] leading-tight`}>
                      <p className="font-semibold">{c.name}</p>
                      <p className="opacity-70">{c.time} · {c.trainer}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-3 text-right text-gray-500 font-medium w-20">{rtl ? 'الوقت' : 'Time'}</th>
                {weekDates.map((_, i) => (
                  <th key={i} className="p-3 text-center text-gray-500 font-medium">
                    {dayLabels[i]}<br /><span className="text-xs">{weekDates[i].getDate()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((hour) => (
                <tr key={hour} className="border-b border-gray-100 last:border-0">
                  <td className="p-2 text-xs text-gray-500 text-center">{hour}</td>
                  {weekDates.map((_, dayIdx) => {
                    const dayName = DAYS[dayIdx];
                    const classes = (schedule[dayName] || []).filter((c) => c.time === hour || c.time.startsWith(hour.slice(0, 2) + ':'));
                    return (
                      <td key={dayIdx} className="p-1 border-r border-gray-100 last:border-r-0">
                        {classes.filter((c) => programFilter === 'All' || c.name === programFilter).map((c, j) => (
                          <div key={j} className={`${c.color} rounded-xl px-2 py-1 text-[10px] mb-0.5`}>
                            <p className="font-semibold">{c.name}</p>
                            <p className="opacity-70">{c.trainer}</p>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
                        {s.salary != null ? `${Number(s.salary).toLocaleString()} ${rtl ? 'ج.م' : 'EGP'}` : '—'}
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
          { key: 'total', label: rtl ? 'إجمالي المدفوع' : 'Total Paid', value: `${payrollTotal.toLocaleString()} ${rtl ? 'ج.م' : 'EGP'}`, icon: 'payments', color: 'primary' },
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
                      <td className="py-2.5 px-3 text-gray-500">{p.payment_date ? new Date(p.payment_date).toLocaleDateString(rtl ? 'ar-EG' : 'en-GB') : '—'}</td>
                      <td className="py-2.5 px-3 text-end text-gray-700">{Number(p.base_salary_paid || 0).toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-end text-gray-700">{Number(p.commissions_paid || 0).toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-end font-bold text-gray-900">{total.toLocaleString()}</td>
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

  const programs = useMemo(() => {
    const map: Record<string, { name: string; sessions: number; trainers: Set<string>; times: string[] }> = {};
    (classesRes?.data || []).forEach((c) => {
      if (!c.name) return;
      if (!map[c.name]) map[c.name] = { name: c.name, sessions: 0, trainers: new Set(), times: [] };
      map[c.name].sessions += 1;
      if (c.trainer_name) map[c.name].trainers.add(c.trainer_name);
      const t = toTimeLabel(c.start_time);
      if (t) map[c.name].times.push(`${c.day || ''} ${t}`.trim());
    });
    return Object.values(map).sort((a, b) => b.sessions - a.sessions);
  }, [classesRes]);

  const renderPrograms = () => (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-gray-900">{rtl ? 'البرامج التدريبية (من جدول الحصص)' : 'Training Programs (from class schedule)'}</h3>
      {programs.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">
          <span className="material-symbols-outlined text-4xl block mb-2">fitness_center</span>
          <p className="text-sm">{rtl ? 'لا توجد حصص مجدولة لاستخراج البرامج' : 'No scheduled classes to derive programs from'}</p>
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

  const renderPlaceholder = (tab: GymTab) => (
    <Card className="p-12 text-center">
      <span className="material-symbols-outlined text-5xl text-gray-500/30 block mb-3">
        {TAB_ICONS[tab]}
      </span>
      <p className="text-gray-500 font-medium">{rtl ? TAB_LABELS[tab].ar : TAB_LABELS[tab].en}</p>
      <p className="text-sm text-gray-500/60 mt-1">{rtl ? 'قيد التطوير' : 'Coming soon'}</p>
    </Card>
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
      <PageHeader
        title={rtl ? 'الصالة' : 'Gym'}
        subtitle={rtl ? 'الجدول الزمني والإدارة' : 'Schedule & management'}
        icon="fitness_center"
      />

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
      {activeTab === 'Bookings' && renderPlaceholder(activeTab)}
    </div>
  );
}
