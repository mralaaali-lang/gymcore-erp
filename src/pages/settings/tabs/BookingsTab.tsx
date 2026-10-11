import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { getSettings, updateSettings } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import Toggle from '../../../components/ui/Toggle';
import Button from '../../../components/ui/Button';
import PageLoader from '../../../components/shared/PageLoader';

const FIELDS = [
  { key: 'booking_max_per_day', labelEn: 'Max Bookings Per Day', labelAr: 'الحد الأقصى للحجوزات يومياً', type: 'number' },
  { key: 'booking_cancellation_hours', labelEn: 'Cancellation Deadline (hours)', labelAr: 'مهلة الإلغاء (ساعات)', type: 'number' },
  { key: 'booking_advance_days', labelEn: 'Book in Advance (days)', labelAr: 'الحجز المسبق (أيام)', type: 'number' },
  { key: 'booking_auto_confirm', labelEn: 'Auto-confirm Bookings', labelAr: 'تأكيد الحجوزات تلقائياً', type: 'toggle' },
  { key: 'booking_waitlist_enabled', labelEn: 'Enable Waitlist', labelAr: 'تفعيل قائمة الانتظار', type: 'toggle' },
  { key: 'booking_require_approval', labelEn: 'Require Manager Approval', labelAr: 'يتطلب موافقة المدير', type: 'toggle' },
];

export default function BookingsTab() {
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

  const handleChange = (k: string, v: string) => qc.setQueryData(['settings'], (old: any) => ({ data: { ...old?.data, [k]: v } }));
  const handleSave = () => { const p: Record<string, string> = {}; for (const f of FIELDS) p[f.key] = s[f.key] || ''; mutation.mutate(p); };

  if (isLoading) return <PageLoader variant="skeleton" rows={4} />;

  return (
    <div className="space-y-4 max-w-2xl">
      {FIELDS.map((f) => (
        <div key={f.key} className="bg-white border border-gray-100 rounded-3xl p-4 md:p-5 shadow-sm flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">{rtl ? f.labelAr : f.labelEn}</span>
          {f.type === 'toggle' ? (
            <Toggle checked={s[f.key] === 'true'} onChange={(v) => handleChange(f.key, v ? 'true' : 'false')} />
          ) : (
            <input type="number" value={s[f.key] || ''} onChange={(e) => handleChange(f.key, e.target.value)} className="w-24 px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
          )}
        </div>
      ))}
      <div className="flex justify-end pt-4">
        <Button variant="primary" onClick={handleSave} disabled={mutation.isPending}>
          <span className="material-symbols-outlined text-lg">{mutation.isPending ? 'sync' : 'save'}</span>
          {rtl ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
