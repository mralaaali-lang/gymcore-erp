// â”€â”€ PlatformSessionsTab â”€â”€

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { getPlatformSettings, updatePlatformSettings } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import { FloppyDisk, Monitor } from '@phosphor-icons/react';

export default function PlatformSessionsTab() {
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
        session_timeout: saved.session_timeout || '60',
        max_concurrent_sessions: saved.max_concurrent_sessions || '5',
        remember_me_duration: saved.remember_me_duration || '30',
        allow_remember_me: saved.allow_remember_me || 'true',
        session_inactivity_warning: saved.session_inactivity_warning || 'true',
        force_logout_on_password_change: saved.force_logout_on_password_change || 'true',
        allow_session_from_any_ip: saved.allow_session_from_any_ip || 'true',
        ...saved,
      }));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => updatePlatformSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'settings'] });
      showToast(isRtl ? 'تم حفظ إعدادات الجلسات بنجاح' : 'Session settings saved', 'success');
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
            <Monitor size={20} className="text-emerald-600" />
            {isRtl ? 'إعدادات الجلسات' : 'Session Settings'}
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
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'مهلة الجلسة (دقائق)' : 'Session Timeout (min)'}</label>
              <input type="number" value={formValues.session_timeout || ''} onChange={e => handleChange('session_timeout', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'الحد الأقصى للجلسات المتزامنة' : 'Max Concurrent Sessions'}</label>
              <input type="number" value={formValues.max_concurrent_sessions || ''} onChange={e => handleChange('max_concurrent_sessions', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'مدة تذكرني (أيام)' : 'Remember Me Duration (days)'}</label>
              <input type="number" value={formValues.remember_me_duration || ''} onChange={e => handleChange('remember_me_duration', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
          </div>
        </div>
          {renderToggle('allow_remember_me', isRtl ? 'السماح بخيار تذكرني' : 'Allow Remember Me')}
          {renderToggle('session_inactivity_warning', isRtl ? 'تحذير عند انتهاء الجلسة' : 'Session Expiry Warning', 'إظهار تحذير قبل انتهاء الجلسة بدقيقة')}
          {renderToggle('force_logout_on_password_change', isRtl ? 'إنهاء الجلسات عند تغيير كلمة المرور' : 'Force Logout on Password Change')}
          {renderToggle('allow_session_from_any_ip', isRtl ? 'السماح بالجلسات من أي IP' : 'Allow Sessions from Any IP')}

      </div>
    </div>
  );
}
