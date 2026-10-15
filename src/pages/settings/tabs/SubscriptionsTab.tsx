import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { getSettings, updateSettings } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import Toggle from '../../../components/ui/Toggle';
import Button from '../../../components/ui/Button';
import PageLoader from '../../../components/shared/PageLoader';

// تبويب الاشتراكات: 3 كروت سياسات — كل حقل يُستهلك فعليًا:
// التجميد (الحد + التمديد) في مسار التجميد، السماح في تسجيل الحضور،
// وسعر الزائر هو نفس مفتاح سعر الحصة السريعة (مصدر واحد).
export default function SubscriptionsTab() {
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

  const save = () => mutation.mutate({
    member_freeze_days_max: s.member_freeze_days_max ?? '30',
    freeze_extend_end: s.freeze_extend_end ?? 'true',
    sub_grace_days: s.sub_grace_days ?? '0',
    allow_no_sub: s.allow_no_sub ?? 'false',
    quick_session_price: s.quick_session_price ?? '50',
  });

  if (isLoading) return <PageLoader variant="skeleton" rows={4} />;

  const numCls = 'w-24 px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500';

  return (
    <div className="space-y-4">
      {/* سياسة التجميد */}
      <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
        <h3 className="font-bold text-gray-900 mb-3">{rtl ? 'سياسة التجميد' : 'Freeze policy'}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700">{rtl ? 'أقصى أيام التجميد' : 'Max freeze days'}</span>
            <input type="number" min={0} max={365} value={s.member_freeze_days_max ?? '30'} onChange={(e) => set('member_freeze_days_max', e.target.value)} className={numCls} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700">{rtl ? 'التجميد يمدد تاريخ الانتهاء' : 'Freeze extends end date'}</span>
            <Toggle checked={(s.freeze_extend_end ?? 'true') === 'true'} onChange={(v) => set('freeze_extend_end', v ? 'true' : 'false')} />
          </div>
        </div>
      </div>

      {/* فترة السماح */}
      <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
        <h3 className="font-bold text-gray-900 mb-3">{rtl ? 'فترة السماح' : 'Grace period'}</h3>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-700">{rtl ? 'أيام الحضور بعد انتهاء الاشتراك (0 = منع فوري)' : 'Days allowed after expiry (0 = instant block)'}</span>
          <input type="number" min={0} max={90} value={s.sub_grace_days ?? '0'} onChange={(e) => set('sub_grace_days', e.target.value)} className={numCls} />
        </div>
      </div>

      {/* الحضور بدون اشتراك */}
      <div className="bg-gray-50 border border-gray-100 rounded-3xl p-4 md:p-5">
        <h3 className="font-bold text-gray-900 mb-3">{rtl ? 'الحضور بدون اشتراك' : 'Entry without subscription'}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700">{rtl ? 'السماح بالدخول بلا اشتراك سارٍ' : 'Allow entry without an active subscription'}</span>
            <Toggle checked={(s.allow_no_sub ?? 'false') === 'true'} onChange={(v) => set('allow_no_sub', v ? 'true' : 'false')} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700">{rtl ? 'سعر حصة الزائر الافتراضي' : 'Default visitor session price'}</span>
            <input type="number" min={0} value={s.quick_session_price ?? '50'} onChange={(e) => set('quick_session_price', e.target.value)} className={numCls} />
          </div>
        </div>
      </div>

      <div className="flex justify-start pt-1">
        <Button variant="primary" onClick={save} disabled={mutation.isPending} className="!bg-orange-500 hover:!bg-orange-600">
          <span className="material-symbols-outlined text-lg">{mutation.isPending ? 'sync' : 'save'}</span>
          {rtl ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
