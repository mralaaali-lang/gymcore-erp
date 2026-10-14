import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, FileText, Pencil } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import {
  createContract,
  updateContract,
  type BillingPlan,
  type PlatformContract,
  type PlatformGym,
  type ContractCycle,
} from '../../../services/api';
import { apiError, fmtMoney, todayIso, FIELD_CLASS, LABEL_CLASS, BTN_PRIMARY, BTN_SECONDARY } from './contractsUtils';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
              {mode === 'create' ? <FileText size={20} className="text-emerald-600" /> : <Pencil size={20} className="text-emerald-600" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {mode === 'create' ? t('Sign Platform Contract', 'إبرام عقد منصة') : t('Edit Contract', 'تعديل العقد')}
              </h2>
              <p className="text-xs text-gray-400">
                {mode === 'create'
                  ? t('One active contract per gym — price snapshot at signing', 'عقد سارٍ واحد لكل صالة — السعر يُلتقط لحظة الإبرام')
                  : t(`${contract?.gym_name} — ${contract?.subdomain}`, `${contract?.gym_name} — ${contract?.subdomain}`)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors" aria-label="close">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
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
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(isRtl ? p.name_ar : p.name) || p.name} — {fmtMoney(p.price_monthly, currency)}/{t('mo', 'شهر')}
                  </option>
                ))}
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

        <div className="flex items-center justify-end gap-2 p-6 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-3xl">
          <button onClick={onClose} className={BTN_SECONDARY}>{t('Cancel', 'إلغاء')}</button>
          <button onClick={() => { setFormError(null); mut.mutate(); }} disabled={!canSubmit || mut.isPending} className={BTN_PRIMARY}>
            {mut.isPending
              ? t('Saving...', 'جارٍ الحفظ...')
              : mode === 'create' ? t('Sign contract', 'إبرام العقد') : t('Save changes', 'حفظ التعديلات')}
          </button>
        </div>
      </div>
    </div>
  );
}
