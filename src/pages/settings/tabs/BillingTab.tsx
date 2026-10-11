import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { getSettings, updateSettings } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import Toggle from '../../../components/ui/Toggle';
import Button from '../../../components/ui/Button';
import PageLoader from '../../../components/shared/PageLoader';

const FIELDS = [
  { key: 'billing_tax_rate', labelEn: 'Tax Rate (%)', labelAr: 'نسبة الضريبة (%)', type: 'number' },
  { key: 'billing_currency', labelEn: 'Currency', labelAr: 'العملة', type: 'text' },
  { key: 'billing_invoice_prefix', labelEn: 'Invoice Prefix', labelAr: 'بادئة الفاتورة', type: 'text' },
  { key: 'billing_auto_invoice', labelEn: 'Auto-generate Invoices', labelAr: 'إنشاء الفواتير تلقائياً', type: 'toggle' },
  { key: 'billing_due_days', labelEn: 'Payment Due (days)', labelAr: 'استحقاق الدفع (أيام)', type: 'number' },
  { key: 'billing_late_fee_percent', labelEn: 'Late Fee (%)', labelAr: 'رسوم التأخير (%)', type: 'number' },
];

export default function BillingTab() {
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
            <input type={f.type} value={s[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} className="w-28 px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" dir="ltr" />
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
