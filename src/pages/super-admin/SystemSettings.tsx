import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { getPlatformSettings, updatePlatformSettings } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

export default function SystemSettings() {
  const { language, setLanguage } = useApp();
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: getPlatformSettings,
  });

  const toStr = (v: unknown): string =>
    typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');

  useEffect(() => {
    if (data?.data) {
      const incoming: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.data)) incoming[k] = toStr(v);
      setFormValues((prev) => {
        const merged = { ...incoming };
        for (const key of Object.keys(prev)) {
          if (incoming[key] === undefined) {
            merged[key] = prev[key];
          }
        }
        return merged;
      });
    }
  }, [data]);

  const updateMut = useMutation({
    mutationFn: (v: Record<string, string>) => updatePlatformSettings(v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const handleSave = () => {
    updateMut.mutate(formValues);
  };

  const settings: Record<string, string> = {};
  for (const [k, v] of Object.entries(data?.data || {})) settings[k] = toStr(v);
  const keys = Object.keys(settings).length > 0 ? Object.keys(settings) : Object.keys(formValues);

  const isBoolean = (key: string, val: string) => val === 'true' || val === 'false' || key.toLowerCase().includes('enable') || key.toLowerCase().includes('active') || key.toLowerCase().includes('notify');

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <PageHeader title="الإعدادات" icon="settings" />
        <PageLoader variant="skeleton" message="جاري التحميل..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <PageHeader title="الإعدادات" icon="settings" />
        <Card>
          <div className="text-center py-12 text-red-500">حدث خطأ أثناء تحميل الإعدادات</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <PageHeader
        title="الإعدادات"
        subtitle="إعدادات النظام العامة"
        icon="settings"
      />

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl text-emerald-600">language</span>
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">لغة المنصة / Platform Language</p>
              <p className="text-xs text-gray-500">العربية / English</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setLanguage('ar')} className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${language === 'ar' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>العربية</button>
            <button onClick={() => setLanguage('en')} className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${language === 'en' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>English</button>
          </div>
        </div>
      </Card>

      {keys.length === 0 && (
        <Card>
          <div className="text-center py-12 text-gray-400">لا توجد إعدادات متاحة</div>
        </Card>
      )}

      {keys.length > 0 && (
        <Card>
          <div className="space-y-6">
            {keys.map((key) => {
              const val = formValues[key] !== undefined ? formValues[key] : settings[key] || '';
              const bool = isBoolean(key, val);

              if (bool) {
                const checked = val === 'true' || val === '1';
                return (
                  <div key={key} className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-900 font-medium">{key}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => setFormValues({ ...formValues, [key]: checked ? 'false' : 'true' })} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-100 rounded-full peer peer-checked:bg-emerald-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                    </label>
                  </div>
                );
              }

              return (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-900 mb-1">{key}</label>
                  <input type="text" value={val} onChange={(e) => setFormValues({ ...formValues, [key]: e.target.value })} className="w-full max-w-md px-4 py-2 bg-gray-50 border border-gray-100 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex items-center gap-4">
            <Button onClick={handleSave} variant="primary">
              <span className="material-symbols-outlined text-lg">save</span>
              <span>حفظ الإعدادات</span>
            </Button>
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <span className="material-symbols-outlined text-lg">check_circle</span>
                تم الحفظ
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
