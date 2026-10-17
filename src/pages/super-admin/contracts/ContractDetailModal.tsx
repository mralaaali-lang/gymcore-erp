import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowsClockwise as RefreshCw, Receipt, Prohibit as Ban, Pencil, Plus, CheckCircle as CheckCircle2 } from '@phosphor-icons/react';
import { useToast } from '../../../context/ToastContext';
import Modal from '../../../components/shared/Modal';
import { useApiQuery } from '../../../hooks/useApiQuery';
import {
  getContractFull,
  renewContract,
  issueContractInvoice,
  cancelContract,
  addContractItem,
  cancelContractItem,
  markInvoicePaid,
  listAddons,
  type PlatformContract,
  type ContractCycle,
} from '../../../services/api';
import { formatDate, formatDateTime } from '../../../utils/date';
import {
  apiError, fmtMoney, cycleLabel, CONTRACT_STATUS_CLASS, INVOICE_STATUS_CLASS,
  invoiceStatusLabel, todayIso, FIELD_CLASS, LABEL_CLASS,
  BTN_PRIMARY, BTN_SECONDARY, BTN_DANGER,
} from './contractsUtils';

// §40 — مودال تفاصيل العقد: بنود حية + فواتير + تجديد/إصدار/إلغاء، كله من APIs حقيقية.

interface Props {
  contractId: string;
  isRtl: boolean;
  t: (en: string, ar: string) => string;
  onClose: () => void;
  onEdit: (contract: PlatformContract) => void;
}

export default function ContractDetailModal({ contractId, isRtl, t, onClose, onEdit }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useApiQuery(
    ['platform', 'contract', contractId],
    () => getContractFull(contractId),
    { staleTime: 15_000 },
  );
  const { data: addonsRes } = useApiQuery(['platform', 'addons', 'catalog'], listAddons, { staleTime: 60_000 });

  const [renewPeriods, setRenewPeriods] = useState('1');
  const [renewWithInvoice, setRenewWithInvoice] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // بند جديد
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemAddonId, setItemAddonId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCycle, setItemCycle] = useState<ContractCycle>('monthly');
  const [itemExpires, setItemExpires] = useState('');

  const contract = data?.data?.contract;
  const items = data?.data?.items ?? [];
  const invoices = data?.data?.invoices ?? [];
  const activeAddons = (addonsRes?.data ?? []).filter((a) => a.is_active);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['platform', 'contract', contractId] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'contracts'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'gyms'] });
  };

  const renewMut = useMutation({
    mutationFn: () => renewContract(contractId, Math.min(Math.max(parseInt(renewPeriods, 10) || 1, 1), 24), renewWithInvoice),
    onSuccess: (res) => {
      invalidate();
      const inv = 'contract' in (res.data as object) ? (res.data as { invoice?: { invoice_number: string } }).invoice : undefined;
      showToast(
        inv
          ? t(`Renewed — invoice ${inv.invoice_number} issued`, `تم التجديد وأُصدرت فاتورة ${inv.invoice_number}`)
          : t('Contract renewed', 'تم تجديد العقد'),
        'success',
      );
    },
    onError: (e) => { setActionError(apiError(e)); },
  });

  const issueMut = useMutation({
    mutationFn: () => issueContractInvoice(contractId),
    onSuccess: (res) => {
      invalidate();
      showToast(t(`Invoice ${res.data.invoice_number} issued`, `أُصدرت فاتورة ${res.data.invoice_number}`), 'success');
    },
    onError: (e) => { setActionError(apiError(e)); },
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelContract(contractId, cancelReason.trim() || undefined),
    onSuccess: () => {
      invalidate();
      showToast(t('Contract cancelled', 'تم إلغاء العقد'), 'success');
      onClose();
    },
    onError: (e) => { setActionError(apiError(e)); },
  });

  const addItemMut = useMutation({
    mutationFn: () => addContractItem(contractId, {
      addon_id: itemAddonId,
      quantity: Math.min(Math.max(parseInt(itemQty, 10) || 1, 1), 100),
      unit_price: itemPrice !== '' ? Number(itemPrice) : undefined,
      cycle: itemCycle,
      expires_at: itemExpires || undefined,
    }),
    onSuccess: () => {
      invalidate();
      setShowAddItem(false);
      setItemAddonId(''); setItemQty('1'); setItemPrice(''); setItemExpires('');
      showToast(t('Item added to contract', 'تمت إضافة البند للعقد'), 'success');
    },
    onError: (e) => { setActionError(apiError(e)); },
  });

  const cancelItemMut = useMutation({
    mutationFn: (itemId: string) => cancelContractItem(itemId),
    onSuccess: () => { invalidate(); showToast(t('Item cancelled', 'تم إلغاء البند'), 'success'); },
    onError: (e) => { setActionError(apiError(e)); },
  });

  const paidMut = useMutation({
    mutationFn: (invoiceId: string) => markInvoicePaid(invoiceId, { payment_method: 'manual' }),
    onSuccess: () => { invalidate(); showToast(t('Invoice marked as paid', 'تم تحصيل الفاتورة'), 'success'); },
    onError: (e) => { setActionError(apiError(e)); },
  });

  // موجة 3 / دفعة 4: نفس عرض اللوحة (max-w-4xl = size="xl" + className="max-w-4xl"
  // لأن `Modal` بيوحّد `max-w-*` بـtailwind-merge) ونفس القراءة ونفس الأكشنات السبعة.
  // الطبقة الثابتة والـscrim وزرار X والهيدر Sticky بقوا شغل القشرة، والارتفاع
  // من `max-h-[92vh]` لـ`calc(100dvh-2rem)` (قيمة القشرة). الحبس محبوس لأي
  // mutation من الستة الجايين.
  const anyPending =
    renewMut.isPending || issueMut.isPending || cancelMut.isPending ||
    addItemMut.isPending || cancelItemMut.isPending || paidMut.isPending;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      className="max-w-4xl"
      dir={isRtl ? 'rtl' : 'ltr'}
      disableDismiss={anyPending}
      title={contract ? `${contract.gym_name} — ${contract.plan_name}` : t('Contract details', 'تفاصيل العقد')}
      description={contract?.subdomain ? <span dir="ltr">{contract.subdomain}</span> : undefined}
    >
        {isLoading && <div className="p-10 text-center text-sm text-gray-400 animate-pulse">{t('Loading contract...', 'جارٍ تحميل العقد...')}</div>}
        {isError && <div className="p-10 text-center text-sm text-red-500">{t('Failed to load contract', 'فشل تحميل العقد')}</div>}

        {contract && (
          <div className="space-y-6">
            {/* ═══ ملخص العقد ═══ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { la: 'الحالة', en: 'Status', v: contract.status === 'active' ? t('Active', 'سارٍ') : t('Cancelled', 'ملغى'), cls: CONTRACT_STATUS_CLASS[contract.status] || 'bg-gray-100 text-gray-600' },
                { la: 'السعر', en: 'Price', v: fmtMoney(contract.price, contract.currency), cls: 'bg-emerald-50 text-emerald-700' },
                { la: 'التجديد', en: 'Renewal', v: contract.renewal_date ? formatDate(contract.renewal_date) : '—', cls: 'bg-sky-50 text-sky-700' },
                { la: 'بنود حية', en: 'Live items', v: `${items.filter((i) => i.status === 'active').length} · ${fmtMoney(contract.items_total, contract.currency)}`, cls: 'bg-violet-50 text-violet-700' },
              ].map((c) => (
                <div key={c.en} className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100">
                  <p className="text-[11px] text-gray-400 mb-1">{isRtl ? c.la : c.en}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold ${c.cls}`} dir="ltr">{c.v}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span>{t('Cycle', 'الدورة')}: <b>{cycleLabel(contract.cycle, isRtl)}</b></span>
              <span>{t('Started', 'البداية')}: <b dir="ltr">{formatDate(contract.start_date)}</b></span>
              <span>{t('Auto-renew', 'تجديد تلقائي')}: <b>{contract.auto_renew ? t('On', 'مفعّل') : t('Off', 'متوقف')}</b></span>
              <span>{t('Created by', 'أنشأه')}: <b dir="ltr">{contract.created_by_email || 'system'}</b></span>
              {contract.notes && <span className="w-full">{t('Notes', 'ملاحظات')}: {contract.notes}</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(contract.effective_features ?? []).map((f) => (
                <span key={f} className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold" dir="ltr">{f}</span>
              ))}
            </div>

            {actionError && <div className="p-3 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600">{actionError}</div>}

            {contract.status === 'active' && (
              <>
                {/* ═══ تجديد ═══ */}
                <div className="p-4 rounded-2xl border border-gray-100 bg-gray-50/60">
                  <p className="text-sm font-bold text-gray-900 mb-3">{t('Renew contract', 'تجديد العقد')}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="number" min={1} max={24} value={renewPeriods} onChange={(e) => setRenewPeriods(e.target.value)} className={`${FIELD_CLASS} w-24`} dir="ltr" />
                    <span className="text-xs text-gray-500">{contract.cycle === 'yearly' ? t('year(s)', 'سنة') : t('month(s)', 'شهر')}</span>
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input type="checkbox" checked={renewWithInvoice} onChange={(e) => setRenewWithInvoice(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                      {t('Issue invoice now', 'إصدار فاتورة الآن')}
                    </label>
                    <button onClick={() => { setActionError(null); renewMut.mutate(); }} disabled={renewMut.isPending} className={BTN_PRIMARY}>
                      <RefreshCw size={14} />{renewMut.isPending ? t('Renewing...', 'جارٍ التجديد...') : t('Renew', 'تجديد')}
                    </button>
                    <button onClick={() => { setActionError(null); issueMut.mutate(); }} disabled={issueMut.isPending} className={BTN_SECONDARY}>
                      <Receipt size={14} />{issueMut.isPending ? t('Issuing...', 'جارٍ الإصدار...') : t('Issue invoice', 'إصدار فاتورة')}
                    </button>
                    <button onClick={() => onEdit(contract)} className={BTN_SECONDARY}>
                      <Pencil size={14} />{t('Edit', 'تعديل')}
                    </button>
                    <button onClick={() => { setShowCancel((v) => !v); setActionError(null); }} className={`${BTN_DANGER} ${!showCancel ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' : ''}`}>
                      <Ban size={14} />{t('Cancel contract', 'إلغاء العقد')}
                    </button>
                  </div>
                  {showCancel && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={t('Cancellation reason (optional)', 'سبب الإلغاء (اختياري)')} className={`${FIELD_CLASS} flex-1 min-w-40`} />
                      <button onClick={() => { setActionError(null); cancelMut.mutate(); }} disabled={cancelMut.isPending} className={BTN_DANGER}>
                        {cancelMut.isPending ? t('Cancelling...', 'جارٍ الإلغاء...') : t('Confirm cancel', 'تأكيد الإلغاء')}
                      </button>
                    </div>
                  )}
                </div>

                {/* ═══ البنود ═══ */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-gray-900">{t('Contract items', 'بنود العقد')}</p>
                    <button onClick={() => { setShowAddItem((v) => !v); setActionError(null); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                      <Plus size={14} />{t('Add item from catalog', 'إضافة بند من الكتالوج')}
                    </button>
                  </div>
                  {showAddItem && (
                    <div className="p-4 mb-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                      <div className="col-span-2 sm:col-span-2">
                        <label className={LABEL_CLASS}>{t('Addon', 'الإضافة')}</label>
                        <select value={itemAddonId} onChange={(e) => {
                          setItemAddonId(e.target.value);
                          const a = activeAddons.find((x) => x.id === e.target.value);
                          if (a) setItemPrice(String(a[itemCycle === 'yearly' ? 'price_yearly' : 'price_monthly']));
                        }} className={FIELD_CLASS}>
                          <option value="">{t('Select...', 'اختر...')}</option>
                          {activeAddons.map((a) => (
                            <option key={a.id} value={a.id}>{(isRtl ? (a.name_ar || a.name) : a.name)} — {a.code}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>{t('Qty', 'الكمية')}</label>
                        <input type="number" min={1} max={100} value={itemQty} onChange={(e) => setItemQty(e.target.value)} className={FIELD_CLASS} dir="ltr" />
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>{t('Unit price', 'سعر الوحدة')}</label>
                        <input type="number" min={0} step="0.01" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} className={FIELD_CLASS} dir="ltr" />
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>{t('Cycle', 'الدورة')}</label>
                        <select value={itemCycle} onChange={(e) => {
                          setItemCycle(e.target.value as ContractCycle);
                          const a = activeAddons.find((x) => x.id === itemAddonId);
                          if (a) setItemPrice(String(a[e.target.value === 'yearly' ? 'price_yearly' : 'price_monthly']));
                        }} className={FIELD_CLASS}>
                          <option value="monthly">{t('Monthly', 'شهري')}</option>
                          <option value="yearly">{t('Yearly', 'سنوي')}</option>
                        </select>
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>{t('Expires (optional)', 'انتهاء (اختياري)')}</label>
                        <input type="date" min={todayIso()} value={itemExpires} onChange={(e) => setItemExpires(e.target.value)} className={FIELD_CLASS} dir="ltr" />
                      </div>
                      <button onClick={() => { setActionError(null); if (itemAddonId) addItemMut.mutate(); }} disabled={!itemAddonId || addItemMut.isPending} className={`${BTN_PRIMARY} col-span-2 sm:col-span-1`}>
                        {addItemMut.isPending ? t('Adding...', 'جارٍ الإضافة...') : t('Add', 'إضافة')}
                      </button>
                    </div>
                  )}
                  {items.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">{t('No items on this contract', 'لا توجد بنود على هذا العقد')}</p>
                  ) : (
                    <div className="rounded-2xl border border-gray-100 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100 text-gray-600">
                            <th className="text-right px-4 py-2.5 font-semibold">{t('Item', 'البند')}</th>
                            <th className="text-right px-4 py-2.5 font-semibold">{t('Qty × Price', 'الكمية × السعر')}</th>
                            <th className="text-right px-4 py-2.5 font-semibold">{t('Total', 'الإجمالي')}</th>
                            <th className="text-right px-4 py-2.5 font-semibold">{t('Cycle', 'الدورة')}</th>
                            <th className="text-right px-4 py-2.5 font-semibold">{t('Expires', 'الانتهاء')}</th>
                            <th className="text-right px-4 py-2.5 font-semibold">{t('Status', 'الحالة')}</th>
                            <th className="px-4 py-2.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => (
                            <tr key={it.id} className="border-b border-gray-50 last:border-0">
                              <td className="px-4 py-3">
                                <p className="font-semibold text-gray-900">{isRtl ? (it.name_ar || it.name) : it.name}</p>
                                <p className="text-[11px] text-gray-400" dir="ltr">{it.code}</p>
                              </td>
                              <td className="px-4 py-3 text-gray-600" dir="ltr">{it.quantity} × {fmtMoney(it.unit_price)}</td>
                              <td className="px-4 py-3 font-bold text-gray-900" dir="ltr">{fmtMoney(it.line_total, contract.currency)}</td>
                              <td className="px-4 py-3 text-gray-600">{cycleLabel(it.cycle, isRtl)}</td>
                              <td className="px-4 py-3 text-gray-600" dir="ltr">{it.expires_at ? formatDate(it.expires_at) : '—'}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${it.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                                  {it.status === 'active' ? t('Active', 'سارٍ') : t('Cancelled', 'ملغى')}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {it.status === 'active' && (
                                  <button onClick={() => { setActionError(null); cancelItemMut.mutate(it.id); }} disabled={cancelItemMut.isPending}
                                    className="p-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors" title={t('Cancel item', 'إلغاء البند')}>
                                    <Ban size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ═══ الفواتير ═══ */}
            <div>
              <p className="text-sm font-bold text-gray-900 mb-2">{t('Contract invoices', 'فواتير العقد')}</p>
              {invoices.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">{t('No invoices issued yet', 'لم تُصدر فواتير بعد')}</p>
              ) : (
                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-600">
                        <th className="text-right px-4 py-2.5 font-semibold">{t('Invoice', 'الفاتورة')}</th>
                        <th className="text-right px-4 py-2.5 font-semibold">{t('Period', 'الفترة')}</th>
                        <th className="text-right px-4 py-2.5 font-semibold">{t('Total', 'الإجمالي')}</th>
                        <th className="text-right px-4 py-2.5 font-semibold">{t('Due', 'الاستحقاق')}</th>
                        <th className="text-right px-4 py-2.5 font-semibold">{t('Status', 'الحالة')}</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-4 py-3 font-semibold text-gray-900" dir="ltr">{inv.invoice_number}</td>
                          <td className="px-4 py-3 text-xs text-gray-500" dir="ltr">{formatDate(inv.billing_period_start)} → {formatDate(inv.billing_period_end)}</td>
                          <td className="px-4 py-3 font-bold text-gray-900" dir="ltr">{fmtMoney(inv.total_amount, inv.currency)}</td>
                          <td className="px-4 py-3 text-gray-600" dir="ltr">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${INVOICE_STATUS_CLASS[inv.status] || 'bg-gray-100 text-gray-500'}`}>
                              {invoiceStatusLabel(inv.status, isRtl)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {(inv.status === 'pending' || inv.status === 'overdue') && (
                              <button onClick={() => { setActionError(null); paidMut.mutate(inv.id); }} disabled={paidMut.isPending}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 p-1.5" title={t('Mark as paid', 'تحصيل')}>
                                <CheckCircle2 size={14} />{t('Collect', 'تحصيل')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <span>{t('Last update', 'آخر تحديث')}: <span dir="ltr">{formatDateTime(contract.updated_at)}</span></span>
            </p>
          </div>
        )}
    </Modal>
  );
}
