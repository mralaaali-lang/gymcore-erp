import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { fmtNum } from '../../utils/date';
import { printDocument, escapeHtml } from '../../utils/print';
import { coachAttendanceReport, listCoachesSummary } from '../../services/api';
import { StatCard, Panel, EmptyState } from '../../components/dashboard';
import DataTable, { type TableColumn } from '../../components/ui/DataTable';
import { SkeletonStats, SkeletonTable } from '../../components/shared/Skeleton';
import { TrendUp as TrendingUp, TrendDown as TrendingDown, Users, ArrowRight } from '@phosphor-icons/react';
import { sportName, useSportsCatalog } from './subscriptions/shared';

// ====================================================================
// تقرير حضور المدربين (/admin/trainer-attendance/report) — شهري لا يومي.
// المقام الموثق للنسبة: أيام العمل في الشهر (أيام الشهر ناقص الجمعات،
// وبحد أقصى المنقضي للشهر الجاري) — لا أيام الشهر الكلي. ساعات العمل =
// مجموع مدد الشيفتات المغلقة فعلًا. أبكر/آخر = min/max الشهر.
// ====================================================================

export default function CoachAttendanceReportPage() {
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const rtl = language === 'ar';

  const [draftMonth, setDraftMonth] = useState(new Date().toISOString().slice(0, 7));
  const [draftCoach, setDraftCoach] = useState('');
  const [applied, setApplied] = useState({ month: draftMonth, coach: '' });

  const { data, isLoading, isError } = useApiQuery(
    ['coaches', 'attendance-report', applied.month, applied.coach],
    () => coachAttendanceReport(applied.month, applied.coach || undefined),
    { staleTime: 60_000 },
  );
  const rows = data?.data ?? [];
  const workingDays = Number(data?.working_days ?? 0);

  const { data: coachesRes } = useApiQuery(['coaches', 'summary'], listCoachesSummary, { staleTime: 60_000 });
  const coaches = (coachesRes?.data ?? []).filter((c) => c.is_active);
  const { sports: catalogSports } = useSportsCatalog();

  const avgDays = rows.length ? rows.reduce((s, r) => s + Number(r.days_present ?? 0), 0) / rows.length : 0;
  const top = rows.length ? rows.reduce((a, b) => (Number(b.days_present) > Number(a.days_present) ? b : a)) : null;
  const low = rows.length ? rows.reduce((a, b) => (Number(b.days_present) < Number(a.days_present) ? b : a)) : null;

  const hoursOf = (min: number) => {
    const m = Number(min ?? 0);
    if (m < 60) return `${fmtNum(m)} ${rtl ? 'دقيقة' : 'min'}`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r === 0 ? `${fmtNum(h)} ${rtl ? 'ساعة' : 'h'}` : `${fmtNum(h)} ${rtl ? 'ساعة' : 'h'} ${fmtNum(r)} ${rtl ? 'د' : 'm'}`;
  };

  type CoachReportRow = Awaited<ReturnType<typeof coachAttendanceReport>>['data'][number];

  // موجة 4 / دفعة ج — لا رؤوس متفرزات: `coachAttendanceReport` (`staff.ts:439`)
  // بيرتّب ثابت ORDER BY days_present DESC, full_name ASC وقايمة السيرفر بلا
  // whitelist ترتيب، فعدد الرؤوس المتفرزات على الشاشة = 0 حرفيًا.
  const columns: TableColumn<CoachReportRow>[] = [
    { id: 'full_name', label: rtl ? 'المدرب' : 'Coach', value: (r) => r.full_name, cell: (r) => <span className="font-medium whitespace-nowrap">{r.full_name}</span> },
    { id: 'sport_mode', label: rtl ? 'التخصص' : 'Specialty', value: (r) => (r.sport_mode ? sportName(r.sport_mode, catalogSports, rtl) : rtl ? 'عام' : 'General') },
    { id: 'days_present', label: rtl ? 'أيام الحضور' : 'Days', numeric: true, value: (r) => r.days_present, cell: (r) => <span className="tabular-nums font-semibold">{fmtNum(r.days_present)}</span> },
    { id: 'total_min', label: rtl ? 'ساعات العمل' : 'Hours', numeric: true, value: (r) => hoursOf(Number(r.total_min ?? 0)) },
    { id: 'attendance_pct', label: rtl ? 'نسبة الحضور' : 'Rate', numeric: true, value: (r) => `${fmtNum(r.attendance_pct)}%`, cell: (r) => <span className="tabular-nums font-semibold text-sky-600">{fmtNum(r.attendance_pct)}%</span> },
    { id: 'earliest_in', label: rtl ? 'أبكر حضور' : 'Earliest', value: (r) => r.earliest_in ?? '—', cell: (r) => <span dir="ltr" className="text-gray-500 tabular-nums">{r.earliest_in ?? '—'}</span> },
    { id: 'latest_out', label: rtl ? 'آخر انصراف' : 'Latest', value: (r) => r.latest_out ?? '—', cell: (r) => <span dir="ltr" className="text-gray-500 tabular-nums">{r.latest_out ?? '—'}</span> },
  ];

  const print = () => {
    const ok = printDocument({
      title: rtl ? `تقرير حضور المدربين — ${applied.month}` : `Coach attendance — ${applied.month}`,
      innerHtml: `<h1>${escapeHtml(rtl ? `تقرير حضور المدربين — ${applied.month}` : `Coach attendance — ${applied.month}`)}</h1>
        <p class="muted">${escapeHtml(rtl ? `المقام: ${workingDays} يوم عمل (بلا جمعات)` : `Base: ${workingDays} working days (no Fridays)`)}</p>
        <table><thead><tr><th>${rtl ? 'المدرب' : 'Coach'}</th><th>${rtl ? 'التخصص' : 'Sport'}</th><th>${rtl ? 'أيام' : 'Days'}</th><th>${rtl ? 'ساعات' : 'Hours'}</th><th>%</th><th>${rtl ? 'أبكر' : 'First'}</th><th>${rtl ? 'آخر' : 'Last'}</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.full_name)}</td><td>${escapeHtml(sportName(r.sport_mode, catalogSports, rtl))}</td><td>${r.days_present}</td><td>${r.total_min}</td><td>${r.attendance_pct}%</td><td>${r.earliest_in ?? '—'}</td><td>${r.latest_out ?? '—'}</td></tr>`).join('')}</tbody></table>`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="space-y-5">
        {/* الهيدر: يمين العنوان + شمال PDF ورجوع */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-extrabold text-gray-900">{rtl ? 'تقرير حضور المدربين' : 'Coach attendance report'}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={print}
              className="inline-flex items-center gap-1.5 bg-sky-100 hover:bg-sky-200 text-sky-700 text-sm font-bold px-4 py-2.5 rounded-2xl transition min-h-[44px]"
            >
              <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
              PDF
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/trainer-attendance')}
              className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl shadow-sm hover:bg-gray-50 transition min-h-[44px]"
            >
              <ArrowRight size={16} className={rtl ? '' : 'rotate-180'} />
              {rtl ? 'رجوع' : 'Back'}
            </button>
          </div>
        </div>

        {/* الفلتر: شهري */}
        <Panel icon={Users} accent="cyan" title={rtl ? 'الفلاتر' : 'Filters'}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">{rtl ? 'الشهر' : 'Month'}</label>
              <input type="month" value={draftMonth} onChange={(e) => setDraftMonth(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">{rtl ? 'المدرب' : 'Coach'}</label>
              <select value={draftCoach} onChange={(e) => setDraftCoach(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none min-w-[200px]">
                <option value="">{rtl ? 'جميع المدربين' : 'All coaches'}</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setApplied({ month: draftMonth, coach: draftCoach })}
              className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold min-h-[44px]"
            >
              {rtl ? 'عرض التقرير' : 'Show report'}
            </button>
          </div>
        </Panel>

        {/* كروت الملخص */}
        {isLoading ? (
          /* موجة 4 / دفعة ج — الفانطازة بنفس هندسة الشاشة النهائية: 3 كروت ← جدول.
             القياس الحي على العرضين: الصف سطر واحد = 44px (الإيقاع الأساسي 45 ناقص
             حدود border-collapse)، والرأس 41 ثابت لأن الأرضية اللمسية مستثناة منه
             بـtouch-auto. بنكتب 44 حرفيًا عشان الفانطازة ما تقفّزش عند نزول البيانات. */
          <>
            <SkeletonStats columns={3} gridClassName="grid-cols-2 lg:grid-cols-3 gap-5" />
            <SkeletonTable rows={6} cols={columns.length} rowHeight={44} />
          </>
        ) : (
          <>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          <StatCard icon={Users} label={rtl ? 'متوسط أيام الحضور' : 'Avg days'} value={avgDays.toFixed(1)} accent="sky" />
          <StatCard
            icon={TrendingUp}
            label={rtl ? 'الأعلى حضورًا' : 'Top'}
            value={top ? `${top.full_name} · ${fmtNum(top.days_present)}` : '—'}
            accent="emerald"
          />
          <StatCard
            icon={TrendingDown}
            label={rtl ? 'الأقل حضورًا' : 'Lowest'}
            value={low ? `${low.full_name} · ${fmtNum(low.days_present)}` : '—'}
            accent="rose"
          />
        </div>

        {/* الجدول */}
        <Panel
          icon={Users}
          accent="emerald"
          title={`${rtl ? 'ملخص الحضور' : 'Attendance summary'} - ${applied.month} (${fmtNum(rows.length)})`}
        >
          {isError ? (
            <p className="text-sm text-red-500 text-center py-8">{rtl ? 'فشل التحميل' : 'Failed to load'}</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={Users} accent="gray" title={rtl ? 'لا مدربين' : 'No coaches'} />
          ) : (
            <>
              {/* الجدول على صدفة `ui/DataTable` — جوّه Panel بقشرة كاملة فالـ`bare`
                  لازم، والفرز المعروض هو فرز السيرفر الثابت نفسه. */}
              <DataTable bare columns={columns} data={rows} rowKey={(r) => r.id} caption={rtl ? 'ملخص حضور المدربين' : 'Coach attendance summary'} />
              <p className="mt-3 text-xs text-gray-400">
                {rtl
                  ? `المقام: ${fmtNum(workingDays)} يوم عمل في ${applied.month} (أيام الشهر ناقص الجمعات، وبحد أقصى المنقضي للشهر الجاري).`
                  : `Base: ${workingDays} working days in ${applied.month} (month days minus Fridays, capped at elapsed).`}
              </p>
            </>
          )}
        </Panel>
          </>
        )}
      </div>
    </div>
  );
}
