import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bank as Banknote, CalendarCheck as CalendarClock, Check, Wallet } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import {
  listQuickSessions, createQuickSession, listMembers, listTrainers,
  type StaffData,
} from '../../services/api';
import { DashboardPage, StatCard, Panel, EmptyState } from '../../components/dashboard';
import PageLoader from '../../components/shared/PageLoader';
import { PAYMENT_METHODS } from './subscriptions/shared';

// ====================================================================
// حصة سريعة (/admin/quick-session) — بيع حصة لعضو أو عابر سبيل بسعر
// ثابت (SKU مستقل عن الباقات — لا اشتراك يُنشأ أبدًا). نفس معادلة الديون
// (مدفوع/متبقي) على الحصة الواحدة: العابر يدفع كاملًا (الدين يحتاج عضوًا)،
// والعضو قد يدفع جزئيًا فيتحول الباقي دينًا عليه. checkbox الحضور يضرب
// عصفورين (بيع + دخول) — للأعضاء المسجلين فقط. الحصص تتسجل كمدفوعات.
// ====================================================================

const inputCls =
  'w-full min-h-[48px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/40 disabled:opacity-50';

function localDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function QuickSessionPage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);

  const [clientKind, setClientKind] = useState<'member' | 'walkin'>('member');
  const [memberQuery, setMemberQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [member, setMember] = useState<{ id: string; full_name: string } | null>(null);
  const [walkinName, setWalkinName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [price, setPrice] = useState('');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState('cash');
  const [coachId, setCoachId] = useState('');
  const [when, setWhen] = useState(localDateTime(new Date()));
  const [withAttendance, setWithAttendance] = useState(false);

  // debounce member search (same pattern as the onboarding form)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(memberQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [memberQuery]);

  const { data, isLoading } = useApiQuery(
    ['quick-sessions', 'today'],
    () => listQuickSessions(),
    { staleTime: 30_000 },
  );
  const rows = data?.data ?? [];
  const stats = data?.stats;
  const defaultPrice = Number(data?.default_price ?? 50);

  const { data: searchRes } = useApiQuery(
    ['members', 'quick-search', debouncedQuery],
    async () => (await listMembers({ search: debouncedQuery, limit: 8 })).members,
    { enabled: clientKind === 'member' && !member && debouncedQuery.length >= 2 },
  );

  const { data: trainersRes } = useApiQuery(
    ['trainers', 'active'],
    async () => (await listTrainers()).data as StaffData[],
    { staleTime: 60_000 },
  );
  const trainers = trainersRes ?? [];

  const priceNum = price.trim() === '' ? defaultPrice : Number(price);
  const paidNum = paid.trim() === '' ? priceNum : Number(paid);
  const remainder = Math.max(0, Math.round((priceNum - paidNum) * 100) / 100);
  const priceOk = Number.isFinite(priceNum) && priceNum >= 0;
  const paidOk = Number.isFinite(paidNum) && paidNum >= 0 && paidNum <= priceNum;
  const clientOk = clientKind === 'member' ? !!member : walkinName.trim().length >= 2;
  const walkinBlocked = clientKind === 'walkin' && remainder > 0;
  const valid = clientOk && priceOk && paidOk && !walkinBlocked && !!when;

  const save = useMutation({
    mutationFn: () => createQuickSession({
      member_id: clientKind === 'member' ? member!.id : null,
      client_name: clientKind === 'walkin' ? walkinName.trim() : undefined,
      session_name: sessionName.trim() || undefined,
      price: priceNum,
      paid: paidNum,
      payment_method: method,
      coach_id: coachId || null,
      session_time: new Date(when).toISOString(),
      with_attendance: withAttendance && clientKind === 'member',
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['quick-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      showToast(
        rtl
          ? `تم تسجيل الحصة — ${res.data.client_name}${res.data.attendance_logged ? ' + حضور' : ''}${res.data.remaining > 0 ? ` · متبقي ${money(res.data.remaining)} (دين)` : ''}`
          : 'Session recorded',
        'success',
      );
      setMember(null); setMemberQuery(''); setWalkinName('');
      setPaid(''); setCoachId(''); setWithAttendance(false);
    },
    onError: (e) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || (rtl ? 'فشل تسجيل الحصة' : 'Failed to record session'), 'error');
    },
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate('/admin/members/add')}
              className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-2xl shadow-sm hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              {rtl ? 'عضو جديد' : 'New member'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/payments')}
              className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-2xl shadow-sm hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              {rtl ? 'المدفوعات' : 'Payments'}
            </button>
          </>
        }
      >
        <p className="-mt-2 text-xs text-gray-400">
          <Link to="/admin/payments" className="text-emerald-600 font-semibold hover:underline">
            {rtl ? 'المدفوعات' : 'Payments'}
          </Link>
          {rtl ? ' — الحصص المسجلة هنا تظهر كمدفوعات' : ' — sessions recorded here appear as payments'}
        </p>

        {/* ── الكروت الثلاثة ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          <StatCard icon={Wallet} label={rtl ? 'محصّل اليوم' : "Today's intake"} value={money(stats?.today_collected ?? 0)} accent="emerald" onClick={() => navigate('/admin/payments')} />
          <StatCard icon={Banknote} label={rtl ? 'متبقي اليوم' : "Today's remainder"} value={money(stats?.today_remaining ?? 0)} accent="rose" onClick={() => navigate('/admin/debts')} />
          <StatCard icon={CalendarClock} label={rtl ? 'محصّل الشهر' : "Month's intake"} value={money(stats?.month_collected ?? 0)} accent="amber" onClick={() => navigate('/admin/reports/financial')} />
        </div>

        {/* ── فورم تسجيل حصة ── */}
        <Panel icon={Check} accent="emerald" title={rtl ? 'تسجيل حصة' : 'Record a session'}>
          {/* العميل: عضو أو عابر */}
          <div className="flex gap-2 bg-gray-100 rounded-2xl p-1.5 w-fit mb-4">
            {(['member', 'walkin'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setClientKind(k); setMember(null); setMemberQuery(''); setWithAttendance(false); }}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  clientKind === k ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {k === 'member' ? (rtl ? 'عضو مسجل' : 'Member') : (rtl ? 'عميل جديد (عابر)' : 'Walk-in')}
              </button>
            ))}
          </div>

          {clientKind === 'member' ? (
            <div className="relative mb-4 max-w-md">
              {member ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                  <span className="font-bold text-gray-900 text-sm">{member.full_name}</span>
                  <button type="button" onClick={() => { setMember(null); setMemberQuery(''); }} className="text-xs text-gray-500 hover:text-red-600 font-semibold">
                    {rtl ? 'تغيير' : 'Change'}
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    className={inputCls}
                    placeholder={rtl ? 'بحث بالاسم / الكود / الهاتف…' : 'Search name / code / phone…'}
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
                </>
              )}
            </div>
          ) : (
            <div className="mb-4 max-w-md">
              <input
                value={walkinName}
                onChange={(e) => setWalkinName(e.target.value)}
                className={inputCls}
                placeholder={rtl ? 'اسم العميل *' : 'Client name *'}
              />
              <p className="mt-1.5 text-xs text-gray-400">
                {rtl ? 'العابر يدفع كاملًا — المتبقي يحتاج عضوًا ليُقيَّد دينًا عليه.' : 'Walk-ins pay in full — remainder needs a member.'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'اسم الحصة' : 'Session name'}</label>
              <input value={sessionName} onChange={(e) => setSessionName(e.target.value)} className={inputCls} placeholder={rtl ? `حصة · ${defaultPrice}` : `Session · ${defaultPrice}`} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'السعر' : 'Price'} *</label>
              <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} placeholder={String(defaultPrice)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'المدفوع' : 'Paid'}</label>
              <input type="number" min={0} step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} className={inputCls} placeholder={rtl ? 'فارغ = كامل' : 'Empty = full'} />
              {!paidOk && <p className="mt-1 text-xs text-red-500">{rtl ? 'بين 0 والسعر' : 'Between 0 and price'}</p>}
              {walkinBlocked && <p className="mt-1 text-xs text-red-500">{rtl ? 'العابر يدفع كاملًا' : 'Walk-ins pay in full'}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'طريقة الدفع' : 'Method'}</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={`${inputCls} appearance-none`}>
                {PAYMENT_METHODS.map((m) => <option key={m.code} value={m.code}>{m.ar}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'المدرب (اختياري)' : 'Coach (optional)'}</label>
              <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={`${inputCls} appearance-none`}>
                <option value="">{rtl ? 'بدون مدرب' : 'No coach'}</option>
                {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'وقت الحصة' : 'Session time'}</label>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} />
            </div>
          </div>

          <label className={`mt-4 flex items-center gap-2 text-sm font-semibold ${clientKind === 'member' ? 'text-gray-900 cursor-pointer' : 'text-gray-400'}`}>
            <input
              type="checkbox"
              checked={withAttendance && clientKind === 'member'}
              onChange={(e) => setWithAttendance(e.target.checked)}
              disabled={clientKind !== 'member'}
              className="w-5 h-5 rounded accent-emerald-600"
            />
            {rtl ? 'تسجيل حضور مع الحصة (بيع + دخول بضغطة)' : 'Log attendance too (sale + entry in one tap)'}
          </label>
          {clientKind !== 'member' && (
            <p className="mt-1 text-xs text-gray-400">{rtl ? 'الحضور يتطلب عضوًا مسجلًا.' : 'Attendance needs a registered member.'}</p>
          )}

          {priceOk && (
            <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-2.5 inline-block">
              {rtl
                ? `السعر ${money(priceNum)} · مدفوع ${money(paidNum)}${remainder > 0 ? ` · متبقي ${money(remainder)} (دين على العضو)` : ' · خالص'}`
                : `Due ${money(priceNum)} · paid ${money(paidNum)} · rest ${money(remainder)}`}
            </p>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={!valid || save.isPending}
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-8 py-3 rounded-2xl shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
            >
              {save.isPending ? (rtl ? 'جارٍ التسجيل…' : 'Saving…') : (rtl ? 'تسجيل الحصة' : 'Record session')}
            </button>
          </div>
        </Panel>

        {/* ── جدول حصص اليوم ── */}
        <Panel
          icon={CalendarClock}
          accent="amber"
          title={`${rtl ? `حصص يوم ${data?.date ?? ''}` : `Sessions ${data?.date ?? ''}`} (${rows.length})`}
        >
          {isLoading ? (
            <PageLoader variant="skeleton" rows={4} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              accent="gray"
              title={rtl ? 'لا توجد حصص في هذا اليوم' : 'No sessions this day'}
              description={rtl ? 'سجّل أول حصة من النموذج أعلاه.' : 'Record the first session above.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'العميل' : 'Client'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحصة' : 'Session'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المدرب' : 'Coach'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'السعر' : 'Price'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المدفوع' : 'Paid'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المتبقي' : 'Rest'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الوقت' : 'Time'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'حضور' : 'Entry'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {r.client_name}
                        {!r.member_name && <span className="text-xs text-gray-400"> · {rtl ? 'عابر' : 'walk-in'}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.session_name}</td>
                      <td className="px-4 py-3 text-gray-500">{r.coach_name || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{money(r.price)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600 whitespace-nowrap">{money(r.paid)}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${r.remaining > 0 ? 'font-bold text-red-600' : 'text-gray-400'}`}>
                        {r.remaining > 0 ? money(r.remaining) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.session_time)}</td>
                      <td className="px-4 py-3">
                        {r.attendance_logged ? (
                          <span className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700">
                            {rtl ? 'حاضر' : 'Present'}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </DashboardPage>
    </div>
  );
}
