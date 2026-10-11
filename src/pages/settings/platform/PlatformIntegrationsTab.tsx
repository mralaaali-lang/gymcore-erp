// â”€â”€ PlatformIntegrationsTab â”€â”€

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { getPlatformSettings, updatePlatformSettings } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import { FloppyDisk, Link } from '@phosphor-icons/react';

export default function PlatformIntegrationsTab() {
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
        max_webhooks_per_gym: saved.max_webhooks_per_gym || '10',
        default_payment_gateway: saved.default_payment_gateway || 'stripe',
        export_formats: saved.export_formats || 'csv',
        enable_rest_api: saved.enable_rest_api || 'true',
        allow_webhooks: saved.allow_webhooks || 'true',
        enable_payment_gateway: saved.enable_payment_gateway || 'true',
        enable_sms_gateway: saved.enable_sms_gateway || 'false',
        enable_export: saved.enable_export || 'true',
        ...saved,
      }));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => updatePlatformSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'settings'] });
      showToast(isRtl ? 'تم حفظ إعدادات التكامل بنجاح' : 'Integration settings saved', 'success');
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
            <Link size={20} className="text-emerald-600" />
            {isRtl ? 'إعدادات التكامل' : 'Integration Settings'}
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
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'الحد الأقصى للويبهوك لكل صالة' : 'Max Webhooks Per Gym'}</label>
              <input type="number" value={formValues.max_webhooks_per_gym || ''} onChange={e => handleChange('max_webhooks_per_gym', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'بوابة الدفع الافتراضية' : 'Default Payment Gateway'}</label>
              <select value={formValues.default_payment_gateway || 'stripe'} onChange={e => handleChange('default_payment_gateway', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
                <option value="paymob">Paymob</option>
                <option value="fawry">Fawry</option>
                <option value="myfatoorah">MyFatoorah</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'صيغ التصدير' : 'Export Formats'}</label>
              <select value={formValues.export_formats || 'csv'} onChange={e => handleChange('export_formats', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (XLSX)</option>
                <option value="json">JSON</option>
                <option value="csv_xlsx">CSV & Excel</option>
                <option value="all">All Formats</option>
              </select>
            </div>
          </div>
        </div>
          {renderToggle('enable_rest_api', isRtl ? 'تفعيل REST API' : 'Enable REST API')}
          {renderToggle('allow_webhooks', isRtl ? 'السماح بالويبهوك' : 'Allow Webhooks')}
          {renderToggle('enable_payment_gateway', isRtl ? 'تفعيل بوابة الدفع' : 'Enable Payment Gateway')}
          {renderToggle('enable_sms_gateway', isRtl ? 'تفعيل بوابة SMS' : 'Enable SMS Gateway')}
          {renderToggle('enable_export', isRtl ? 'تفعيل تصدير البيانات' : 'Enable Data Export')}

      </div>
    </div>
  );
}
