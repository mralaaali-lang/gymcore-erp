// â”€â”€ PlatformGeneralTab â”€â”€

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { getPlatformSettings, updatePlatformSettings } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import { FloppyDisk, GlobeSimple } from '@phosphor-icons/react';

export default function PlatformGeneralTab() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';

  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['platform', 'settings'],
    queryFn: getPlatformSettings,
  });

  useEffect(() => {
    if (data?.data) {
      const saved = data.data as Record<string, string>;
      setFormValues(() => ({
        platform_name: saved.platform_name || '',
        platform_description: saved.platform_description || '',
        platform_contact_email: saved.platform_contact_email || '',
        platform_contact_phone: saved.platform_contact_phone || '',
        platform_default_currency: saved.platform_default_currency || 'USD',
        platform_default_timezone: saved.platform_default_timezone || 'Africa/Cairo',
        platform_default_language: saved.platform_default_language || 'ar',
        ...saved,
      }));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => updatePlatformSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'settings'] });
      showToast(isRtl ? 'تم حفظ الإعدادات العامة بنجاح' : 'General settings saved', 'success');
    },
    onError: () => {
      showToast(isRtl ? 'فشل حفظ الإعدادات' : 'Failed to save settings', 'error');
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formValues);
  };

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return <PageLoader />;
  }

  // renderToggle removed (unused)

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">
          <span className="flex items-center gap-2">
            <GlobeSimple size={20} className="text-emerald-600" />
            {isRtl ? 'الإعدادات العامة' : 'General Settings'}
          </span>
        </h2>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition disabled:opacity-50 text-sm font-medium"
        >
          {updateMutation.isPending ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <FloppyDisk size={16} />}
          <span>{isRtl ? 'حفظ' : 'Save'}</span>
        </button>
      </div>

      <div className="space-y-4 max-w-3xl">
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'اسم المنصة' : 'Platform Name'}</label>
              <input type="text" value={formValues.platform_name || ''} onChange={e => handleChange('platform_name', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'وصف المنصة' : 'Platform Description'}</label>
              <textarea value={formValues.platform_description || ''} onChange={e => handleChange('platform_description', e.target.value)} rows={3} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'البريد الإلكتروني للاتصال' : 'Contact Email'}</label>
              <input type="email" value={formValues.platform_contact_email || ''} onChange={e => handleChange('platform_contact_email', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'رقم الهاتف للاتصال' : 'Contact Phone'}</label>
              <input type="tel" value={formValues.platform_contact_phone || ''} onChange={e => handleChange('platform_contact_phone', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" dir="ltr" />
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'العملة الافتراضية' : 'Default Currency'}</label>
              <select value={formValues.platform_default_currency || 'USD'} onChange={e => handleChange('platform_default_currency', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (â‚¬)</option>
                <option value="EGP">EGP (آ£)</option>
                <option value="SAR">SAR (ï·¼)</option>
                <option value="AED">AED (د.إ)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'المنطقة الزمنية الافتراضية' : 'Default Timezone'}</label>
              <select value={formValues.platform_default_timezone || 'Africa/Cairo'} onChange={e => handleChange('platform_default_timezone', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                <option value="Africa/Cairo">Africa/Cairo</option>
                <option value="Asia/Riyadh">Asia/Riyadh</option>
                <option value="Asia/Dubai">Asia/Dubai</option>
                <option value="Asia/Kuwait">Asia/Kuwait</option>
                <option value="Asia/Baghdad">Asia/Baghdad</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'اللغة الافتراضية' : 'Default Language'}</label>
              <select value={formValues.platform_default_language || 'ar'} onChange={e => handleChange('platform_default_language', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
