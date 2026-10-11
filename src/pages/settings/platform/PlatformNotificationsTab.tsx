// â”€â”€ PlatformNotificationsTab â”€â”€

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { getPlatformSettings, updatePlatformSettings } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import { FloppyDisk, Bell } from '@phosphor-icons/react';

export default function PlatformNotificationsTab() {
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
        email_notifications_enabled: saved.email_notifications_enabled || 'true',
        sms_notifications_enabled: saved.sms_notifications_enabled || 'false',
        push_notifications_enabled: saved.push_notifications_enabled || 'true',
        notify_gym_created: saved.notify_gym_created || 'true',
        notify_gym_suspended: saved.notify_gym_suspended || 'true',
        notify_payment_received: saved.notify_payment_received || 'true',
        notify_low_storage: saved.notify_low_storage || 'false',
        daily_summary_enabled: saved.daily_summary_enabled || 'true',
        ...saved,
      }));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => updatePlatformSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'settings'] });
      showToast(isRtl ? 'تم حفظ إعدادات الإشعارات بنجاح' : 'Notification settings saved', 'success');
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
            <Bell size={20} className="text-emerald-600" />
            {isRtl ? 'إعدادات الإشعارات' : 'Notification Settings'}
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
          {renderToggle('email_notifications_enabled', isRtl ? 'تفعيل الإشعارات البريدية' : 'Email Notifications')}
          {renderToggle('sms_notifications_enabled', isRtl ? 'تفعيل إشعارات SMS' : 'SMS Notifications')}
          {renderToggle('push_notifications_enabled', isRtl ? 'تفعيل الإشعارات الفورية' : 'Push Notifications')}
          {renderToggle('notify_gym_created', isRtl ? 'إشعار عند إنشاء صالة جديدة' : 'Notify on Gym Created')}
          {renderToggle('notify_gym_suspended', isRtl ? 'إشعار عند تعليق صالة' : 'Notify on Gym Suspended')}
          {renderToggle('notify_payment_received', isRtl ? 'إشعار عند استلام دفعة' : 'Notify on Payment Received')}
          {renderToggle('notify_low_storage', isRtl ? 'إشعار عند انخفاض المساحة' : 'Notify on Low Storage')}
          {renderToggle('daily_summary_enabled', isRtl ? 'ملخص يومي' : 'Daily Summary', 'إرسال ملخص يومي عبر البريد الإلكتروني')}

      </div>
    </div>
  );
}
