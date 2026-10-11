// â”€â”€ PlatformMarketingTab â”€â”€

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { getPlatformSettings, updatePlatformSettings } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import { FloppyDisk, MegaphoneSimple } from '@phosphor-icons/react';

export default function PlatformMarketingTab() {
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
        referral_bonus_amount: saved.referral_bonus_amount || '50',
        points_per_currency_unit: saved.points_per_currency_unit || '10',
        referral_bonus_currency: saved.referral_bonus_currency || 'USD',
        allow_promotions: saved.allow_promotions || 'true',
        allow_email_campaigns: saved.allow_email_campaigns || 'true',
        allow_sms_campaigns: saved.allow_sms_campaigns || 'false',
        allow_referral_program: saved.allow_referral_program || 'true',
        loyalty_points_enabled: saved.loyalty_points_enabled || 'true',
        ...saved,
      }));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => updatePlatformSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'settings'] });
      showToast(isRtl ? 'تم حفظ إعدادات التسويق بنجاح' : 'Marketing settings saved', 'success');
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
            <MegaphoneSimple size={20} className="text-emerald-600" />
            {isRtl ? 'إعدادات التسويق' : 'Marketing Settings'}
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
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'قيمة مكافأة الإحالة' : 'Referral Bonus Amount'}</label>
              <input type="number" value={formValues.referral_bonus_amount || ''} onChange={e => handleChange('referral_bonus_amount', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'نقاط لكل وحدة عملة' : 'Points Per Currency Unit'}</label>
              <input type="number" value={formValues.points_per_currency_unit || ''} onChange={e => handleChange('points_per_currency_unit', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{isRtl ? 'عملة مكافأة الإحالة' : 'Referral Bonus Currency'}</label>
              <select value={formValues.referral_bonus_currency || 'USD'} onChange={e => handleChange('referral_bonus_currency', e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (â‚¬)</option>
                <option value="EGP">EGP (آ£)</option>
                <option value="SAR">SAR (ï·¼)</option>
                <option value="AED">AED (د.إ)</option>
              </select>
            </div>
          </div>
        </div>
          {renderToggle('allow_promotions', isRtl ? 'السماح بالعروض الترويجية' : 'Allow Promotions')}
          {renderToggle('allow_email_campaigns', isRtl ? 'السماح بالحملات البريدية' : 'Allow Email Campaigns')}
          {renderToggle('allow_sms_campaigns', isRtl ? 'السماح بحملات SMS' : 'Allow SMS Campaigns')}
          {renderToggle('allow_referral_program', isRtl ? 'تفعيل برنامج الإحالة' : 'Enable Referral Program')}
          {renderToggle('loyalty_points_enabled', isRtl ? 'تفعيل نقاط الولاء' : 'Enable Loyalty Points')}

      </div>
    </div>
  );
}
