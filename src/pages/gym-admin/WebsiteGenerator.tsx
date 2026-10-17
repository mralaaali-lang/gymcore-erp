import { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings, uploadGymLogo } from '../../services/api';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

const WEBSITE_TABS = ['Settings', 'Homepage', 'Pages', 'Bookings', 'Instructors', 'Location', 'Schedule', 'Forms', 'Gallery', 'Pricing'] as const;
type WebsiteTab = typeof WEBSITE_TABS[number];

const TAB_LABELS: Record<WebsiteTab, { en: string; ar: string }> = {
  Settings: { en: 'Settings', ar: 'الإعدادات' },
  Homepage: { en: 'Homepage', ar: 'الصفحة الرئيسية' },
  Pages: { en: 'Pages', ar: 'الصفحات' },
  Bookings: { en: 'Bookings', ar: 'الحجوزات' },
  Instructors: { en: 'Instructors', ar: 'المدربين' },
  Location: { en: 'Location', ar: 'الموقع' },
  Schedule: { en: 'Schedule', ar: 'الجدول' },
  Forms: { en: 'Forms', ar: 'النماذج' },
  Gallery: { en: 'Gallery', ar: 'المعرض' },
  Pricing: { en: 'Pricing', ar: 'الأسعار' },
};

const TAB_ICONS: Record<WebsiteTab, string> = {
  Settings: 'settings',
  Homepage: 'home',
  Pages: 'web',
  Bookings: 'calendar_month',
  Instructors: 'group',
  Location: 'location_on',
  Schedule: 'schedule',
  Forms: 'dynamic_form',
  Gallery: 'photo_library',
  Pricing: 'payments',
};

const FONTS = ['Roboto', 'Open Sans', 'Poppins', 'Cairo', 'Tajawal', 'Inter', 'Lato', 'Montserrat'];

const PRESET_COLORS = ['#006c49', '#1a73e8', '#ea4335', '#fbbc04', '#34a853', '#8e24aa', '#ff6d01', '#00acc1'];

export default function WebsiteGenerator() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<WebsiteTab>('Settings');

  const { data: settingsData } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); showToast(rtl ? 'تم حفظ إعدادات الموقع' : 'Website settings saved', 'success'); },
    onError: () => showToast(rtl ? 'فشل الحفظ' : 'Save failed', 'error'),
  });

  const s = settingsData?.data || {};
  const [form, setForm] = useState({
    subdomain: 'mygym',
    title: '',
    font: 'Roboto',
    bgColor: '#ffffff',
    textColor: '#1a1a2e',
    linkColor: '#006c49',
    buttonColor: '#006c49',
    logoPreview: '',
  });

  useEffect(() => {
    if (settingsData?.data) {
      setForm({
        subdomain: s.website_subdomain || 'mygym',
        title: s.website_title || '',
        font: s.website_font || 'Roboto',
        bgColor: s.website_bg_color || '#ffffff',
        textColor: s.website_text_color || '#1a1a2e',
        linkColor: s.website_link_color || '#006c49',
        buttonColor: s.website_button_color || '#006c49',
        logoPreview: s.website_logo_url || s.logo_url || '',
      });
    }
  }, [settingsData]);

  const handleSave = () => {
    saveMutation.mutate({
      website_subdomain: form.subdomain,
      website_title: form.title,
      website_font: form.font,
      website_bg_color: form.bgColor,
      website_text_color: form.textColor,
      website_link_color: form.linkColor,
      website_button_color: form.buttonColor,
      website_logo_url: form.logoPreview,
    });
  };

  const handleColor = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
      setForm((prev) => ({ ...prev, logoPreview: res.data.url }));
      showToast(rtl ? 'تم رفع الشعار' : 'Logo uploaded', 'success');
    } catch {
      showToast(rtl ? 'فشل رفع الشعار' : 'Logo upload failed', 'error');
    }
  };

  const renderSettings = () => (
    <div className="max-w-2xl space-y-5">
      <Card className="space-y-4">
        <h3 className="text-base font-bold text-gray-900">{rtl ? 'إعدادات الموقع' : 'Website Settings'}</h3>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">
            {rtl ? 'الرابط الفرعي' : 'Subdomain'}
          </label>
          <div className="flex items-center border border-gray-200 rounded-2xl overflow-hidden bg-gray-50">
            <input
              type="text"
              value={form.subdomain}
              onChange={(e) => setForm((prev) => ({ ...prev, subdomain: e.target.value }))}
              className="flex-1 px-4 py-2.5 bg-transparent text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass text-sm"
            />
            <span className="px-3 text-sm text-gray-500 bg-gray-100 py-2.5">.gymcore.app</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">
            {rtl ? 'عنوان الموقع' : 'Website Title'}
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder={rtl ? 'اسم الصالة' : 'Your Gym Name'}
            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">{rtl ? 'الخط' : 'Font'}</label>
          <select
            value={form.font}
            onChange={(e) => setForm((prev) => ({ ...prev, font: e.target.value }))}
            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'bgColor', labelEn: 'Background', labelAr: 'الخلفية' },
            { key: 'textColor', labelEn: 'Text', labelAr: 'النص' },
            { key: 'linkColor', labelEn: 'Link', labelAr: 'الروابط' },
            { key: 'buttonColor', labelEn: 'Buttons', labelAr: 'الأزرار' },
          ].map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">
                {rtl ? field.labelAr : field.labelEn}
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={(form as any)[field.key]}
                  onChange={(e) => handleColor(field.key, e.target.value)}
                  className="w-10 h-10 rounded-xl border border-gray-200 cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={(form as any)[field.key]}
                  onChange={(e) => handleColor(field.key, e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  dir="ltr"
                />
              </div>
              <div className="flex gap-1 mt-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleColor(field.key, c)}
                    className="w-5 h-5 rounded-full border border-gray-200"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">{rtl ? 'الشعار' : 'Logo'}</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 border border-gray-100 flex items-center justify-center overflow-hidden">
              {form.logoPreview ? (
                <img src={form.logoPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-2xl text-gray-500">image</span>
              )}
            </div>
            <label className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 bg-white hover:bg-gray-50 transition cursor-pointer flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">upload</span>
              {rtl ? 'رفع شعار' : 'Upload Logo'}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button variant="primary" onClick={handleSave} disabled={saveMutation.isPending}>
            <span className="material-symbols-outlined text-lg">{saveMutation.isPending ? 'sync' : 'save'}</span>
            {rtl ? 'حفظ' : 'Save'}
          </Button>
        </div>
      </Card>
    </div>
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
      {/* §35ث — heading moved to the top bar */}

      <UnifiedTabs
        tabs={WEBSITE_TABS.map((tab) => ({
          key: tab,
          labelAr: TAB_LABELS[tab].ar,
          labelEn: TAB_LABELS[tab].en,
          icon: TAB_ICONS[tab],
        }))}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as WebsiteTab)}
      />

      {activeTab === 'Settings' && renderSettings()}
      {activeTab !== 'Settings' && (
        <Card className="p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-gray-500/30 block mb-3">web</span>
          <p className="text-gray-500 font-medium">{rtl ? TAB_LABELS[activeTab].ar : TAB_LABELS[activeTab].en}</p>
          <p className="text-sm text-gray-500/60 mt-1">{rtl ? 'قيد التطوير' : 'Coming soon'}</p>
        </Card>
      )}
    </div>
  );
}
