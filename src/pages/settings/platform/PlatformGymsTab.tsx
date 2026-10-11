// â”€â”€ PlatformGymsTab â”€â”€

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { getPlatformSettings, updatePlatformSettings } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import { FloppyDisk, Barbell } from '@phosphor-icons/react';

export default function PlatformGymsTab() {
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
        max_gyms_per_admin: saved.max_gyms_per_admin || '50',
        gym_trial_days: saved.gym_trial_days || '14',
        max_gyms_per_plan_basic: saved.max_gyms_per_plan_basic || '1',
        max_gyms_per_plan_premium: saved.max_gyms_per_plan_premium || '5',
        max_gyms_per_plan_enterprise: saved.max_gyms_per_plan_enterprise || '999',
        default_gym_plan: saved.default_gym_plan || 'basic',
        allow_gym_creation: saved.allow_gym_creation || 'true',
        auto_approve_gyms: saved.auto_approve_gyms || 'false',
        allow_gym_deletion: saved.allow_gym_deletion || 'false',
        ...saved,
      }));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => updatePlatformSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'settings'] });
      showToast(isRtl ? 'تم حفظ إعدادات الصالات بنجاح' : 'Gym settings saved', 'success');
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

  const renderToggle = (key: string, label: string, description?: string) => {
    const checked = formValues[key] === 'true' || formValues[key] === '1';
    return (
      <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
        <div>
          <span className="text-sm font-medium text-gray-900">{label}</span>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => handleChange(key, checked ? 'false' : 'true')}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-emerald-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
        </label>
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">
          <span className="flex items-center gap-2">
            <Barbell size={20} className="text-emerald-600" />
            {isRtl ? 'إعدادات الصالات' : 'Gym Settings'}
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
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'الحد الأقصى للصالات لكل مشرف' : 'Max Gyms Per Admin'}</label>
              <input type="number" value={formValues.max_gyms_per_admin || ''} onChange={e => handleChange('max_gyms_per_admin', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'أيام التجربة للصالات' : 'Gym Trial Days'}</label>
              <input type="number" value={formValues.gym_trial_days || ''} onChange={e => handleChange('gym_trial_days', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'الحد الأقصى للصالات (الخطة الأساسية)' : 'Max Gyms (Basic Plan)'}</label>
              <input type="number" value={formValues.max_gyms_per_plan_basic || ''} onChange={e => handleChange('max_gyms_per_plan_basic', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'الحد الأقصى للصالات (الخطة المميزة)' : 'Max Gyms (Premium Plan)'}</label>
              <input type="number" value={formValues.max_gyms_per_plan_premium || ''} onChange={e => handleChange('max_gyms_per_plan_premium', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'الحد الأقصى للصالات (خطة المؤسسات)' : 'Max Gyms (Enterprise Plan)'}</label>
              <input type="number" value={formValues.max_gyms_per_plan_enterprise || ''} onChange={e => handleChange('max_gyms_per_plan_enterprise', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'الخطة الافتراضية للصالات' : 'Default Gym Plan'}</label>
              <select value={formValues.default_gym_plan || 'basic'} onChange={e => handleChange('default_gym_plan', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                <option value="basic">Basic</option>
                <option value="premium">Premium</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>
        </div>
          {renderToggle('allow_gym_creation', isRtl ? 'السماح بإنشاء صالات جديدة' : 'Allow Gym Creation')}
          {renderToggle('auto_approve_gyms', isRtl ? 'الموافقة التلقائية على الصالات' : 'Auto-approve Gyms', 'إذا كان معطلاً، يحتاج المشرف العام للموافقة على كل صالة جديدة')}
          {renderToggle('allow_gym_deletion', isRtl ? 'السماح بحذف الصالات' : 'Allow Gym Deletion')}

      </div>
    </div>
  );
}
