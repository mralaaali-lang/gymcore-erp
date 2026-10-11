import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { getSettings, updateSettings, uploadGymLogo } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { Building2, MapPin, Phone, Globe, Clock, Palette, Ruler, Database, Image } from 'lucide-react';
import Button from '../../../components/ui/Button';
import PageLoader from '../../../components/shared/PageLoader';
import UnifiedTabs from '../../../components/shared/UnifiedTabs';

const TIMEZONES = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Baghdad', 'America/New_York', 'Europe/London'];
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const TIME_FORMATS = ['12h', '24h'];
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];


export default function GymTab() {
  const { language, setLanguage } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSection, setActiveSection] = useState<string>('general');

  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); showToast(rtl ? 'تم حفظ الإعدادات' : 'Settings saved', 'success'); },
    onError: () => showToast(rtl ? 'فشل الحفظ' : 'Save failed', 'error'),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data?.data) setForm(data.data);
  }, [data]);

  const setField = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = () => {
    const payload: Record<string, string> = {
      gym_name: form.gym_name || '',
      gym_phone: form.gym_phone || '',
      gym_email: form.gym_email || '',
      gym_address: form.gym_address || '',
      gym_city: form.gym_city || '',
      gym_state: form.gym_state || '',
      gym_zip: form.gym_zip || '',
      gym_country: form.gym_country || 'Egypt',
      gym_timezone: form.gym_timezone || 'Africa/Cairo',
      date_format: form.date_format || 'DD/MM/YYYY',
      time_format: form.time_format || '12h',
      first_day_of_week: form.first_day_of_week || 'Sunday',
      language_setting: form.language_setting || 'ar',
      units_system: form.units_system || 'metric',
      logo_url: form.logo_url || '',
    };
    mutation.mutate(payload);
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

  const sections = [
    { id: 'general', icon: 'store', labelEn: 'General Information', labelAr: 'المعلومات العامة' },
    { id: 'language', icon: 'language', labelEn: 'Language, Units, Date & Time', labelAr: 'اللغة والوحدات والتاريخ والوقت' },
    { id: 'logo', icon: 'image', labelEn: 'Change Logo', labelAr: 'تغيير الشعار' },
  ];

  const inputCls = 'w-full px-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400 transition';
  const selectCls = inputCls;

  if (isLoading) {
    return <PageLoader variant="skeleton" rows={6} />;
  }

  return (
    <div className="space-y-6">
      <UnifiedTabs
        variant="pills"
        tabs={sections.map((sec) => ({ key: sec.id, labelAr: sec.labelAr, labelEn: sec.labelEn, icon: sec.icon }))}
        activeKey={activeSection}
        onChange={setActiveSection}
        className="mb-4"
      />

      {activeSection === 'general' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <Building2 size={18} className="text-emerald-600" /> {rtl ? 'اسم الصالة' : 'Gym Name'}
            </label>
            <input type="text" value={form.gym_name || ''} onChange={(e) => setField('gym_name', e.target.value)} className={inputCls} dir="ltr" />
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <Phone size={18} className="text-emerald-600" /> {rtl ? 'رقم الهاتف' : 'Phone'}
            </label>
            <input type="text" value={form.gym_phone || ''} onChange={(e) => setField('gym_phone', e.target.value)} className={inputCls} dir="ltr" />
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <Globe size={18} className="text-emerald-600" /> {rtl ? 'البريد الإلكتروني' : 'Email'}
            </label>
            <input type="email" value={form.gym_email || ''} onChange={(e) => setField('gym_email', e.target.value)} className={inputCls} dir="ltr" />
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <MapPin size={18} className="text-emerald-600" /> {rtl ? 'العنوان' : 'Address'}
            </label>
            <textarea value={form.gym_address || ''} onChange={(e) => setField('gym_address', e.target.value)} rows={2} className={inputCls} dir="ltr" />
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <MapPin size={18} className="text-emerald-600" /> {rtl ? 'المدينة' : 'City'}
            </label>
            <input type="text" value={form.gym_city || ''} onChange={(e) => setField('gym_city', e.target.value)} className={inputCls} dir="ltr" />
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <MapPin size={18} className="text-emerald-600" /> {rtl ? 'المنطقة' : 'State'}
            </label>
            <input type="text" value={form.gym_state || ''} onChange={(e) => setField('gym_state', e.target.value)} className={inputCls} dir="ltr" />
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <Database size={18} className="text-emerald-600" /> {rtl ? 'الرمز البريدي' : 'Postal Code'}
            </label>
            <input type="text" value={form.gym_zip || ''} onChange={(e) => setField('gym_zip', e.target.value)} className={inputCls} dir="ltr" />
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <Globe size={18} className="text-emerald-600" /> {rtl ? 'الدولة' : 'Country'}
            </label>
            <input type="text" value={form.gym_country || 'Egypt'} onChange={(e) => setField('gym_country', e.target.value)} className={inputCls} dir="ltr" />
          </div>
        </div>
      )}

      {activeSection === 'language' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <Clock size={18} className="text-emerald-600" /> {rtl ? 'المنطقة الزمنية' : 'Timezone'}
            </label>
            <select value={form.gym_timezone || 'Africa/Cairo'} onChange={(e) => setField('gym_timezone', e.target.value)} className={selectCls}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <Palette size={18} className="text-emerald-600" /> {rtl ? 'صيغة التاريخ' : 'Date Format'}
            </label>
            <select value={form.date_format || 'DD/MM/YYYY'} onChange={(e) => setField('date_format', e.target.value)} className={selectCls}>
              {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <Clock size={18} className="text-emerald-600" /> {rtl ? 'صيغة الوقت' : 'Time Format'}
            </label>
            <select value={form.time_format || '12h'} onChange={(e) => setField('time_format', e.target.value)} className={selectCls}>
              {TIME_FORMATS.map((f) => <option key={f} value={f}>{f} ({f === '12h' ? 'AM/PM' : '00:00–23:59'})</option>)}
            </select>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <Database size={18} className="text-emerald-600" /> {rtl ? 'أول أيام الأسبوع' : 'First Day of Week'}
            </label>
            <select value={form.first_day_of_week || 'Sunday'} onChange={(e) => setField('first_day_of_week', e.target.value)} className={selectCls}>
              {DAYS_OF_WEEK.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <Globe size={18} className="text-emerald-600" /> {rtl ? 'اللغة الافتراضية' : 'Default Language'}
            </label>
            <select value={form.language_setting || 'ar'} onChange={(e) => { setField('language_setting', e.target.value); setLanguage(e.target.value as 'ar' | 'en'); }} className={selectCls}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
              <Ruler size={18} className="text-emerald-600" /> {rtl ? 'نظام الوحدات' : 'Units System'}
            </label>
            <select value={form.units_system || 'metric'} onChange={(e) => setField('units_system', e.target.value)} className={selectCls}>
              <option value="metric">{rtl ? 'متري' : 'Metric'} (kg, cm)</option>
              <option value="imperial">{rtl ? 'إمبراطوري' : 'Imperial'} (lb, ft)</option>
            </select>
          </div>
        </div>
      )}

      {activeSection === 'logo' && (
        <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
            <Image size={18} className="text-emerald-600" /> {rtl ? 'شعار الصالة' : 'Gym Logo'}
          </label>
          <div className="flex items-center gap-4">
            <div className="w-28 h-28 rounded-2xl bg-gray-100 border border-gray-100 flex items-center justify-center overflow-hidden">
              {form.logo_url ? (
                <img src={form.logo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-4xl text-gray-500">image</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 bg-white hover:bg-gray-50 transition cursor-pointer flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">upload</span>
                {rtl ? 'رفع شعار جديد' : 'Upload New Logo'}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
              </label>
              {form.logo_url && (
                <button onClick={() => setField('logo_url', '')} className="px-4 py-2 border border-error/30 text-error rounded-xl text-sm font-medium hover:bg-error/5 transition">
                  {rtl ? 'إزالة الشعار' : 'Remove Logo'}
                </button>
              )}
              <p className="text-xs text-gray-500">
                {rtl ? 'يُسمح بصور JPG و PNG و GIF و SVG و WEBP. أقصى حجم 2 ميجا.' : 'JPG, PNG, GIF, SVG, WEBP allowed. Max 2 MB.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-4">
        <Button variant="primary" onClick={handleSave} disabled={mutation.isPending}>
          <span className="material-symbols-outlined text-lg">{mutation.isPending ? 'sync' : 'save'}</span>
          {rtl ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
