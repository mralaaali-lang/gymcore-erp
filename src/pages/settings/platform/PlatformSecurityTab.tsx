// â”€â”€ PlatformSecurityTab â”€â”€

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { getPlatformSettings, updatePlatformSettings } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import { FloppyDisk, Shield } from '@phosphor-icons/react';

export default function PlatformSecurityTab() {
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
        password_min_length: saved.password_min_length || '8',
        password_expiry_days: saved.password_expiry_days || '90',
        login_max_attempts: saved.login_max_attempts || '5',
        login_lockout_minutes: saved.login_lockout_minutes || '15',
        session_timeout_minutes: saved.session_timeout_minutes || '60',
        session_remember_me_days: saved.session_remember_me_days || '30',
        password_require_uppercase: saved.password_require_uppercase || 'true',
        password_require_numbers: saved.password_require_numbers || 'true',
        password_require_special: saved.password_require_special || 'false',
        two_factor_enabled: saved.two_factor_enabled || 'false',
        encrypt_pii: saved.encrypt_pii || 'true',
        ...saved,
      }));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => updatePlatformSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'settings'] });
      showToast(isRtl ? 'تم حفظ إعدادات الأمان بنجاح' : 'Security settings saved', 'success');
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
            <Shield size={20} className="text-emerald-600" />
            {isRtl ? 'إعدادات الأمان' : 'Security Settings'}
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
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'الحد الأدنى لطول كلمة المرور' : 'Password Min Length'}</label>
              <input type="number" value={formValues.password_min_length || ''} onChange={e => handleChange('password_min_length', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'صلاحية كلمة المرور (أيام)' : 'Password Expiry (days)'}</label>
              <input type="number" value={formValues.password_expiry_days || ''} onChange={e => handleChange('password_expiry_days', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'الحد الأقصى لمحاولات الدخول' : 'Max Login Attempts'}</label>
              <input type="number" value={formValues.login_max_attempts || ''} onChange={e => handleChange('login_max_attempts', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'مدة القفل (دقائق)' : 'Lockout Duration (min)'}</label>
              <input type="number" value={formValues.login_lockout_minutes || ''} onChange={e => handleChange('login_lockout_minutes', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'مهلة الجلسة (دقائق)' : 'Session Timeout (min)'}</label>
              <input type="number" value={formValues.session_timeout_minutes || ''} onChange={e => handleChange('session_timeout_minutes', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'تذكرني (أيام)' : 'Remember Me (days)'}</label>
              <input type="number" value={formValues.session_remember_me_days || ''} onChange={e => handleChange('session_remember_me_days', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
          </div>
        </div>
          {renderToggle('password_require_uppercase', isRtl ? 'يتطلب حرف كبير' : 'Require Uppercase', 'يتطلب حرف كبير إنجليزي في كلمة المرور')}
          {renderToggle('password_require_numbers', isRtl ? 'يتطلب أرقام' : 'Require Numbers', 'يتطلب أرقام في كلمة المرور')}
          {renderToggle('password_require_special', isRtl ? 'يتطلب رمز خاص' : 'Require Special Character', 'يتطلب رمز خاص في كلمة المرور')}
          {renderToggle('two_factor_enabled', isRtl ? 'تفعيل التحقق بخطوتين' : 'Enable Two-Factor Auth', 'يتطلب رمز تحقق إضافي عند تسجيل الدخول')}
          {renderToggle('encrypt_pii', isRtl ? 'تشفير المعلومات الشخصية' : 'Encrypt PII', 'تشفير البيانات الشخصية الحساسة في قاعدة البيانات')}

      </div>
    </div>
  );
}
