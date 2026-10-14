import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { listTrainers, updateSubscription, type SubscriptionRow } from '../../../services/api';
import { formatDate } from '../../../utils/date';
import { SPORTS, WEEK_DAYS, sportLabel } from './shared';
import { printSubscriptionInvoice } from './invoice';

const inputCls =
  'w-full min-h-[48px] md:min-h-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-base md:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';
const labelCls = 'block text-sm font-semibold text-gray-700 mb-1';

function apiError(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { error?: string } } })?.response?.data;
  return data?.error || fallback;
}

/**
 * مودال تعديل الاشتراك — يفتح بالضغط على الصف.
 * النطاق عمدًا: الرياضة/المدرب/أيام الحضور فقط (بلا أثر مالي).
 * الباقة والتواريخ والمبالغ لا تُعدَّل (مرتبطة بالديون والمدفوعات)،
 * والاشتراك الملغي نهائي لا يُعدَّل (يرفضه السيرفر برسالة صادقة).
 */
export default function EditSubscription({
  sub,
  onClose,
  onRequestCancel,
}: {
  sub: SubscriptionRow;
  onClose: () => void;
  onRequestCancel: () => void;
}) {
  const { language, gymProfile, branding } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency;
  const gymName = gymProfile?.name || branding?.name;

  const [sport, setSport] = useState(sub.sport ?? '');
  const [coachId, setCoachId] = useState(sub.coach_id ?? '');
  const [weekly, setWeekly] = useState<string[]>(sub.weekly_days ?? []);

  const { data: trainersRes } = useApiQuery(
    ['trainers'],
    async () => (await listTrainers()).data,
    { staleTime: 60_000 }
  );
  const trainers = trainersRes ?? [];
  const cancelled = sub.status === 'cancelled';

  const toggleDay = (code: string) =>
    setWeekly((w) => (w.includes(code) ? w.filter((d) => d !== code) : [...w, code]));

  const save = useMutation({
    mutationFn: () =>
      updateSubscription(sub.id, {
        sport: sport || null,
        coach_id: coachId || null,
        weekly_days: weekly.length ? weekly : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      showToast(rtl ? 'تم حفظ التعديل' : 'Changes saved', 'success');
      onClose();
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل الحفظ' : 'Save failed'), 'error'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div dir={rtl ? 'rtl' : 'ltr'} className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div>
          <h3 className="font-bold text-lg text-gray-900">
            {rtl ? `تعديل اشتراك ${sub.member_name}` : `Edit ${sub.member_name}'s subscription`}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {sub.offer_title} · {formatDate(sub.start_date)} ← {formatDate(sub.end_date)}
          </p>
        </div>

        {cancelled ? (
          <p className="text-sm text-gray-500 bg-gray-50 rounded-xl p-3">
            {rtl ? 'لا يمكن تعديل اشتراك ملغي.' : 'A cancelled subscription cannot be edited.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{rtl ? 'الرياضة' : 'Sport'}</label>
                <select className={inputCls} value={sport} onChange={(e) => setSport(e.target.value)}>
                  <option value="">{rtl ? 'بدون تحديد' : 'Not set'}</option>
                  {SPORTS.map((s) => (
                    <option key={s.code} value={s.code}>{rtl ? s.ar : s.en}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>
                  {rtl ? 'المدرب' : 'Coach'} <span className="text-gray-400 font-normal">({trainers.length})</span>
                </label>
                <select className={inputCls} value={coachId} onChange={(e) => setCoachId(e.target.value)}>
                  <option value="">{rtl ? 'بدون مدرب' : 'No coach'}</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </div>
            </div>

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
                  <label
                    key={d.code}
                    className={`inline-flex items-center gap-1.5 text-sm rounded-xl border px-3 py-2 min-h-[40px] cursor-pointer ${
                      weekly.includes(d.code)
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-emerald-600"
                      checked={weekly.includes(d.code)}
                      onChange={() => toggleDay(d.code)}
                    />
                    {d.ar}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
            onClick={onClose}
          >
            {rtl ? 'تراجع' : 'Back'}
          </button>
          {!cancelled && (
            <button
              type="button"
              disabled={save.isPending}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              onClick={() => save.mutate()}
            >
              {save.isPending ? (rtl ? 'جارٍ الحفظ…' : 'Saving…') : (rtl ? 'حفظ التعديل' : 'Save changes')}
            </button>
          )}
        </div>

        {/* إجراءات الاشتراك (نُقلت من عمود الجدول): طباعة الفاتورة + طلب الإلغاء */}
        <div className="flex gap-2 pt-1 border-t border-gray-100">
          <button
            type="button"
            onClick={() => {
              const ok = printSubscriptionInvoice(gymName, currency, { ...sub, sport_label: sportLabel(sub.sport) });
              if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            <Receipt size={16} />
            {rtl ? 'طباعة الفاتورة' : 'Print invoice'}
          </button>
          {sub.status === 'active' && (
            <button
              type="button"
              onClick={onRequestCancel}
              className="flex-1 rounded-xl border border-rose-200 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50"
            >
              {rtl ? 'إلغاء الاشتراك' : 'Cancel subscription'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
