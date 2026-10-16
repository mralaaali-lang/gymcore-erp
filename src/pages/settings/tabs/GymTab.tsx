import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp, DEFAULT_BRAND_COLOR } from '../../../context/GymBrandContext';
import { getSettings, updateSettings, uploadGymLogo } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { Buildings as Building2, MapPin, Phone, GlobeSimple as Globe, Clock, Palette } from '@phosphor-icons/react';
import Button from '../../../components/ui/Button';
import PageLoader from '../../../components/shared/PageLoader';
import { WEEK_DAYS } from '../../gym-admin/subscriptions/shared';
import { SPORT_COLORS } from '../../gym-admin/subscriptions/shared';

const TIMEZONES = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Baghdad', 'America/New_York', 'Europe/London'];
const CURRENCIES = ['EGP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'USD', 'EUR', 'GBP'];

// بيانات الصالة: بطاقتان جنب بعض (أساسية يمين + شعار وهوية شمال) وتحتهما
// مواعيد العمل — كل حقل يُستهلك فعليًا: الاسم/الهاتف/العملة/المنطقة من
// البروفايل، لون البراند في شريط السايدبار، وأيام/ساعات التشغيل بوابة
// دخول في تسجيل الحضور (الفارغ = بلا قيد).
export default function GymTab() {
  const { language, setLanguage } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['gym', 'info'] });
      showToast(rtl ? 'تم حفظ الإعدادات' : 'Settings saved', 'success');
    },
    onError: () => showToast(rtl ? 'فشل الحفظ' : 'Save failed', 'error'),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [workDays, setWorkDays] = useState<string[]>([]);
  useEffect(() => {
    if (data?.data) {
      setForm(data.data);
      const wd = String(data.data.work_days || '').split(',').map((d) => d.trim()).filter(Boolean);
      setWorkDays(wd);
    }
  }, [data]);

  const setField = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));
  const toggleDay = (c: string) =>
    setWorkDays((prev) => (prev.includes(c) ? prev.filter((d) => d !== c) : [...prev, c]));

  const handleSave = () => {
    mutation.mutate({
      gym_name: form.gym_name || '',
      gym_name_en: form.gym_name_en || '',
      gym_phone: form.gym_phone || '',
      gym_email: form.gym_email || '',
      gym_address: form.gym_address || '',
      gym_city: form.gym_city || '',
      gym_state: form.gym_state || '',
      gym_zip: form.gym_zip || '',
      gym_country: form.gym_country || 'Egypt',
      gym_timezone: form.gym_timezone || 'Africa/Cairo',
      currency: form.currency || 'EGP',
      logo_url: form.logo_url || '',
      gym_brand_color: form.gym_brand_color || DEFAULT_BRAND_COLOR,
      work_open: form.work_open || '',
      work_close: form.work_close || '',
      work_days: workDays.join(','),
      date_format: form.date_format || 'DD/MM/YYYY',
      time_format: form.time_format || '12h',
      first_day_of_week: form.first_day_of_week || 'Sunday',
      language_setting: form.language_setting || 'ar',
    });
  };

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast(rtl ? 'حجم الملف يتجاوز 2 ميجا' : 'File exceeds 2 MB limit', 'error');
      return;
    }
    try {
      const res = await uploadGymLogo(file);
      setField('logo_url', res.data.url);
      showToast(rtl ? 'تم رفع الشعار' : 'Logo uploaded', 'success');
    } catch {
      showToast(rtl ? 'فشل رفع الشعار' : 'Logo upload failed', 'error');
    }
  };

  const inputCls = 'w-full px-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder:text-gray-400 transition';

  const TIME_FORMATS = ['12h', '24h'];
  const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
  const WEEK_STARTS = ['Saturday', 'Sunday', 'Monday'];

  if (isLoading) {
    return <PageLoader variant="skeleton" rows={6} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* يمين — البيانات الأساسية */}
        <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5 space-y-4">
          <h3 className="font-bold text-gray-900">{rtl ? 'البيانات الأساسية' : 'Basic info'}</h3>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-2">
              <Building2 size={16} className="text-orange-500" /> {rtl ? 'اسم الصالة (عربي)' : 'Gym name (AR)'}
            </label>
            <input type="text" value={form.gym_name || ''} onChange={(e) => setField('gym_name', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-2">
              <Building2 size={16} className="text-orange-500" /> {rtl ? 'اسم الصالة (إنجليزي)' : 'Gym name (EN)'}
            </label>
            <input type="text" value={form.gym_name_en || ''} onChange={(e) => setField('gym_name_en', e.target.value)} className={inputCls} dir="ltr" />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-2">
              <Phone size={16} className="text-orange-500" /> {rtl ? 'رقم الهاتف' : 'Phone'}
            </label>
            <input type="text" value={form.gym_phone || ''} onChange={(e) => setField('gym_phone', e.target.value)} className={inputCls} dir="ltr" />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-2">
              <MapPin size={16} className="text-orange-500" /> {rtl ? 'العنوان' : 'Address'}
            </label>
            <textarea value={form.gym_address || ''} onChange={(e) => setField('gym_address', e.target.value)} rows={2} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-2">{rtl ? 'العملة' : 'Currency'}</label>
              <select value={form.currency || 'EGP'} onChange={(e) => setField('currency', e.target.value)} className={inputCls}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1 text-sm font-semibold text-gray-500 mb-2">
                <Clock size={16} className="text-orange-500" /> {rtl ? 'المنطقة الزمنية' : 'Timezone'}
              </label>
              <select value={form.gym_timezone || 'Africa/Cairo'} onChange={(e) => setField('gym_timezone', e.target.value)} className={inputCls}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* شمال — الشعار والهوية */}
        <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5 space-y-4">
          <h3 className="font-bold text-gray-900">{rtl ? 'الشعار والهوية' : 'Logo & identity'}</h3>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title={rtl ? 'رفع شعار' : 'Upload logo'}
              className="w-24 h-24 rounded-full bg-white border-2 border-dashed border-gray-300 hover:border-orange-500 flex items-center justify-center overflow-hidden transition shrink-0"
            >
              {form.logo_url ? (
                <img src={form.logo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-3xl text-gray-400">add_a_photo</span>
              )}
            </button>
            <div className="text-sm text-gray-500">
              <p className="font-semibold text-gray-700">{rtl ? 'شعار الصالة' : 'Gym logo'}</p>
              <p className="text-xs mt-0.5">{rtl ? 'انقر للدائرة للرفع — معاينة فورية (حتى 2 ميجا)' : 'Click the circle to upload — instant preview (max 2 MB)'}</p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-2">
              <Palette size={16} className="text-primary" /> {rtl ? 'لون البراند' : 'Brand color'}
            </label>
            <div className="flex flex-wrap gap-2">
              {SPORT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setField('gym_brand_color', c)}
                  aria-label={c}
                  className={`w-9 h-9 rounded-full transition-all active:scale-95 ${
                    (form.gym_brand_color || DEFAULT_BRAND_COLOR) === c ? 'ring-2 ring-offset-2 ring-gray-900' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-400">{rtl ? 'يُطبَّق على شارة الصالة في السايدبار.' : 'Applied to the gym badge in the sidebar.'}</p>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-2">
              <Globe size={16} className="text-orange-500" /> {rtl ? 'الدولة' : 'Country'}
            </label>
            <input type="text" value={form.gym_country || 'Egypt'} onChange={(e) => setField('gym_country', e.target.value)} className={inputCls} dir="ltr" />
          </div>
        </div>
      </div>

      {/* مواعيد العمل */}
      <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
        <h3 className="font-bold text-gray-900 mb-3">{rtl ? 'مواعيد العمل' : 'Working hours'}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'من' : 'From'}</label>
            <input type="time" value={form.work_open || ''} onChange={(e) => setField('work_open', e.target.value)} className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm" dir="ltr" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'إلى' : 'To'}</label>
            <input type="time" value={form.work_close || ''} onChange={(e) => setField('work_close', e.target.value)} className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm" dir="ltr" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_DAYS.map((d) => {
              const on = workDays.length === 0 || workDays.includes(d.code);
              return (
                <button
                  key={d.code}
                  type="button"
                  onClick={() => toggleDay(d.code)}
                  title={workDays.length === 0 ? (rtl ? 'الكل مفعّل — اضغط للتخصيص' : 'All on — tap to customize') : undefined}
                  className={`min-h-[40px] px-3 rounded-xl text-xs font-bold transition-all ${
                    on ? 'bg-sky-500 text-white' : 'bg-white border border-gray-200 text-gray-500'
                  }`}
                >
                  {d.ar}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          {rtl ? 'الفارغ = مفتوح دائمًا. خارج المواعيد يُرفض تسجيل الحضور.' : 'Empty = always open. Check-ins outside hours are refused.'}
        </p>
      </div>

      {/* اللغة والتنسيقات — مدمجة هنا بدل زرار الهيدر */}
      <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
        <h3 className="font-bold text-gray-900 mb-3">
          <span className="material-symbols-outlined text-lg align-middle ml-1">translate</span>
          {rtl ? 'اللغة والتنسيقات' : 'Language & formats'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'اللغة' : 'Language'}</label>
            <div className="flex gap-1.5 bg-white border border-gray-200 rounded-2xl p-1">
              {(['ar', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => { setField('language_setting', l); setLanguage(l); }}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                    (form.language_setting || 'ar') === l ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {l === 'ar' ? 'العربية' : 'English'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'صيغة التاريخ' : 'Date format'}</label>
            <select value={form.date_format || 'DD/MM/YYYY'} onChange={(e) => setField('date_format', e.target.value)} className={inputCls}>
              {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'صيغة الوقت' : 'Time format'}</label>
            <select value={form.time_format || '12h'} onChange={(e) => setField('time_format', e.target.value)} className={inputCls}>
              {TIME_FORMATS.map((f) => <option key={f} value={f}>{f} ({f === '12h' ? 'AM/PM' : '00–23'})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'أول أيام الأسبوع' : 'Week starts'}</label>
            <select value={form.first_day_of_week || 'Sunday'} onChange={(e) => setField('first_day_of_week', e.target.value)} className={inputCls}>
              {WEEK_STARTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-start pt-1">
        <Button variant="primary" onClick={handleSave} disabled={mutation.isPending} className="!bg-orange-500 hover:!bg-orange-600">
          <span className="material-symbols-outlined text-lg">{mutation.isPending ? 'sync' : 'save'}</span>
          {rtl ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
