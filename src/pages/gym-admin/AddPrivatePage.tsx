import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FloppyDisk as Save } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney, currencySymbol } from '../../utils/currency';
import { todayIso, addDays } from '../../utils/subDates';
import {
  createPtEnrollment, listMembers, listCoachesSummary,
} from '../../services/api';
import { sportName, useSportsCatalog } from './subscriptions/shared';

// ====================================================================
// تسجيل برايفت جديد (/admin/private-training/add) — عمودان: بيانات
// البرايفت (عضو/مدرب/حصص/تواريخ/ملاحظات) + المبالغ والدفع. المعادلة حية
// (سعر × عدد = إجمالي) قدام الموظف قبل الحفظ. النهاية شهر تلقائي من
// البداية قابلة للتعديل. البرايفت منتج مستقل بتسعير حر — لا باقة.
// ====================================================================

const inputCls =
  'w-full min-h-[48px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50';

export default function AddPrivatePage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);

  const [memberQuery, setMemberQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [member, setMember] = useState<{ id: string; full_name: string } | null>(null);
  const [coachId, setCoachId] = useState('');
  const [count, setCount] = useState('12');
  const [start, setStart] = useState(todayIso());
  const [endTouched, setEndTouched] = useState(false);
  const [end, setEnd] = useState(addDays(todayIso(), 30));
  const [notes, setNotes] = useState('');
  const [unit, setUnit] = useState('100');
  const [paid, setPaid] = useState('0');
  const [method, setMethod] = useState('cash');

  // debounce member search (same pattern as the onboarding form)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(memberQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [memberQuery]);

  const { data: searchRes } = useApiQuery(
    ['members', 'quick-search', debouncedQuery],
    async () => (await listMembers({ search: debouncedQuery, limit: 8 })).members,
    { enabled: !member && debouncedQuery.length >= 2 },
  );

  const { data: coachesRes } = useApiQuery(['coaches', 'summary'], listCoachesSummary, { staleTime: 60_000 });
  const coaches = (coachesRes?.data ?? []).filter((c) => c.is_active);
  const { sports: catalogSports } = useSportsCatalog();

  const countNum = Number(count);
  const unitNum = Number(unit);
  const paidNum = Number(paid || 0);
  const total = Math.max(0, Math.round((Number.isFinite(countNum) ? countNum : 0) * (Number.isFinite(unitNum) ? unitNum : 0) * 100) / 100);
  const remainder = Math.max(0, Math.round((total - paidNum) * 100) / 100);
  const valid = !!member && !!coachId && Number.isInteger(countNum) && countNum >= 1
    && Number.isFinite(unitNum) && unitNum >= 0 && paidNum >= 0 && paidNum <= total && !!start && !!end && end > start;

  const onStart = (v: string) => {
    setStart(v);
    if (!endTouched && v) setEnd(addDays(v, 30));
  };

  const save = useMutation({
    mutationFn: () => createPtEnrollment({
      member_id: member!.id,
      coach_id: coachId,
      total_sessions: countNum,
      session_price: unitNum,
      start_date: start,
      end_date: end,
      amount_paid: paidNum,
      payment_method: method,
      notes: notes.trim() || undefined,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['pt-enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['debts-screen'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      showToast(
        rtl ? `تم تسجيل البرايفت — إجمالي ${money(res.data.total)}${res.data.remaining > 0 ? ` · متبقي ${money(res.data.remaining)} (دين)` : ''}` : 'Private recorded',
        'success',
      );
      navigate('/admin/private-training');
    },
    onError: (e) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || (rtl ? 'فشل التسجيل' : 'Failed'), 'error');
    },
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* الهيدر */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold text-gray-900">{rtl ? 'تسجيل برايفت جديد' : 'New private training'}</h1>
          <button
            type="button"
            onClick={() => navigate('/admin/private-training')}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl shadow-sm hover:bg-gray-50 transition-all"
          >
            <ArrowRight size={16} className={rtl ? '' : 'rotate-180'} />
            {rtl ? 'رجوع' : 'Back'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* اليمين — بيانات البرايفت */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-900 mb-4">
              {rtl ? 'بيانات البرايفت' : 'Details'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {rtl ? 'العضو' : 'Member'} <span className="text-red-500">*</span>
                </label>
                {member ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    <span className="font-bold text-gray-900 text-sm">{member.full_name}</span>
                    <button type="button" onClick={() => { setMember(null); setMemberQuery(''); setDebouncedQuery(''); }} className="text-xs text-gray-500 hover:text-red-600 font-semibold">
                      {rtl ? 'تغيير' : 'Change'}
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      className={inputCls}
                      placeholder={rtl ? 'بحث بالاسم / الكود / الهاتف…' : 'Search…'}
                    />
                    {debouncedQuery.length >= 2 && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                        {(searchRes ?? []).map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setMember({ id: m.id, full_name: m.full_name })}
                            className="w-full text-start px-4 py-2.5 hover:bg-gray-50 text-sm font-medium text-gray-900"
                          >
                            {m.full_name}
                          </button>
                        ))}
                        {(searchRes ?? []).length === 0 && (
                          <p className="px-4 py-3 text-sm text-gray-400">{rtl ? 'لا نتائج' : 'No matches'}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {rtl ? 'المدرب' : 'Coach'} <span className="text-red-500">*</span>
                </label>
                <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={inputCls}>
                  <option value="">{rtl ? 'اختر…' : 'Select…'}</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}{c.sport_mode ? ` (${sportName(c.sport_mode, catalogSports, rtl)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {rtl ? 'عدد الحصص' : 'Sessions'} <span className="text-red-500">*</span>
                </label>
                <input type="number" min={1} step={1} value={count} onChange={(e) => setCount(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'تاريخ البداية' : 'Start'}</label>
                  <input type="date" value={start} onChange={(e) => onStart(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'تاريخ النهاية' : 'End'}</label>
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => { setEnd(e.target.value); setEndTouched(true); }}
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-gray-400">{rtl ? 'شهر تلقائيًا من البداية' : 'Auto: one month from start'}</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'ملاحظات' : 'Notes'}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
              </div>
            </div>
          </div>

          {/* الشمال — المبالغ والدفع */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-900 mb-4">
              {rtl ? 'المبالغ والدفع' : 'Pricing & payment'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {rtl ? `سعر الحصة (${currencySymbol(gymProfile?.currency)})` : 'Price/session'}
                </label>
                <input type="number" min={0} step="0.01" value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} />
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
                <p className="text-xs text-orange-700 font-semibold">{rtl ? 'الإجمالي (محسوب تلقائيًا)' : 'Total (auto)'}</p>
                <p className="text-2xl font-extrabold text-orange-600 tabular-nums">{money(total)}</p>
                <p className="text-[11px] text-orange-500 mt-0.5">
                  {rtl ? `${count || 0} × ${money(Number.isFinite(unitNum) ? unitNum : 0)}` : `${count || 0} × ${unit}`}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {rtl ? `المبلغ المدفوع (${currencySymbol(gymProfile?.currency)})` : 'Paid'}
                </label>
                <input type="number" min={0} step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} className={inputCls} />
                {remainder > 0 && (
                  <p className="mt-1.5 text-xs font-semibold text-red-600">
                    {rtl ? `المتبقي ${money(remainder)} — يُقيَّد دين برايفت على العضو` : `Rest ${money(remainder)} — booked as PT debt`}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'طريقة الدفع' : 'Method'}</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                  <option value="cash">{rtl ? 'نقدي' : 'Cash'} 💵</option>
                  <option value="card">{rtl ? 'فيزا' : 'Card'}</option>
                  <option value="vodafone_cash">{rtl ? 'فودافون كاش' : 'Wallet'}</option>
                  <option value="instapay">{rtl ? 'انستاباي' : 'InstaPay'}</option>
                  <option value="bank">{rtl ? 'تحويل' : 'Bank'}</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => save.mutate()}
                disabled={!valid || save.isPending}
                className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold disabled:opacity-50 shadow-lg shadow-emerald-600/20"
              >
                <Save size={18} />
                {save.isPending ? (rtl ? 'جارٍ التسجيل…' : 'Saving…') : (rtl ? 'تسجيل البرايفت' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
