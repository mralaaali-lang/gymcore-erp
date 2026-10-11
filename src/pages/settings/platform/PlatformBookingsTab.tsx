// â”€â”€ PlatformBookingsTab â”€â”€

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { getPlatformSettings, updatePlatformSettings } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import { FloppyDisk, Calendar } from '@phosphor-icons/react';

export default function PlatformBookingsTab() {
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
        max_bookings_per_day: saved.max_bookings_per_day || '100',
        cancellation_deadline_hours: saved.cancellation_deadline_hours || '24',
        max_future_bookings_days: saved.max_future_bookings_days || '30',
        allow_cancellation: saved.allow_cancellation || 'true',
        allow_walkin_bookings: saved.allow_walkin_bookings || 'true',
        require_advance_booking: saved.require_advance_booking || 'false',
        booking_confirmation_required: saved.booking_confirmation_required || 'true',
        ...saved,
      }));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => updatePlatformSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'settings'] });
      showToast(isRtl ? 'تم حفظ إعدادات الحجوزات بنجاح' : 'Booking settings saved', 'success');
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
            <Calendar size={20} className="text-emerald-600" />
            {isRtl ? 'إعدادات الحجوزات' : 'Booking Settings'}
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
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'الحد الأقصى للحجوزات اليومية' : 'Max Bookings Per Day'}</label>
              <input type="number" value={formValues.max_bookings_per_day || ''} onChange={e => handleChange('max_bookings_per_day', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'مهلة الإلغاء (ساعات)' : 'Cancellation Deadline (hours)'}</label>
              <input type="number" value={formValues.cancellation_deadline_hours || ''} onChange={e => handleChange('cancellation_deadline_hours', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'الحد الأقصى للحجوزات المستقبلية (أيام)' : 'Max Future Bookings (days)'}</label>
              <input type="number" value={formValues.max_future_bookings_days || ''} onChange={e => handleChange('max_future_bookings_days', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
          </div>
        </div>
          {renderToggle('allow_cancellation', isRtl ? 'السماح بالإلغاء' : 'Allow Cancellation')}
          {renderToggle('allow_walkin_bookings', isRtl ? 'السماح بالحجوزات الفورية' : 'Allow Walk-in Bookings')}
          {renderToggle('require_advance_booking', isRtl ? 'يتطلب حجز مسبق' : 'Require Advance Booking')}
          {renderToggle('booking_confirmation_required', isRtl ? 'يتطلب تأكيد الحجز' : 'Booking Confirmation Required')}

      </div>
    </div>
  );
}
