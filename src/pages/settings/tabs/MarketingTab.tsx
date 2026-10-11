import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { getSettings, updateSettings } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import Toggle from '../../../components/ui/Toggle';
import Button from '../../../components/ui/Button';
import PageLoader from '../../../components/shared/PageLoader';

const FIELDS = [
  { key: 'marketing_offers_enabled', labelEn: 'Enable Offers & Promotions', labelAr: 'تفعيل العروض والخصومات', type: 'toggle' },
  { key: 'marketing_referral_enabled', labelEn: 'Enable Referral Program', labelAr: 'تفعيل برنامج الإحالة', type: 'toggle' },
  { key: 'marketing_referral_points', labelEn: 'Referral Reward Points', labelAr: 'نقاط مكافأة الإحالة', type: 'number' },
  { key: 'marketing_auto_campaign', labelEn: 'Auto Birthday Campaign', labelAr: 'حملة أعياد الميلاد التلقائية', type: 'toggle' },
  { key: 'marketing_email_offers', labelEn: 'Send Offers via Email', labelAr: 'إرسال العروض عبر البريد', type: 'toggle' },
  { key: 'marketing_sms_offers', labelEn: 'Send Offers via SMS', labelAr: 'إرسال العروض عبر الرسائل', type: 'toggle' },
];

export default function MarketingTab() {
  const { language } = useApp();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const rtl = language === 'ar';
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); showToast(rtl ? 'تم الحفظ' : 'Saved', 'success'); },
    onError: () => showToast(rtl ? 'فشل الحفظ' : 'Save failed', 'error'),
  });
  const s = data?.data || {};

  const set = (k: string, v: string) => qc.setQueryData(['settings'], (old: any) => ({ data: { ...old?.data, [k]: v } }));
  const save = () => { const p: Record<string, string> = {}; for (const f of FIELDS) p[f.key] = s[f.key] || ''; mutation.mutate(p); };

  if (isLoading) return <PageLoader variant="skeleton" rows={4} />;

  return (
    <div className="space-y-4 max-w-2xl">
      {FIELDS.map((f) => (
        <div key={f.key} className="bg-white border border-gray-100 rounded-3xl p-4 md:p-5 shadow-sm flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">{rtl ? f.labelAr : f.labelEn}</span>
          {f.type === 'toggle' ? (
            <Toggle checked={s[f.key] === 'true'} onChange={(v) => set(f.key, v ? 'true' : 'false')} />
          ) : (
            <input type="number" value={s[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} className="w-24 px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
          )}
        </div>
      ))}
      <div className="flex justify-end pt-4">
        <Button variant="primary" onClick={save} disabled={mutation.isPending}>
          <span className="material-symbols-outlined text-lg">{mutation.isPending ? 'sync' : 'save'}</span>
          {rtl ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
