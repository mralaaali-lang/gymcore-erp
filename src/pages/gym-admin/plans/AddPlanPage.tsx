import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save } from 'lucide-react';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { createOffer } from '../../../services/api';
import { currencySymbol } from '../../../utils/currency';
import { WEEK_DAYS } from '../subscriptions/shared';
import SportSelect from '../subscriptions/SportSelect';

// ====================================================================
// إضافة باقة (/admin/plans/add) — فورم واحد عريض من فوق لتحت:
// هوية (اسم/رياضة/وصف) + قواعد (مدة/حصص/سعر/تجميد) + أيام حضور toggle
// + حفظ. الافتراضيات (30 يوم، تجميد 0، كل الأيام) هي ما يظهر في الكروت.
// الحصص الفارغة = null = تلقائي (يساوي الأيام، حصة/يوم) — لا إدخال مزدوج.
// أيام الحضور الكاملة تُخزَّن null (الكل) وتُنسخ لكل اشتراك جديد قابلة
// للتعديل في الاشتراك نفسه.
// ====================================================================

const inputCls =
  'w-full min-h-[48px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/40';

export default function AddPlanPage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';

  const [title, setTitle] = useState('');
  const [sport, setSport] = useState('');
  const [days, setDays] = useState('30');
  const [sessions, setSessions] = useState('');
  const [price, setPrice] = useState('');
  const [freeze, setFreeze] = useState('0');
  const [weekly, setWeekly] = useState<string[]>(WEEK_DAYS.map((d) => d.code));
  const [description, setDescription] = useState('');

  const daysNum = Number(days);
  const daysOk = days.trim() !== '' && Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 3650;
  const sessionsNum = Number(sessions);
  const sessionsOk = sessions.trim() === '' || (Number.isInteger(sessionsNum) && sessionsNum >= 1);
  const freezeNum = Number(freeze);
  const freezeOk = freeze.trim() === '' || (Number.isInteger(freezeNum) && freezeNum >= 0);
  // الرياضة إجبارية — لا «بدون تصنيف» جديدة (fallback الثابت عند تعذر الكتالوج)
  const valid = title.trim().length > 0 && sport !== '' && daysOk && sessionsOk && price !== '' && Number(price) >= 0 && freezeOk;

  const toggleDay = (code: string) =>
    setWeekly((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));
  const allDays = weekly.length === WEEK_DAYS.length;
  const toggleAll = () => setWeekly(allDays ? [] : WEEK_DAYS.map((d) => d.code));

  const save = useMutation({
    mutationFn: () =>
      createOffer({
        title: title.trim(),
        duration_days: daysNum,
        price: Number(price),
        sport: sport || null,
        total_sessions: sessions.trim() === '' ? null : sessionsNum,
        freeze_days_max: freeze.trim() === '' ? 0 : freezeNum,
        weekly_days: weekly.length === WEEK_DAYS.length ? null : weekly,
        description: description.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership-offers'] });
      showToast(rtl ? 'تمت إضافة الباقة' : 'Plan added', 'success');
      navigate('/admin/plans');
    },
    onError: (e) => {
      const data = (e as { response?: { data?: { error?: string } } })?.response?.data;
      showToast(data?.error || (rtl ? 'فشل إضافة الباقة' : 'Failed to add plan'), 'error');
    },
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* الهيدر: يمين إضافة باقة + شمال رجوع أبيض */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold text-gray-900">{rtl ? 'إضافة باقة' : 'New plan'}</h1>
          <button
            type="button"
            onClick={() => navigate('/admin/plans')}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl shadow-sm hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <ArrowRight size={16} className={rtl ? '' : 'rotate-180'} />
            {rtl ? 'رجوع' : 'Back'}
          </button>
        </div>

        {/* الصف الأول: الاسم + الرياضة */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {rtl ? 'اسم الباقة' : 'Plan name'} <span className="text-red-500">*</span>
              </label>
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={rtl ? 'مثال: شهر جيم + كارديو' : 'e.g. Gym + cardio month'}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-gray-700">
                  <span className="material-symbols-outlined text-base align-middle ml-1">fitness_center</span>
                  {rtl ? 'الرياضة' : 'Sport'}
                </label>
                <Link
                  to="/admin/sports"
                  className="text-xs font-semibold text-gray-400 hover:text-emerald-600"
                >
                  <span className="material-symbols-outlined text-sm align-middle ml-0.5">settings</span>
                  {rtl ? 'إدارة الرياضات' : 'Manage sports'}
                </Link>
              </div>
              <SportSelect value={sport} onChange={setSport} rtl={rtl} className={inputCls} />
              <p className="mt-1.5 text-xs text-gray-400">
                {rtl ? 'الباقة دي تبع أنهي رياضة — عشان تفلتر الاشتراكات بالرياضة. إجبارية: لا باقة جديدة بدون تصنيف.' : 'Which sport this plan belongs to — used to filter subscriptions. Required.'}
              </p>
            </div>
          </div>
        </div>

        {/* الصف الثاني: المدة / الحصص / السعر / التجميد */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {rtl ? 'المدة (أيام)' : 'Duration (days)'} <span className="text-red-500">*</span>
              </label>
              <input className={inputCls} type="number" min={1} max={3650} step={1} value={days} onChange={(e) => setDays(e.target.value)} />
              {!daysOk && <p className="mt-1 text-xs text-red-500">{rtl ? 'رقم صحيح أكبر من صفر' : 'Whole number above zero'}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'عدد الحصص' : 'Sessions'}</label>
              <input
                className={inputCls}
                type="number"
                min={1}
                step={1}
                value={sessions}
                onChange={(e) => setSessions(e.target.value)}
                placeholder={rtl ? `حصة (افتراضي) ${daysOk ? daysNum : 30}` : `sessions (default) ${daysOk ? daysNum : 30}`}
              />
              <p className="mt-1.5 text-xs text-gray-400">{rtl ? 'اتركه فارغ = نفس عدد الأيام' : 'Leave empty = same as days'}</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {rtl ? 'السعر' : 'Price'} ({currencySymbol(gymProfile?.currency)}) <span className="text-red-500">*</span>
              </label>
              <input className={inputCls} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                <span className="material-symbols-outlined text-base align-middle ml-1">ac_unit</span>
                {rtl ? 'أيام التجميد المسموحة' : 'Freeze days allowed'}
              </label>
              <input className={inputCls} type="number" min={0} step={1} value={freeze} onChange={(e) => setFreeze(e.target.value)} />
              <p className="mt-1.5 text-xs text-gray-400">{rtl ? 'عدد الأيام المسموح بتجميد الاشتراك' : 'Days a subscription may be frozen'}</p>
            </div>
          </div>
          {!sessionsOk && <p className="mt-2 text-xs text-red-500">{rtl ? 'الحصص رقم صحيح أكبر من صفر أو فارغ' : 'Sessions must be a whole number above zero, or empty'}</p>}
        </div>

        {/* أيام الحضور */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            <span className="material-symbols-outlined text-base align-middle ml-1">calendar_month</span>
            {rtl ? 'أيام الحضور في الباقة' : 'Attendance days'}
          </p>
          <div className="flex flex-wrap gap-2">
            {WEEK_DAYS.map((d) => {
              const on = weekly.includes(d.code);
              return (
                <button
                  key={d.code}
                  type="button"
                  onClick={() => toggleDay(d.code)}
                  aria-pressed={on}
                  className={`min-h-[44px] px-4 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                    on ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/25' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {d.ar}
                </button>
              );
            })}
            <button
              type="button"
              onClick={toggleAll}
              className={`min-h-[44px] px-4 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                allDays ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/25' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {rtl ? 'كل الأيام' : 'All days'}
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            {rtl
              ? 'الأيام اللي المشترك يقدر يحضر فيها على الباقة دي (مثلاً سبت/اثنين/أربعاء). بتتنقل تلقائياً لكل اشتراك جديد ويمكن تعديلها في الاشتراك نفسه.'
              : 'Days the member may attend on this plan. Copied automatically to each new subscription, editable per subscription.'}
          </p>
        </div>

        {/* الوصف */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'الوصف' : 'Description'}</label>
          <textarea className={`${inputCls} resize-none`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {/* حفظ أسفل الشمال */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!valid || save.isPending}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-8 py-3 rounded-2xl shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all min-h-[48px]"
          >
            <Save size={17} />
            {save.isPending ? (rtl ? 'جارٍ الحفظ…' : 'Saving…') : (rtl ? 'حفظ' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
