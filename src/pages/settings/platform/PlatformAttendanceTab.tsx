// â”€â”€ PlatformAttendanceTab â”€â”€

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { getPlatformSettings, updatePlatformSettings } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import { FloppyDisk, QrCode } from '@phosphor-icons/react';

export default function PlatformAttendanceTab() {
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
        attendance_method: saved.attendance_method || 'qr',
        allow_qr_attendance: saved.allow_qr_attendance || 'true',
        allow_pin_attendance: saved.allow_pin_attendance || 'true',
        allow_biometric_attendance: saved.allow_biometric_attendance || 'false',
        allow_manual_attendance: saved.allow_manual_attendance || 'false',
        attendance_reminder_enabled: saved.attendance_reminder_enabled || 'true',
        auto_checkout_enabled: saved.auto_checkout_enabled || 'false',
        track_geolocation: saved.track_geolocation || 'false',
        ...saved,
      }));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => updatePlatformSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'settings'] });
      showToast(isRtl ? 'تم حفظ إعدادات الحضور بنجاح' : 'Attendance settings saved', 'success');
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
            <QrCode size={20} className="text-emerald-600" />
            {isRtl ? 'إعدادات الحضور' : 'Attendance Settings'}
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
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'طريقة تسجيل الحضور' : 'Attendance Method'}</label>
              <select value={formValues.attendance_method || 'qr'} onChange={e => handleChange('attendance_method', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                <option value="qr">QR Code</option>
                <option value="pin">PIN Code</option>
                <option value="biometric">Biometric</option>
                <option value="manual">Manual</option>
                <option value="all">All Methods</option>
              </select>
            </div>
          </div>
        </div>
          {renderToggle('allow_qr_attendance', isRtl ? 'السماح بتسجيل الحضور بـ QR' : 'Allow QR Attendance')}
          {renderToggle('allow_pin_attendance', isRtl ? 'السماح بتسجيل الحضور بـ PIN' : 'Allow PIN Attendance')}
          {renderToggle('allow_biometric_attendance', isRtl ? 'السماح بتسجيل الحضور بالبصمة' : 'Allow Biometric Attendance')}
          {renderToggle('allow_manual_attendance', isRtl ? 'السماح بتسجيل الحضور يدوياً' : 'Allow Manual Attendance')}
          {renderToggle('attendance_reminder_enabled', isRtl ? 'تفعيل تذكير الحضور' : 'Attendance Reminder')}
          {renderToggle('auto_checkout_enabled', isRtl ? 'تفعيل إنهاء الدوام تلقائياً' : 'Auto Checkout')}
          {renderToggle('track_geolocation', isRtl ? 'تتبع الموقع الجغرافي' : 'Track Geolocation')}

      </div>
    </div>
  );
}
