import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../../context/ToastContext';
import Modal from '../../../components/shared/Modal';
import {
  createContract,
  updateContract,
  type BillingPlan,
  type PlatformContract,
  type PlatformGym,
  type ContractCycle,
} from '../../../services/api';
import { apiError, fmtMoney, cycleLabel, todayIso, FIELD_CLASS, LABEL_CLASS, BTN_PRIMARY, BTN_SECONDARY } from './contractsUtils';

// §40 — مودال إبرام/تعديل عقد منصة (وسطي، كل رقم من الكتالوج الحقيقي)

interface Props {
  mode: 'create' | 'edit';
  contract?: PlatformContract;
  gyms: PlatformGym[];
  plans: BillingPlan[];
  isRtl: boolean;
  t: (en: string, ar: string) => string;
  onClose: () => void;
}

export default function ContractFormModal({ mode, contract, gyms, plans, isRtl, t, onClose }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // الصالات المؤهلة للإبرام: بلا عقد سارٍ (قيد uq_contracts_one_active_per_gym)
  const eligibleGyms = gyms.filter((g) => !g.contract_id);

  const [gymId, setGymId] = useState(contract?.gym_id ?? '');
  const [planId, setPlanId] = useState(contract?.plan_id ?? plans[0]?.id ?? '');
  const [cycle, setCycle] = useState<ContractCycle>(contract?.cycle ?? 'monthly');
  const initialPrice =
    contract?.price ??
    String(plans[0]?.[cycle === 'yearly' ? 'price_yearly' : 'price_monthly'] ?? '');
  const [price, setPrice] = useState<string>(initialPrice != null ? String(initialPrice) : '');
  const [priceTouched, setPriceTouched] = useState(mode === 'edit');
  const [currency, setCurrency] = useState(contract?.currency ?? gyms.find((g) => g.id === gymId)?.currency ?? 'EGP');
  const [autoRenew, setAutoRenew] = useState<boolean>(contract?.auto_renew ?? true);
  const [startDate, setStartDate] = useState<string>(contract?.start_date ?? todayIso());
  const [renewalDate, setRenewalDate] = useState<string>(contract?.renewal_date ?? '');
  const [notes, setNotes] = useState<string>(contract?.notes ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const selectedPlan = plans.find((p) => p.id === planId);
  const catalogPrice = selectedPlan ? Number(selectedPlan[cycle === 'yearly' ? 'price_yearly' : 'price_monthly']) : null;

  const applyPlanDefaults = (nextPlanId: string, nextCycle: ContractCycle) => {
    const p = plans.find((x) => x.id === nextPlanId);
    if (p && !priceTouched) {
      setPrice(String(p[nextCycle === 'yearly' ? 'price_yearly' : 'price_monthly']));
    }
  };

  const onGymChange = (id: string) => {
    setGymId(id);
    const g = gyms.find((x) => x.id === id);
    if (g?.currency) setCurrency(g.currency);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['platform', 'contracts'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'gyms'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
    if (contract) queryClient.invalidateQueries({ queryKey: ['platform', 'contract', contract.id] });
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return createContract({
          gym_id: gymId,
          plan_id: planId,
          cycle,
          price: price !== '' ? Number(price) : undefined,
          currency: currency || undefined,
          auto_renew: autoRenew,
          start_date: startDate || undefined,
          notes: notes.trim() || undefined,
        });
      }
      return updateContract(contract!.id, {
        price: price !== '' ? Number(price) : undefined,
        cycle,
        auto_renew: autoRenew,
        ...(renewalDate ? { renewal_date: renewalDate } : {}),
        notes: notes.trim(),
      });
    },
    onSuccess: () => {
      invalidate();
      showToast(
        mode === 'create'
          ? t('Contract signed successfully', 'تم إبرام العقد بنجاح')
          : t('Contract updated', 'تم تحديث العقد'),
        'success',
      );
      onClose();
    },
    onError: (e) => setFormError(apiError(e)),
  });

  const canSubmit =
    mode === 'create'
      ? !!gymId && !!planId && price !== '' && Number(price) >= 0
      : price !== '' && Number(price) >= 0;

  // موجة 3 / دفعة 4: نفس العرض (max-w-2xl = size="xl") ونفس الحقل ونفس منطق
  // الحفظ — الطبقة الثابتة والـscrim وزرار X والهيدر بقوا شغل القشرة، والقفل
  // محبوس وقت الـmutation. الأيقونة الزخرفية في الهيدر مش جزء من عقد `Modal`.
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      dir={isRtl ? 'rtl' : 'ltr'}
      disableDismiss={mut.isPending}
      title={mode === 'create' ? t('Sign Platform Contract', 'إبرام عقد منصة') : t('Edit Contract', 'تعديل العقد')}
      description={mode === 'create'
        ? t('One active contract per gym — price snapshot at signing', 'عقد سارٍ واحد لكل صالة — السعر يُلتقط لحظة الإبرام')
        : `${contract?.gym_name} — ${contract?.subdomain}`}
      footer={
        <>
          <button onClick={onClose} className={BTN_SECONDARY}>{t('Cancel', 'إلغاء')}</button>
          <button onClick={() => { setFormError(null); mut.mutate(); }} disabled={!canSubmit || mut.isPending} className={BTN_PRIMARY}>
            {mut.isPending
              ? t('Saving...', 'جارٍ الحفظ...')
              : mode === 'create' ? t('Sign contract', 'إبرام العقد') : t('Save changes', 'حفظ التعديلات')}
          </button>
        </>
      }
    >
        <div className="space-y-4">
          {mode === 'create' && (
            <div>
              <label className={LABEL_CLASS}>{t('Gym', 'الصالة')}</label>
              <select value={gymId} onChange={(e) => onGymChange(e.target.value)} className={FIELD_CLASS}>
                <option value="">{t('Select a gym without an active contract...', 'اختر صالة بلا عقد سارٍ...')}</option>
                {eligibleGyms.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} — {g.subdomain}</option>
                ))}
              </select>
              {eligibleGyms.length === 0 && (
                <p className="text-xs text-amber-600 mt-1.5">{t('All gyms already have active contracts', 'كل الصالات لديها عقود سارية بالفعل')}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>{t('Plan', 'الباقة')}</label>
              <select
                value={planId}
                disabled={mode === 'edit'}
                onChange={(e) => { setPlanId(e.target.value); applyPlanDefaults(e.target.value, cycle); }}
                className={`${FIELD_CLASS} disabled:opacity-60`}
              >
                {mode === 'edit' && contract && !plans.some((p) => p.id === contract.plan_id) ? (
                  // الباقات القديمة صارت خارج الكتالوج النشط: العقد لا يظهر بباقة
                  // مجهولة، بل باسمها المخزّن مع صراحة أنها مؤرشفة.
                  <option value={contract.plan_id}>
                    {(isRtl ? contract.plan_name_ar : contract.plan_name) || contract.plan_name} — {t('archived plan', 'باقة مؤرشفة')}
                  </option>
                ) : null}
                {plans.map((p) => {
                  // §46: السعر المعروض هو المحمَّل في الدورة المختارة، والسعر
                  // الكامل يُذكر صراحة وهو الخصم سارٍ (select لا يقبل شطبًا).
                  const charged = cycle === 'yearly' ? p.price_yearly : p.price_monthly;
                  const full = cycle === 'yearly' ? p.list_price_yearly : p.list_price_monthly;
                  const struck = p.discount_active && full != null && Number(full) > Number(charged);
                  return (
                    <option key={p.id} value={p.id}>
                      {(isRtl ? p.name_ar : p.name) || p.name} — {fmtMoney(charged, currency)}/{cycleLabel(cycle, isRtl)}
                      {struck ? ` (${t('instead of', 'بدلاً من')} ${fmtMoney(full, currency)})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Billing cycle', 'دورة المحاسبة')}</label>
              <select
                value={cycle}
                onChange={(e) => { const c = e.target.value as ContractCycle; setCycle(c); applyPlanDefaults(planId, c); }}
                className={FIELD_CLASS}
              >
                <option value="monthly">{t('Monthly', 'شهري')}</option>
                <option value="yearly">{t('Yearly', 'سنوي')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>{t('Contract price', 'سعر العقد')}</label>
              <input
                type="number" min={0} step="0.01" value={price}
                onChange={(e) => { setPrice(e.target.value); setPriceTouched(true); }}
                className={FIELD_CLASS} dir="ltr"
              />
              {catalogPrice !== null && Number(price) !== catalogPrice && (
                <p className="text-xs text-gray-400 mt-1">
                  {t(`Catalog price: ${fmtMoney(catalogPrice, currency)}`, `سعر الكتالوج: ${fmtMoney(catalogPrice, currency)}`)}
                </p>
              )}
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Currency', 'العملة')}</label>
              <input
                type="text" maxLength={10} value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className={FIELD_CLASS} dir="ltr" disabled={mode === 'edit'}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {mode === 'create' ? (
              <div>
                <label className={LABEL_CLASS}>{t('Start date', 'تاريخ البداية')}</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={FIELD_CLASS} dir="ltr" />
              </div>
            ) : (
              <div>
                <label className={LABEL_CLASS}>{t('Renewal date (YYYY-MM-DD)', 'تاريخ التجديد (YYYY-MM-DD)')}</label>
                <input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} className={FIELD_CLASS} dir="ltr" />
              </div>
            )}
            <label className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100 self-end">
              <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
              <span className="text-sm text-gray-700">{t('Auto-renew on due date', 'تجديد تلقائي عند الاستحقاق')}</span>
            </label>
          </div>

          <div>
            <label className={LABEL_CLASS}>{t('Notes', 'ملاحظات')}</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={FIELD_CLASS} placeholder={t('Optional contract notes', 'ملاحظات اختيارية على العقد')} />
          </div>

          {formError && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600">{formError}</div>
          )}
        </div>
    </Modal>
  );
}
