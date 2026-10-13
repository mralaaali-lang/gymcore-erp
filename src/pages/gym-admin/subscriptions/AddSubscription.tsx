import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, User } from 'lucide-react';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { formatMoney } from '../../../utils/currency';
import { addDays, todayIso } from '../../../utils/subDates';
import {
  listMembers, listOffers, listSubscriptions, listTrainers, createSubscription,
  type MembershipOffer,
} from '../../../services/api';
import { PAYMENT_METHODS, SPORTS, WEEK_DAYS, durationLabelAr, sportLabel } from './shared';
import { printSubscriptionInvoice } from './invoice';

/** Extract the server's own error text so the UI never hides a real rejection. */
function apiError(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { error?: string; details?: { field?: string; message: string }[] } } })?.response?.data;
  if (data?.details?.length) {
    const parts = data.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message));
    return `${data.error ?? 'Validation failed'} — ${parts.join(' · ')}`;
  }
  return data?.error || fallback;
}

const inputCls =
  'w-full min-h-[48px] md:min-h-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-base md:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';
const labelCls = 'block text-sm font-semibold text-gray-700 mb-1';

/**
 * §34ي — شاشة «اشتراك جديد» بملء الشاشة حسب مواصفة صفحة الاشتراكات:
 * عضو ببحث حي، باقة بالسعر والمدة، مدرب، من/إلى، بداية ذكية (الآن أو
 * طابور بعد الحالي)، أيام حضور، دفع كامل/جزئي/آجل (يولّد دينًا في
 * member_debts على السيرفر) وطباعة الفاتورة فورًا.
 */
export default function AddSubscription({ onClose }: { onClose: () => void }) {
  const { language, gymProfile, branding } = useApp();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency;
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [memberQuery, setMemberQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [member, setMember] = useState<{ id: string; full_name: string; phone_number?: string | null } | null>(null);

  const [offerId, setOfferId] = useState('');
  const [coachId, setCoachId] = useState('');
  const [sport, setSport] = useState('');
  const [startMode, setStartMode] = useState<'now' | 'queue'>('now');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [weekly, setWeekly] = useState<string[]>([]);

  const [payKind, setPayKind] = useState<'full' | 'partial' | 'debt'>('full');
  const [amountStr, setAmountStr] = useState('');
  const [method, setMethod] = useState<string>('cash');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(memberQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [memberQuery]);

  const BackIcon = rtl ? ArrowRight : ArrowLeft;

  // ── بيانات حقيقية ──
  const { data: searchRes } = useApiQuery(
    ['members', 'quick-search', debouncedQuery],
    async () => (await listMembers({ search: debouncedQuery, limit: 10 })).members,
    { enabled: !member && debouncedQuery.length >= 2 }
  );

  const { data: offersRes } = useApiQuery(
    ['membership-offers', 'active'],
    async () => (await listOffers()).data as MembershipOffer[],
    { staleTime: 30_000 }
  );
  const offers = offersRes ?? [];
  const offer = useMemo(() => offers.find((o) => o.id === offerId) || null, [offers, offerId]);

  const { data: trainersRes } = useApiQuery(
    ['trainers'],
    async () => (await listTrainers()).data,
    { staleTime: 60_000 }
  );
  const trainers = trainersRes ?? [];

  // طابور الاشتراكات: آخر نهاية فعلية لهذا العضو إن كان لديه اشتراك نشط.
  const { data: memberSubs } = useApiQuery(
    ['subscriptions', 'member', member?.id ?? ''],
    async () => (await listSubscriptions({ member_id: member!.id, status: 'active' })).data,
    { enabled: !!member }
  );
  const queuedFrom = useMemo(() => {
    const active = (memberSubs ?? []).filter((s) => new Date(s.end_date) >= new Date(todayIso()));
    if (!active.length) return null;
    const latest = active.reduce((a, b) => (a.end_date >= b.end_date ? a : b));
    return { end: latest.end_date, offer: latest.offer_title, nextStart: addDays(latest.end_date, 1) };
  }, [memberSubs]);

  // ── توقيتات مترابطة ──
  useEffect(() => {
    if (startMode === 'queue' && queuedFrom) setStartDate(queuedFrom.nextStart);
  }, [startMode, queuedFrom]);

  useEffect(() => {
    if (offer) setEndDate(addDays(startDate, Number(offer.duration_days)));
  }, [offer, startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (offer) {
      if (payKind === 'full') setAmountStr(String(Number(offer.price)));
      if (payKind === 'debt') setAmountStr('0');
    }
  }, [offer, payKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const price = offer ? Number(offer.price) : 0;
  const paidAmount = Math.max(0, Number(amountStr || 0));
  const outstanding = offer ? Math.max(0, Math.round((price - paidAmount) * 100) / 100) : 0;

  const valid = !!member && !!offer && !!startDate && !!endDate && endDate > startDate && paidAmount <= price;

  const save = useMutation({
    mutationFn: () => createSubscription({
      member_id: member!.id,
      offer_id: offer!.id,
      coach_id: coachId || null,
      sport: sport || null,
      start_date: startDate,
      end_date: endDate,
      weekly_days: weekly.length ? weekly : undefined,
      amount_paid: payKind === 'full' ? price : payKind === 'debt' ? 0 : paidAmount,
      payment_method: method as 'cash',
    }),
    onSuccess: (res) => {
      const created = res.data;
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['billing-payments'] });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'business-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['membership-offers'] });
      const ok = printSubscriptionInvoice(gymProfile?.name || branding?.name, currency, {
        ...created,
        member_phone: member?.phone_number,
        sport_label: sportLabel(sport || created.sport),
      });
      showToast(rtl ? 'تم حفظ الاشتراك' : 'Subscription saved', 'success');
      if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة — فعّلها للطباعة' : 'Print popup blocked', 'error');
      onClose();
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل حفظ الاشتراك' : 'Failed to save subscription'), 'error'),
  });

  const toggleDay = (code: string) =>
    setWeekly((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="fixed inset-0 z-50 bg-gray-100 overflow-y-auto">
      {/* هيدر: زرار رجوع */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 md:px-8 h-[60px] flex items-center gap-3">
        <button onClick={onClose} className="rounded-full border border-gray-200 p-2 text-gray-600 hover:bg-gray-50" aria-label={rtl ? 'رجوع' : 'Back'}>
          <BackIcon size={18} />
        </button>
        <h2 className="font-bold text-lg text-gray-900">{rtl ? 'اشتراك جديد' : 'New subscription'}</h2>
      </div>

      <div className="max-w-2xl mx-auto p-4 md:p-8">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-5">
          <h3 className="font-bold text-gray-900">{rtl ? 'معلومات الاشتراك' : 'Subscription details'}</h3>

          {/* العضو — بحث حي */}
          <div>
            <label className={labelCls}>{rtl ? 'العضو' : 'Member'} *</label>
            {!member ? (
              <>
                <div className="relative">
                  <input
                    className={inputCls}
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder={rtl ? 'ابحث بالاسم أو الكود أو التليفون…' : 'Search by name, code or phone…'}
                  />
                </div>
                {debouncedQuery.length >= 2 && (searchRes ?? []).length > 0 && (
                  <div className="mt-2 rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                    {searchRes!.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setMember({ id: m.id, full_name: m.full_name, phone_number: m.phone_number }); setMemberQuery(''); }}
                        className="w-full text-start px-3 py-2.5 hover:bg-emerald-50 flex items-center gap-2 text-sm"
                      >
                        <User size={15} className="text-gray-400" />
                        <span className="font-semibold text-gray-800">{m.full_name}</span>
                        <span className="text-gray-400">{m.id.slice(0, 8)}</span>
                        {m.phone_number && <span className="ms-auto text-gray-500">{m.phone_number}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {debouncedQuery.length >= 2 && (searchRes ?? []).length === 0 && (
                  <p className="text-xs text-gray-400 mt-2">{rtl ? 'لا نتائج — جرّب اسمًا أقرب أو تليفونًا.' : 'No results.'}</p>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                <Check size={16} className="text-emerald-600" />
                <span className="font-bold text-emerald-900 text-sm">{member.full_name}</span>
                {member.phone_number && <span className="text-emerald-700 text-xs">{member.phone_number}</span>}
                <button type="button" onClick={() => { setMember(null); setStartMode('now'); }} className="ms-auto text-xs font-bold text-emerald-700 hover:underline">
                  {rtl ? 'تغيير' : 'Change'}
                </button>
              </div>
            )}
          </div>

          {/* الباقة */}
          <div>
            <label className={labelCls}>{rtl ? 'الباقة' : 'Plan'} * <span className="text-gray-400 font-normal">({offers.length})</span></label>
            <select className={inputCls} value={offerId} onChange={(e) => setOfferId(e.target.value)}>
              <option value="">{rtl ? 'اختر باقة…' : 'Choose a plan…'}</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title} — {formatMoney(Number(o.price), currency)} ({rtl ? durationLabelAr(o.duration_days) : `${o.duration_days}d`})
                </option>
              ))}
            </select>
            {offers.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {rtl ? 'لا باقات مفعّلة — أضفها من «الباقات» أولًا.' : 'No active plans — add them under Plans first.'}
              </p>
            )}
          </div>

          {/* المدرب */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{rtl ? 'المدرب' : 'Coach'} <span className="text-gray-400 font-normal">({trainers.length})</span></label>
              <select className={inputCls} value={coachId} onChange={(e) => setCoachId(e.target.value)}>
                <option value="">{rtl ? 'بدون مدرب' : 'No coach'}</option>
                {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'الرياضة' : 'Sport'}</label>
              <select className={inputCls} value={sport} onChange={(e) => setSport(e.target.value)}>
                <option value="">{rtl ? 'بدون تحديد' : 'Not set'}</option>
                {SPORTS.map((s) => <option key={s.code} value={s.code}>{rtl ? s.ar : s.en}</option>)}
              </select>
            </div>
          </div>

          {/* بداية الاشتراك — ذكي/طابور */}
          <div>
            <label className={labelCls}>{rtl ? 'بداية الاشتراك' : 'Starts'}</label>
            {queuedFrom ? (
              <div className="flex gap-2 flex-wrap mb-2">
                <label className="inline-flex items-center gap-1.5 text-sm border rounded-xl px-3 py-2 bg-white">
                  <input type="radio" checked={startMode === 'now'} onChange={() => setStartMode('now')} />
                  {rtl ? 'يبدأ من تاريخ البداية' : 'From chosen date'}
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm border rounded-xl px-3 py-2 bg-white">
                  <input type="radio" checked={startMode === 'queue'} onChange={() => setStartMode('queue')} />
                  {rtl ? `يبدأ بعد «${queuedFrom.offer}» (${queuedFrom.nextStart})` : `After ${queuedFrom.offer} (${queuedFrom.nextStart})`}
                </label>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-2">{rtl ? 'لا اشتراك نشط حاليًا لهذا العضو — يبدأ مباشرة.' : 'No active subscription — starts immediately.'}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">{rtl ? 'من' : 'From'}</label>
                <input type="date" className={inputCls} value={startDate} disabled={startMode === 'queue'} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500">{rtl ? 'إلى' : 'To'}</label>
                <input type="date" className={inputCls} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* أيام الحضور */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`${labelCls} mb-0`}>{rtl ? 'أيام الحضور' : 'Attendance days'}</label>
              <button
                type="button"
                onClick={() => setWeekly(weekly.length === WEEK_DAYS.length ? [] : WEEK_DAYS.map((d) => d.code))}
                className="text-xs font-bold text-emerald-600 hover:underline"
              >
                {weekly.length === WEEK_DAYS.length ? (rtl ? 'بدون أيام' : 'Clear') : (rtl ? 'كل الأيام' : 'All days')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {WEEK_DAYS.map((d) => (
                <label key={d.code} className={`inline-flex items-center gap-1.5 text-sm rounded-xl border px-3 py-2 min-h-[40px] cursor-pointer ${weekly.includes(d.code) ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-white border-gray-200 text-gray-600'}`}>
                  <input type="checkbox" className="accent-emerald-600" checked={weekly.includes(d.code)} onChange={() => toggleDay(d.code)} />
                  {d.ar}
                </label>
              ))}
            </div>
          </div>

          {/* الدفع */}
          <div>
            <label className={labelCls}>{rtl ? 'الدفع' : 'Payment'}</label>
            <div className="flex gap-2 flex-wrap mb-3">
              {([
                ['full', rtl ? 'كامل' : 'Full'],
                ['partial', rtl ? 'جزئي' : 'Partial'],
                ['debt', rtl ? 'آجل' : 'On credit'],
              ] as const).map(([k, label]) => (
                <label key={k} className="inline-flex items-center gap-1.5 text-sm border rounded-xl px-3 py-2 bg-white">
                  <input type="radio" name="pay" checked={payKind === k} onChange={() => setPayKind(k)} />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">{rtl ? 'المبلغ المدفوع' : 'Paid amount'}</label>
                <input
                  type="number" min={0} max={price} step="0.01" className={inputCls}
                  value={payKind === 'full' ? String(price) : payKind === 'debt' ? '0' : amountStr}
                  disabled={payKind !== 'partial' || !offer}
                  onChange={(e) => setAmountStr(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{rtl ? 'طريقة الدفع' : 'Method'}</label>
                <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m.code} value={m.code}>{m.ar}</option>)}
                </select>
              </div>
            </div>
            {outstanding > 0 && (
              <p className="text-xs text-rose-600 font-semibold mt-2">
                {rtl ? `المتبقي ${formatMoney(outstanding, currency)} — يُولَّد تلقائيًا كدين في ديون الأعضاء.` : `${formatMoney(outstanding, currency)} remaining — auto-created as member debt.`}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
            className="w-full min-h-[48px] md:min-h-0 rounded-xl bg-emerald-600 px-4 py-3 text-base md:text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {save.isPending ? (rtl ? 'جارٍ الحفظ…' : 'Saving…') : (rtl ? 'حفظ وطباعة الفاتورة' : 'Save & print invoice')}
          </button>
        </div>
      </div>
    </div>
  );
}
