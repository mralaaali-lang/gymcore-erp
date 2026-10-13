import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Pencil, Plus } from 'lucide-react';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney, currencySymbol } from '../../utils/currency';
import { fmtNum } from '../../utils/date';
import { useToast } from '../../context/ToastContext';
import {
  listOffersManage, createOffer, updateOffer, type MembershipOffer,
} from '../../services/api';
import { DashboardPage, PrimaryAction, Panel, EmptyState } from '../../components/dashboard';
import StatusBadge from '../../components/ui/StatusBadge';

/** Extract the server's own error text so the UI never hides a real rejection. */
function apiError(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { error?: string; details?: { field?: string; message: string }[] } } })?.response?.data;
  if (data?.details?.length) {
    const parts = data.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message));
    return `${data.error ?? 'Validation failed'} — ${parts.join(' · ')}`;
  }
  return data?.error || fallback;
}

/**
 * §33ب — الباقات والعروض: membership_offers is the single source of truth.
 * The old page read fields the API never sent (offer.name/duration/features)
 * and its toggle was an empty function. Now: real contract fields, real
 * POST/PUT, and a real active toggle. Offers referenced by subscriptions
 * are deactivated, never deleted (the server enforces this honestly).
 */

const inputCls =
  'w-full min-h-[48px] md:min-h-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-base md:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

function Modal({ title, rtl, onClose, children }: { title: string; rtl: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div dir={rtl ? 'rtl' : 'ltr'} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl">
        <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 touch-auto" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function OfferForm({ rtl, currency, offer, onClose }: {
  rtl: boolean; currency?: string | null; offer: MembershipOffer | null; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [title, setTitle] = useState(offer?.title ?? '');
  const [days, setDays] = useState(offer ? String(offer.duration_days) : '30');
  const [price, setPrice] = useState(offer ? String(offer.price) : '');
  const valid = title.trim().length > 0 && Number(days) >= 1 && Number(days) <= 3650 && price !== '' && Number(price) >= 0;

  const save = useMutation({
    mutationFn: () => {
      const body = { title: title.trim(), duration_days: Number(days), price: Number(price) };
      return offer ? updateOffer(offer.id, body) : createOffer(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership-offers'] });
      showToast(rtl ? 'تم حفظ الباقة' : 'Plan saved', 'success');
      onClose();
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل حفظ الباقة' : 'Failed to save plan'), 'error'),
  });

  return (
    <Modal title={offer ? (rtl ? 'تعديل الباقة' : 'Edit plan') : rtl ? 'إضافة باقة' : 'New plan'} rtl={rtl} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'اسم الباقة' : 'Plan name'}</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={rtl ? 'مثال: شهر واحد' : 'e.g. Monthly'} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'المدة (أيام)' : 'Duration (days)'}</label>
            <input className={inputCls} type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'السعر' : 'Price'} ({currencySymbol(currency)})</label>
            <input className={inputCls} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <button
          disabled={!valid || save.isPending}
          onClick={() => save.mutate()}
          className="w-full min-h-[48px] md:min-h-0 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-base md:text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {save.isPending ? (rtl ? 'جارٍ الحفظ…' : 'Saving…') : rtl ? 'حفظ' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

export default function SubscriptionManagement() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MembershipOffer | null | undefined>(undefined); // undefined = closed, null = new

  const { data, isLoading } = useApiQuery(
    ['membership-offers', 'manage'],
    async () => (await listOffersManage()).data,
    { staleTime: 30_000 }
  );
  const offers = data ?? [];

  const toggle = useMutation({
    mutationFn: (o: MembershipOffer) => updateOffer(o.id, { is_active: !o.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership-offers'] });
      showToast(rtl ? 'تم تحديث الحالة' : 'Status updated', 'success');
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل التحديث' : 'Update failed'), 'error'),
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        title={rtl ? 'الباقات والعروض' : 'Plans & Offers'}
        subtitle={rtl ? 'مصدر واحد للباقات — يُستخدم في إضافة الأعضاء وفي حساب الإيراد المتكرر' : 'Single source of truth — used by member signup and MRR'}
        actions={
          <PrimaryAction onClick={() => setEditing(null)}>
            <Plus size={16} />
            {rtl ? 'إضافة باقة' : 'New plan'}
          </PrimaryAction>
        }
      >
        <Panel>
          {isLoading ? (
            <p className="text-center py-12 text-gray-400">{rtl ? 'جاري التحميل...' : 'Loading…'}</p>
          ) : offers.length === 0 ? (
            <EmptyState
              title={rtl ? 'لا توجد باقات بعد' : 'No plans yet'}
              description={rtl ? 'أضف أول باقة لتبدأ تسجيل المشتركين.' : 'Create your first plan to start enrolling members.'}
              actions={<PrimaryAction onClick={() => setEditing(null)}>{rtl ? 'إضافة باقة' : 'New plan'}</PrimaryAction>}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {offers.map((o) => (
                <div key={o.id} className={`rounded-2xl border p-5 ${o.is_active ? 'border-emerald-100 bg-emerald-50/40' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{o.title}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {o.duration_days % 30 === 0
                          ? `${fmtNum(o.duration_days / 30)} ${rtl ? (o.duration_days / 30 === 1 ? 'شهر' : 'شهور') : (o.duration_days / 30 === 1 ? 'month' : 'months')} · `
                          : ''}
                        {fmtNum(o.duration_days)} {rtl ? 'يوم' : 'days'}
                      </p>
                    </div>
                    <StatusBadge status={o.is_active ? (rtl ? 'مفعلة' : 'Active') : (rtl ? 'موقوفة' : 'Inactive')} variant={o.is_active ? 'success' : 'neutral'} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mt-3">{formatMoney(Number(o.price), currency)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {fmtNum(o.subscription_count ?? 0)} {rtl ? 'مشترك مرتبط بها' : 'linked subscriptions'}
                  </p>
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => setEditing(o)}
                      className="flex-1 min-h-[48px] md:min-h-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center justify-center gap-1.5"
                    >
                      <Pencil size={14} />
                      {rtl ? 'تعديل' : 'Edit'}
                    </button>
                    <button
                      onClick={() => toggle.mutate(o)}
                      disabled={toggle.isPending}
                      className={`flex-1 min-h-[48px] md:min-h-0 rounded-xl px-3 py-2 text-sm font-bold ${
                        o.is_active ? 'border border-red-200 bg-white text-red-600 hover:bg-red-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      } disabled:opacity-50`}
                    >
                      {o.is_active ? (rtl ? 'إيقاف' : 'Deactivate') : rtl ? 'تفعيل' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </DashboardPage>

      {editing !== undefined && (
        <OfferForm rtl={rtl} currency={currency} offer={editing} onClose={() => setEditing(undefined)} />
      )}
    </div>
  );
}
