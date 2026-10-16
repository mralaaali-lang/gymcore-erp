import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, User } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { clockIn, listCoachesSummary } from '../../services/api';
import { sportName, useSportsCatalog } from './subscriptions/shared';

// ====================================================================
// تسجيل حضور مدرب (/admin/trainer-attendance/add) — طريقتان لنفس العملية:
// الضغطة الواحدة (quick-action) هي الافتراضي للحالة الشائعة (95%),
// والفورم الدقيق للحالات الاستثنائية (وقت مخصص/ملاحظة).
// staff_shifts بلا عمود ملاحظات — الملاحظة تُوثَّق في سجل الأنشطة.
// ====================================================================

const inputCls =
  'w-full min-h-[48px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

function nowLocal(): { date: string; time: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

export default function TrainerCheckInPage() {
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';

  const init = nowLocal();
  const [coachId, setCoachId] = useState('');
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [note, setNote] = useState('');

  const { data: coachesRes, isLoading } = useApiQuery(['coaches', 'summary'], listCoachesSummary, { staleTime: 30_000 });
  const coaches = (coachesRes?.data ?? []).filter((c) => c.is_active);
  const { sports: catalogSports } = useSportsCatalog();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['coaches', 'attendance'] });
    queryClient.invalidateQueries({ queryKey: ['coaches', 'summary'] });
  };

  const quickMut = useMutation({
    mutationFn: (id: string) => clockIn(id),
    onSuccess: (_r, id) => {
      invalidate();
      const name = coaches.find((c) => c.id === id)?.full_name ?? '';
      showToast(rtl ? `تم تسجيل حضور ${name} الآن` : 'Checked in', 'success');
    },
    onError: (e) => showToast(
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'فشل التسجيل' : 'Failed'),
      'error',
    ),
  });

  const formMut = useMutation({
    mutationFn: () => clockIn(coachId, {
      clock_in: new Date(`${date}T${time}`).toISOString(),
      note: note.trim() || undefined,
    }),
    onSuccess: () => {
      invalidate();
      showToast(rtl ? 'تم تسجيل الحضور' : 'Checked in', 'success');
      setCoachId(''); setNote('');
      const n = nowLocal(); setDate(n.date); setTime(n.time);
    },
    onError: (e) => showToast(
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'فشل التسجيل' : 'Failed'),
      'error',
    ),
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="space-y-5">
        {/* الهيدر: يمين العنوان + شمال رجوع */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold text-gray-900">{rtl ? 'تسجيل حضور مدرب' : 'Clock in a coach'}</h1>
          <button
            type="button"
            onClick={() => navigate('/admin/trainer-attendance')}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl shadow-sm hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <ArrowRight size={16} className={rtl ? '' : 'rotate-180'} />
            {rtl ? 'رجوع' : 'Back'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* اليمين — الفورم الرسمي (للحالات الاستثنائية) */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              <span className="material-symbols-outlined text-emerald-600 align-middle ml-1">login</span>
              {rtl ? 'تسجيل حضور' : 'Clock in'}
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              {rtl ? 'للحالات الخاصة: وقت مخصص أو ملاحظة — والحالة الشائعة بالضغطة الواحدة.' : 'For exceptions: custom time or a note.'}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {rtl ? 'المدرب' : 'Coach'} <span className="text-red-500">*</span>
                </label>
                <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={inputCls}>
                  <option value="">{rtl ? 'اختر…' : 'Select…'}</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}{c.sport_mode ? ` — ${sportName(c.sport_mode, catalogSports, rtl)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'التاريخ' : 'Date'}</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'الوقت' : 'Time'}</label>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} dir="ltr" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'ملاحظات' : 'Notes'}</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
              </div>
              <button
                type="button"
                onClick={() => formMut.mutate()}
                disabled={!coachId || !date || !time || formMut.isPending}
                className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold disabled:opacity-50 shadow-lg shadow-emerald-600/20"
              >
                <Check size={18} />
                {formMut.isPending ? (rtl ? 'جارٍ التسجيل…' : 'Saving…') : (rtl ? 'تسجيل الحضور' : 'Clock in')}
              </button>
            </div>
          </div>

          {/* الشمال — التسجيل السريع (الافتراضي) */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              <span className="material-symbols-outlined text-amber-500 align-middle ml-1">bolt</span>
              {rtl ? 'تسجيل سريع' : 'Quick check-in'}
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              {rtl ? 'اضغط على اسم المدرب لتسجيل حضوره الآن — بلا فورم ولا حفظ.' : 'Tap a coach name to clock them in now.'}
            </p>
            {isLoading ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {coaches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => quickMut.mutate(c.id)}
                    disabled={c.on_shift || quickMut.isPending}
                    title={c.on_shift ? (rtl ? 'حاضر بالفعل' : 'Already in') : (rtl ? 'تسجيل حضور الآن' : 'Clock in now')}
                    className={`min-h-[52px] px-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] ${
                      c.on_shift
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                        : 'bg-white text-emerald-700 border-2 border-emerald-500 hover:bg-emerald-500 hover:text-white disabled:opacity-50'
                    }`}
                  >
                    {c.on_shift ? <Check size={16} /> : <User size={16} />}
                    <span className="truncate">{c.full_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
