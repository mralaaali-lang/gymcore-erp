import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { getSettings, updateSettings } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import Toggle from '../../../components/ui/Toggle';
import Button from '../../../components/ui/Button';
import PageLoader from '../../../components/shared/PageLoader';

// تبويب الإشعارات: كل سطر (وصف يمين + رقم في النص + toggle شمال) يُستهلك:
// تذكير الديون يظهر/يخفي زرار الواتساب في الديون، عتبة الانتهاء للمركز
// والشارة، المخزون لأقسامهما، وعتبة الغياب افتراضية صفحة الغائبين.
// الغياب عن المفتاح = مفعّل (سلوك اليوم محفوظ).
export default function NotificationsTab() {
  const { language } = useApp();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const rtl = language === 'ar';
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['nav', 'badges'] });
      showToast(rtl ? 'تم الحفظ' : 'Saved', 'success');
    },
    onError: () => showToast(rtl ? 'فشل الحفظ' : 'Save failed', 'error'),
  });
  const s = data?.data || {};
  const set = (k: string, v: string) => qc.setQueryData(['settings'], (old: any) => ({ data: { ...old?.data, [k]: v } }));
  const on = (k: string, fallback = true) => (s[k] ?? (fallback ? 'true' : 'false')) === 'true';

  const save = () => mutation.mutate({
    notify_debt_whatsapp: s.notify_debt_whatsapp ?? 'true',
    alert_expiring_days: s.alert_expiring_days ?? '7',
    notify_expiring: s.notify_expiring ?? 'true',
    notify_low_stock: s.notify_low_stock ?? 'true',
    absent_after_days: s.absent_after_days ?? '15',
    notify_absence: s.notify_absence ?? 'true',
  });

  if (isLoading) return <PageLoader variant="skeleton" rows={4} />;

  const numCls = 'w-20 px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500';

  const rows: {
    key: string;
    labelAr: string;
    labelEn: string;
    numKey?: string;
    numDefault?: string;
  }[] = [
    { key: 'notify_debt_whatsapp', labelAr: 'تذكير واتساب بالديون', labelEn: 'WhatsApp debt reminders' },
    { key: 'notify_expiring', labelAr: 'تنبيه انتهاء الاشتراك قبل', labelEn: 'Expiry alert before', numKey: 'alert_expiring_days', numDefault: '7' },
    { key: 'notify_low_stock', labelAr: 'تنبيه المخزون عند الحد', labelEn: 'Low-stock alert', },
    { key: 'notify_absence', labelAr: 'تنبيه الغياب بعد', labelEn: 'Absence alert after', numKey: 'absent_after_days', numDefault: '15' },
  ];

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} className="bg-gray-50 border border-gray-100 rounded-3xl p-4 flex items-center gap-3">
          <span className="flex-1 text-sm font-medium text-gray-900">
            {rtl ? r.labelAr : r.labelEn}
            {r.numKey && (
              <span className="text-gray-400 font-normal">
                {rtl ? ' — نفس عتبة التقارير' : ' — same as reports'}
              </span>
            )}
          </span>
          {r.numKey && (
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={r.numKey === 'absent_after_days' ? 1 : 1}
                value={s[r.numKey] ?? r.numDefault}
                onChange={(e) => set(r.numKey!, e.target.value)}
                className={numCls}
              />
              <span className="text-xs text-gray-400">{rtl ? 'أيام' : 'days'}</span>
            </span>
          )}
          <Toggle checked={on(r.key)} onChange={(v) => set(r.key, v ? 'true' : 'false')} />
        </div>
      ))}
      <p className="text-xs text-gray-400">
        {rtl
          ? 'عتبة الغياب هي نفس افتراضية صفحة الغائبين، وعتبة الانتهاء نفسها في مركز الإنذار.'
          : 'Absence threshold defaults the absentees page; expiry threshold feeds the alerts center.'}
      </p>
      <div className="flex justify-start pt-1">
        <Button variant="primary" onClick={save} disabled={mutation.isPending} className="!bg-orange-500 hover:!bg-orange-600">
          <span className="material-symbols-outlined text-lg">{mutation.isPending ? 'sync' : 'save'}</span>
          {rtl ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
