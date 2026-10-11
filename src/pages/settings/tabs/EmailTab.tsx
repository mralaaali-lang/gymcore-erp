import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { getSettings, updateSettings } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import Toggle from '../../../components/ui/Toggle';
import Button from '../../../components/ui/Button';
import PageLoader from '../../../components/shared/PageLoader';

const FIELDS = [
  { key: 'email_smtp_host', labelEn: 'SMTP Host', labelAr: 'خادم SMTP', type: 'text' },
  { key: 'email_smtp_port', labelEn: 'SMTP Port', labelAr: 'منفذ SMTP', type: 'number' },
  { key: 'email_smtp_user', labelEn: 'SMTP Username', labelAr: 'اسم مستخدم SMTP', type: 'text' },
  { key: 'email_smtp_pass', labelEn: 'SMTP Password', labelAr: 'كلمة مرور SMTP', type: 'password' },
  { key: 'email_from_address', labelEn: 'From Address', labelAr: 'عنوان المرسل', type: 'text' },
  { key: 'email_from_name', labelEn: 'From Name', labelAr: 'اسم المرسل', type: 'text' },
  { key: 'email_welcome_template', labelEn: 'Welcome Email', labelAr: 'بريد الترحيب', type: 'toggle' },
  { key: 'email_receipt_template', labelEn: 'Receipt Email', labelAr: 'بريد الإيصال', type: 'toggle' },
  { key: 'email_reminder_template', labelEn: 'Reminder Email', labelAr: 'بريد التذكير', type: 'toggle' },
];

export default function EmailTab() {
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
        <div key={f.key} className="bg-white border border-gray-100 rounded-3xl p-4 md:p-5 shadow-sm">
          <label className="block text-sm font-medium text-gray-900 mb-2">{rtl ? f.labelAr : f.labelEn}</label>
          {f.type === 'toggle' ? (
            <Toggle checked={s[f.key] === 'true'} onChange={(v) => set(f.key, v ? 'true' : 'false')} />
          ) : (
            <input type={f.type} value={s[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} className="w-full max-w-md px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" dir="ltr" />
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
