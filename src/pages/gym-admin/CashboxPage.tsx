import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { formatMoney, currencySymbol } from '../../utils/currency';
import { formatTime } from '../../utils/date';
import { escapeHtml, printDocument } from '../../utils/print';
import {
  listCashboxSessions,
  getCashbook,
  getFinanceSummary,
  listMovements,
  createRefund,
  createExpense,
  listExpenseCategories,
  lookupMembersForCheckIn,
  type CashMovement,
  type CheckInMemberHit,
} from '../../services/api';
import { PAYMENT_METHODS } from './subscriptions/shared';
import PageLoader from '../../components/shared/PageLoader';
import Modal from '../../components/shared/Modal';
import { AddExpenseModal } from './ExpensesPage';

// ====================================================================
// صفحة الخزنة (إعادة بناء بمواصفة صاحب المشروع):
// سطر أزرار → 5 كروت → فلتر تاريخ → رسم 7 أيام + ملخص الشهر →
// جدولا حركات اليوم المختار. نطاق الأرقام: الكروت والجداول كل الطرق،
// والرسم والأدراج كاش فقط (نفس تعريف CASH_IN/OUT في السيرفر).
// المرتجعات نوع مستقل (068) — لا تُخلط بالمصروفات في أي مكان.
// ====================================================================

/** Local YYYY-MM-DD (matches the gym-local day bucketing server-side). */
function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDaysStr(base: string, delta: number): string {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dayStr(dt);
}

const btnBase =
  'inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-sm font-bold border transition active:scale-[0.98]';

export default function CashboxPage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency;

  const today = useMemo(() => dayStr(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [showExpense, setShowExpense] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showRefund, setShowRefund] = useState(false);

  const num = (v: number | string | null | undefined) => Number(v ?? 0);

  // ── مصادر البيانات ──
  const { data: sessionsRes, isLoading: sessionsLoading } = useQuery({
    queryKey: ['cashbox-sessions'],
    queryFn: () => listCashboxSessions(),
    staleTime: 10_000,
  });
  const { data: weekRes } = useQuery({
    queryKey: ['cashbook', 7],
    queryFn: () => getCashbook(7),
    staleTime: 30_000,
  });
  const { data: summaryRes } = useQuery({
    queryKey: ['gym', 'finance', 'summary'],
    queryFn: () => getFinanceSummary(),
    staleTime: 30_000,
  });
  const { data: dayRes, isLoading: dayLoading } = useQuery({
    queryKey: ['cash-movements', selectedDate],
    queryFn: () => listMovements({ from: selectedDate, to: selectedDate, limit: 500 }),
    staleTime: 15_000,
  });

  const sessions = sessionsRes?.data ?? [];
  const fin = summaryRes?.data;
  const dayRows: CashMovement[] = dayRes?.data ?? [];
  const dayIn = dayRows.filter((r) => r.type === 'payment');
  const dayOut = dayRows.filter((r) => r.type === 'expense');
  const dayRef = dayRows.filter((r) => r.type === 'refund');

  // رصيد أدراج اليوم: متوقع جلسات المفتوحة اليوم (opening + in − out − refunds).
  const todaySessions = sessions.filter((s) => dayStr(new Date(s.opened_at)) === today);
  const drawerToday = todaySessions.reduce((t, s) => t + Number(s.expected_balance ?? 0), 0);

  // كروت اليوم (كل الطرق — نفس نطاق جدولا اليوم).
  const tIn = num(fin?.today_revenue);
  const tOut = num(fin?.today_expense_sum);
  const tRef = num(fin?.today_refund_sum);
  const tNet = tIn - tOut - tRef;
  const tInCount = Number(fin?.today_payment_count ?? 0);
  const tOutCount = Number(fin?.today_expense_count ?? 0);
  const tRefCount = Number(fin?.today_refund_count ?? 0);

  // ملخص الشهر (تقويمي من الملخص المالي).
  const mIn = num(fin?.monthly_revenue);
  const mOut = num(fin?.monthly_expenses);
  const mRef = num(fin?.monthly_refunds);
  const mNet = mIn - mOut - mRef;

  const refreshMoney = () => {
    queryClient.invalidateQueries({ queryKey: ['cashbox-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['cashbook'] });
    queryClient.invalidateQueries({ queryKey: ['gym', 'finance', 'summary'] });
    queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
    queryClient.invalidateQueries({ queryKey: ['nav', 'badges'] });
  };

  // نفس مودال المصروفات الأصلي (ExpensesPage) — نفس الشكل والسلوك.
  const { data: categoriesRes } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => listExpenseCategories(),
    enabled: showExpense,
  });
  const expenseMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      showToast(rtl ? 'تم إضافة المصروف' : 'Expense added', 'success');
      setShowExpense(false);
      refreshMoney();
    },
    onError: () => showToast(rtl ? 'فشل إضافة المصروف' : 'Could not add the expense', 'error'),
  });

  const quickBtn = (key: 'day' | 'back1' | 'back2') => {
    const target = key === 'day' ? today : key === 'back1' ? addDaysStr(today, -1) : addDaysStr(today, -2);
    const active = selectedDate === target;
    const label = key === 'day' ? (rtl ? 'اليوم' : 'Today') : key === 'back1' ? (rtl ? 'أمس' : 'Yesterday') : (rtl ? 'قبل يومين' : '2 days ago');
    return (
      <button
        key={key}
        type="button"
        onClick={() => setSelectedDate(target)}
        className={`min-h-[44px] md:min-h-0 px-4 py-2 rounded-xl text-sm font-bold transition ${active ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
      >
        {label}
      </button>
    );
  };

  if (sessionsLoading) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
        <PageLoader message={rtl ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    );
  }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-5 bg-gray-50 min-h-screen -m-6 p-6">
      {/* 2) سطر الأزرار — المجموعة على الشمال (نهاية السطر في RTL) */}
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" onClick={() => navigate('/admin/cashbox/shifts')} className={`${btnBase} bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100`}>
          <span className="material-symbols-outlined text-lg">schedule</span>
          {rtl ? 'الشيفتات' : 'Shifts'}
        </button>
        <button type="button" onClick={() => setShowSearch(true)} className={`${btnBase} bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100`}>
          <span className="material-symbols-outlined text-lg">search</span>
          {rtl ? 'بحث متقدم' : 'Advanced search'}
        </button>
        <button type="button" onClick={() => setShowReport(true)} className={`${btnBase} bg-white border-gray-200 text-gray-700 hover:bg-gray-50`}>
          <span className="material-symbols-outlined text-lg">description</span>
          {rtl ? 'تقرير اليوم' : 'Day report'}
        </button>
        <button type="button" onClick={() => setShowExpense(true)} className={`${btnBase} bg-orange-700 border-orange-700 text-white hover:bg-orange-800`}>
          <span className="material-symbols-outlined text-lg">add</span>
          {rtl ? 'إضافة مصروف' : 'Add expense'}
        </button>
      </div>

      {/* 3) صف الكروت الخمسة */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <Kpi icon="account_balance_wallet" tone="emerald" label={rtl ? 'الرصيد الإجمالي' : 'Total balance'}
          value={formatMoney(drawerToday, currency)} valueClass={drawerToday > 0 ? 'text-emerald-600' : drawerToday < 0 ? 'text-red-500' : 'text-gray-400'}
          sub={rtl ? 'أدراج اليوم' : "Today's drawer"} />
        <Kpi icon="arrow_upward" tone="emerald" label={rtl ? 'إيرادات اليوم' : "Today's income"}
          value={formatMoney(tIn, currency)} valueClass="text-emerald-600"
          sub={rtl ? `${tInCount} عملية` : `${tInCount} ops`} />
        <Kpi icon="arrow_downward" tone="rose" label={rtl ? 'مصروفات اليوم' : "Today's expenses"}
          value={formatMoney(tOut, currency)} valueClass="text-red-500"
          sub={rtl ? `${tOutCount} عملية` : `${tOutCount} ops`} />
        <button type="button" onClick={() => setShowRefund(true)} title={rtl ? 'تسجيل مرتجع' : 'Record refund'} className="text-start">
          <Kpi icon="sync" tone="amber" label={rtl ? 'مرتجعات اليوم' : "Today's refunds"}
            value={formatMoney(tRef, currency)} valueClass="text-orange-500"
            sub={rtl ? `${tRefCount} فاتورة` : `${tRefCount} bills`} />
        </button>
        <Kpi icon="scale" tone="sky" label={rtl ? 'صافي اليوم' : "Today's net"}
          value={`${tNet < 0 ? '−' : ''}${formatMoney(Math.abs(tNet), currency)}`}
          valueClass={tNet > 0 ? 'text-emerald-600' : tNet < 0 ? 'text-red-500' : 'text-gray-400'} />
      </div>

      {/* 4) كارت فلتر التاريخ */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          {rtl ? 'اختر التاريخ:' : 'Pick a date:'}
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
          />
        </label>
        <div className="ms-auto flex items-center gap-2 flex-wrap">
          {quickBtn('day')}
          {quickBtn('back1')}
          {quickBtn('back2')}
        </div>
      </div>

      {/* 5) المقسوم: الرسم يمين + ملخص الشهر شمال */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <WeekChart rows={weekRes?.data?.rows ?? []} rtl={rtl} onPick={setSelectedDate} selected={selectedDate} />
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-2xl bg-sky-50 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl text-sky-600">calendar_month</span>
            </div>
            <h2 className="text-base font-bold text-gray-900">{rtl ? 'ملخص الشهر' : 'Month summary'}</h2>
          </div>
          <div className="space-y-2.5">
            <MonthLine icon="arrow_upward" iconClass="text-emerald-600" label={rtl ? 'الإيرادات' : 'Income'} value={formatMoney(mIn, currency)} valueClass="text-emerald-600" />
            <MonthLine icon="arrow_downward" iconClass="text-red-500" label={rtl ? 'المصروفات' : 'Expenses'} value={formatMoney(mOut, currency)} valueClass="text-red-500" />
            <MonthLine icon="sync" iconClass="text-orange-500" label={rtl ? 'المرتجعات' : 'Refunds'} value={formatMoney(mRef, currency)} valueClass="text-orange-500" />
            <MonthLine icon="payments" iconClass="text-emerald-600" label={rtl ? 'الصافي' : 'Net'} value={`${mNet < 0 ? '−' : ''}${formatMoney(Math.abs(mNet), currency)}`} valueClass={mNet >= 0 ? 'text-emerald-600' : 'text-red-500'} bold />
          </div>
        </div>
      </div>

      {/* 6) جدولان جنب بعض */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-3xl border border-gray-100 border-t-4 !border-t-emerald-500 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">{rtl ? `إيرادات ${selectedDate}` : `Income ${selectedDate}`} ({dayIn.length})</h3>
          </div>
          <DayTable rows={dayIn} currency={currency} tone="emerald"
            emptyText={rtl ? 'لا توجد إيرادات في هذا اليوم' : 'No income on this day'} emptyIcon="inbox" />
        </div>
        <div className="bg-white rounded-3xl border border-gray-100 border-t-4 !border-t-red-500 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">{rtl ? `مصروفات ${selectedDate}` : `Expenses ${selectedDate}`} ({dayOut.length})</h3>
          </div>
          <DayTable rows={dayOut} currency={currency} tone="rose"
            emptyText={rtl ? 'لا توجد مصروفات في هذا اليوم' : 'No expenses on this day'} emptyIcon="inbox"
            emptyAction={
              <button
                type="button"
                onClick={() => setShowExpense(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white border border-orange-300 text-orange-700 px-4 py-2.5 text-sm font-bold hover:bg-orange-50 transition min-h-[44px]"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                {rtl ? 'إضافة مصروف' : 'Add expense'}
              </button>
            } />
        </div>
      </div>

      {/* مرتجعات اليوم المختار — شريط شرطي (لا يظهر بلا مرتجعات) */}
      {dayRef.length > 0 && (
        <div className="bg-white rounded-3xl border border-orange-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-orange-100">
            <h3 className="text-sm font-bold text-orange-700">
              {rtl ? `مرتجعات ${selectedDate}` : `Refunds ${selectedDate}`} ({dayRef.length})
            </h3>
          </div>
          <DayTable rows={dayRef} currency={currency} tone="amber" />
        </div>
      )}

      {dayLoading && (
        <p className="text-center text-sm text-gray-400">{rtl ? 'جاري تحميل حركات اليوم...' : 'Loading day movements...'}</p>
      )}

      {showExpense && (
        <AddExpenseModal
          rtl={rtl}
          categories={(categoriesRes?.data ?? []) as { id: string; name: string }[]}
          currencyLabel={currencySymbol(currency)}
          saving={expenseMutation.isPending}
          onClose={() => setShowExpense(false)}
          onSubmit={(payload) => expenseMutation.mutate(payload)}
        />
      )}
      {showSearch && (
        <SearchModal onClose={() => setShowSearch(false)} currency={currency} rtl={rtl} />
      )}
      {showReport && (
        <ReportModal
          date={selectedDate}
          rows={dayRows}
          currency={currency}
          rtl={rtl}
          onClose={() => setShowReport(false)}
        />
      )}
      {showRefund && (
        <RefundModal
          onClose={() => setShowRefund(false)}
          onDone={() => { setShowRefund(false); refreshMoney(); }}
          currency={currency}
          rtl={rtl}
        />
      )}
    </div>
  );
}

/* ---------- building blocks ---------- */

const TONES: Record<string, { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-600' },
};

function Kpi({ icon, tone, label, value, valueClass, sub }: {
  icon: string; tone: keyof typeof TONES; label: string; value: string; valueClass?: string; sub?: string;
}) {
  const t = TONES[tone];
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 [container-type:inline-size]">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${t.bg}`}>
          <span className={`material-symbols-outlined text-2xl ${t.text}`}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className={`font-extrabold tracking-tight tabular-nums leading-tight whitespace-nowrap text-[clamp(15px,8cqw,20px)] ${valueClass ?? 'text-gray-900'}`}>
            {value}
          </p>
          <p className="font-medium text-gray-500 mt-0.5 truncate whitespace-nowrap text-[clamp(11px,4.5cqw,14px)]">{label}</p>
          {sub && <p className="text-xs text-gray-400 mt-1 whitespace-nowrap">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function MonthLine({ icon, iconClass, label, value, valueClass, bold }: {
  icon: string; iconClass: string; label: string; value: string; valueClass?: string; bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-gray-600">
        <span className={`material-symbols-outlined text-xl ${iconClass}`}>{icon}</span>
        {label}
      </span>
      <span className={`text-sm tabular-nums whitespace-nowrap ${bold ? 'font-extrabold' : 'font-bold'} ${valueClass ?? 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  );
}

function DayTable({ rows, currency, tone, emptyText, emptyIcon, emptyAction }: {
  rows: CashMovement[]; currency: string | null | undefined; tone: 'emerald' | 'rose' | 'amber';
  emptyText?: string; emptyIcon?: string; emptyAction?: React.ReactNode;
}) {
  const color = tone === 'emerald' ? 'text-emerald-600' : tone === 'rose' ? 'text-red-500' : 'text-orange-500';
  if (rows.length === 0) {
    return (
      <div className="py-10 px-4 text-center">
        <span className="material-symbols-outlined text-5xl text-gray-300">{emptyIcon ?? 'inbox'}</span>
        <p className="text-sm text-gray-400 mt-2">{emptyText}</p>
        {emptyAction}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
          <span className="text-xs text-gray-400 tabular-nums shrink-0" dir="ltr">
            {r.created_at ? formatTime(String(r.created_at)) : '—'}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-gray-900 truncate">{r.description || '—'}</span>
            {r.member_name && <span className="block text-xs text-gray-400 truncate">{r.member_name}</span>}
          </span>
          <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${color}`}>
            {formatMoney(Number(r.amount), currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WeekChart({ rows, rtl, onPick, selected }: {
  rows: { date: string; cash_in: number | string; cash_out: number | string }[];
  rtl: boolean;
  onPick: (d: string) => void; selected: string;
}) {
  const max = Math.max(1, ...rows.map((d) => Math.max(Number(d.cash_in), Number(d.cash_out))));
  const allZero = rows.every((d) => Number(d.cash_in) === 0 && Number(d.cash_out) === 0);
  const grid = [1, 0.66, 0.33, 0].map((f) => Math.round(max * f));
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-xl text-emerald-600">bar_chart</span>
        </div>
        <h2 className="text-base font-bold text-gray-900">{rtl ? 'حركة آخر 7 أيام' : 'Last 7 days'}</h2>
      </div>
      {allZero ? (
        <div className="py-10 text-center">
          <span className="material-symbols-outlined text-5xl text-gray-300">inbox</span>
          <p className="text-sm text-gray-400 mt-2">{rtl ? 'لا حركات آخر 7 أيام' : 'No movements in the last 7 days'}</p>
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="flex flex-col justify-between text-[10px] text-gray-400 tabular-nums py-0.5 text-end" dir="ltr">
            {grid.map((g, i) => (
              <span key={i}>{g >= 1000 ? `${Math.round(g / 100) / 10}k` : g}</span>
            ))}
          </div>
          <div className="flex-1 flex items-end gap-2 h-44">
            {rows.map((d) => {
              const ci = Number(d.cash_in);
              const co = Number(d.cash_out);
              const isSel = d.date === selected;
              const label = d.date.slice(5).split('-').reverse().join('/');
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => onPick(d.date)}
                  title={`${d.date} · +${ci} / −${co}`}
                  className={`flex-1 h-full flex flex-col justify-end items-center gap-1 rounded-xl px-1 pt-1 transition ${isSel ? 'bg-emerald-50/70 ring-1 ring-emerald-200' : 'hover:bg-gray-50'}`}
                >
                  <span className="text-[9px] font-bold tabular-nums text-emerald-700 leading-none">{ci > 0 ? ci : ''}</span>
                  <span className="w-full max-w-6 rounded-t-md bg-emerald-500" style={{ height: `${Math.max(ci > 0 ? 4 : 0, (ci / max) * 100)}%` }} />
                  <span className="w-full max-w-6 rounded-t-md bg-red-400" style={{ height: `${Math.max(co > 0 ? 4 : 0, (co / max) * 100)}%` }} />
                  <span className="text-[9px] font-bold tabular-nums text-red-500 leading-none">{co > 0 ? co : ''}</span>
                  <span className={`text-[10px] tabular-nums pb-0.5 ${isSel ? 'text-emerald-700 font-bold' : 'text-gray-400'}`}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchModal({ onClose, currency, rtl }: {
  onClose: () => void; currency: string | null | undefined; rtl: boolean;
}) {
  const today = dayStr(new Date());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [ran, setRan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<CashMovement[]>([]);
  const [stats, setStats] = useState({ count: 0, in_sum: 0, out_sum: 0, refund_sum: 0 });
  const { showToast } = useToast();

  const run = async () => {
    setBusy(true);
    try {
      const res = await listMovements({
        from: from || undefined,
        to: to || undefined,
        search: q.trim() || undefined,
        type,
      });
      setRows(res.data);
      setStats(res.stats);
      setRan(true);
    } catch {
      showToast(rtl ? 'فشل البحث' : 'Search failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const typeLabel = (t: string) =>
    t === 'payment' ? (rtl ? 'إيراد' : 'Income') : t === 'expense' ? (rtl ? 'مصروف' : 'Expense') : (rtl ? 'مرتجع' : 'Refund');
  const typeClass = (t: string) =>
    t === 'payment' ? 'text-emerald-600' : t === 'expense' ? 'text-red-500' : 'text-orange-500';

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={rtl ? 'بحث متقدم في الحركات' : 'Advanced movements search'}
      description={rtl ? 'بحث في الإيرادات والمصروفات والمرتجعات.' : 'Search income, expenses and refunds.'}
      footer={
        <button type="button" onClick={onClose}
          className="w-full rounded-xl border border-hairline py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted">
          {rtl ? 'إغلاق' : 'Close'}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <label className="block text-xs font-semibold text-gray-500">{rtl ? 'من' : 'From'}
            <input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full h-11 px-2 rounded-xl border border-gray-200 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-gray-500">{rtl ? 'إلى' : 'To'}
            <input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full h-11 px-2 rounded-xl border border-gray-200 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-gray-500 col-span-2">{rtl ? 'النوع' : 'Type'}
            <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full h-11 px-2 rounded-xl border border-gray-200 text-sm bg-white">
              <option value="all">{rtl ? 'الكل' : 'All'}</option>
              <option value="payment">{rtl ? 'إيرادات' : 'Income'}</option>
              <option value="expense">{rtl ? 'مصروفات' : 'Expenses'}</option>
              <option value="refund">{rtl ? 'مرتجعات' : 'Refunds'}</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
            placeholder={rtl ? 'ابحث في البيان أو اسم العضو…' : 'Search description or member…'}
            className="flex-1 h-12 md:h-11 px-4 text-base md:text-sm rounded-xl border border-gray-200 focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 outline-none"
          />
          <button type="button" onClick={run} disabled={busy}
            className="shrink-0 h-12 md:h-11 px-5 rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 disabled:opacity-50">
            {busy ? (rtl ? '…' : '…') : (rtl ? 'بحث' : 'Search')}
          </button>
        </div>
        {ran && (
          <>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-gray-100 px-3 py-1.5 tabular-nums">{stats.count} {rtl ? 'حركة' : 'moves'}</span>
              <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1.5 tabular-nums">+{formatMoney(stats.in_sum, currency)}</span>
              <span className="rounded-full bg-red-50 text-red-500 px-3 py-1.5 tabular-nums">−{formatMoney(stats.out_sum, currency)}</span>
              <span className="rounded-full bg-orange-50 text-orange-500 px-3 py-1.5 tabular-nums">↩ {formatMoney(stats.refund_sum, currency)}</span>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">{rtl ? 'لا نتائج مطابقة' : 'No matching results'}</p>
            ) : (
              <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto border border-gray-100 rounded-2xl">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-xs text-gray-400 tabular-nums shrink-0" dir="ltr">
                      {r.created_at ? `${String(r.created_at).slice(0, 10)} · ${formatTime(String(r.created_at))}` : '—'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-900 truncate">{r.description || '—'}</span>
                      <span className="block text-xs text-gray-400 truncate">
                        {typeLabel(r.type)}{r.member_name ? ` · ${r.member_name}` : ''}
                      </span>
                    </span>
                    <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${typeClass(r.type)}`}>
                      {formatMoney(Number(r.amount), currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ReportModal({ date, rows, currency, rtl, onClose }: {
  date: string; rows: CashMovement[]; currency: string | null | undefined; rtl: boolean; onClose: () => void;
}) {
  const { showToast } = useToast();
  const pin = rows.filter((r) => r.type === 'payment');
  const pout = rows.filter((r) => r.type === 'expense');
  const pref = rows.filter((r) => r.type === 'refund');
  const sum = (xs: CashMovement[]) => xs.reduce((t, r) => t + Number(r.amount), 0);
  const net = sum(pin) - sum(pout) - sum(pref);

  const print = () => {
    const sec = (title: string, xs: CashMovement[]) => xs.length === 0
      ? `<p class="muted">${title}: —</p>`
      : `<h2>${escapeHtml(title)} (${xs.length})</h2>
        <table><thead><tr><th>${escapeHtml(rtl ? 'الوقت' : 'Time')}</th><th>${escapeHtml(rtl ? 'البيان' : 'Description')}</th><th>${escapeHtml(rtl ? 'العضو' : 'Member')}</th><th>${escapeHtml(rtl ? 'المبلغ' : 'Amount')}</th></tr></thead>
        <tbody>${xs.map((r) => `<tr><td>${escapeHtml(r.created_at ? formatTime(String(r.created_at)) : '—')}</td><td>${escapeHtml(r.description || '—')}</td><td>${escapeHtml(r.member_name || '—')}</td><td>${escapeHtml(formatMoney(Number(r.amount), currency))}</td></tr>`).join('')}</tbody></table>`;
    const ok = printDocument({
      title: rtl ? `تقرير الخزنة ${date}` : `Cashbox report ${date}`,
      innerHtml: `
        <h1>${escapeHtml(rtl ? 'تقرير الخزنة' : 'Cashbox report')} — ${escapeHtml(date)}</h1>
        <p class="muted">${escapeHtml(rtl ? 'إيرادات' : 'Income')}: ${escapeHtml(formatMoney(sum(pin), currency))} (${pin.length}) ·
          ${escapeHtml(rtl ? 'مصروفات' : 'Expenses')}: ${escapeHtml(formatMoney(sum(pout), currency))} (${pout.length}) ·
          ${escapeHtml(rtl ? 'مرتجعات' : 'Refunds')}: ${escapeHtml(formatMoney(sum(pref), currency))} (${pref.length}) ·
          ${escapeHtml(rtl ? 'الصافي' : 'Net')}: ${escapeHtml(formatMoney(net, currency))}</p>
        ${sec(rtl ? 'إيرادات' : 'Income', pin)}
        ${sec(rtl ? 'مصروفات' : 'Expenses', pout)}
        ${sec(rtl ? 'مرتجعات' : 'Refunds', pref)}`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  const Block = ({ title, xs, color }: { title: string; xs: CashMovement[]; color: string }) => (
    <div>
      <p className="text-sm font-bold text-gray-900 mb-1.5">{title} ({xs.length})</p>
      {xs.length === 0 ? (
        <p className="text-xs text-gray-400">—</p>
      ) : (
        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
          {xs.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm rounded-xl bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-400 tabular-nums shrink-0" dir="ltr">
                {r.created_at ? formatTime(String(r.created_at)) : '—'}
              </span>
              <span className="flex-1 min-w-0 truncate text-gray-800">{r.description || '—'}</span>
              <span className={`font-bold tabular-nums whitespace-nowrap ${color}`}>{formatMoney(Number(r.amount), currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={rtl ? `تقرير الخزنة ${date}` : `Cashbox report ${date}`}
      description={rtl ? 'ملخص اليوم وحركاته، قابل للطباعة.' : 'Day summary and movements, printable.'}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">
            {rtl ? 'إغلاق' : 'Close'}
          </button>
          <button type="button" onClick={print}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 py-2.5 text-sm font-bold text-white hover:bg-gray-800">
            <span className="material-symbols-outlined text-lg">print</span>
            {rtl ? 'طباعة' : 'Print'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3 text-center">
            <p className="text-xs text-emerald-700 font-semibold">{rtl ? 'إيرادات' : 'Income'}</p>
            <p className="font-extrabold text-emerald-700 tabular-nums">{formatMoney(sum(pin), currency)}</p>
            <p className="text-[11px] text-emerald-600 tabular-nums">{pin.length} {rtl ? 'عملية' : 'ops'}</p>
          </div>
          <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-center">
            <p className="text-xs text-red-600 font-semibold">{rtl ? 'مصروفات' : 'Expenses'}</p>
            <p className="font-extrabold text-red-500 tabular-nums">{formatMoney(sum(pout), currency)}</p>
            <p className="text-[11px] text-red-400 tabular-nums">{pout.length} {rtl ? 'عملية' : 'ops'}</p>
          </div>
          <div className="rounded-2xl bg-orange-50 border border-orange-100 p-3 text-center">
            <p className="text-xs text-orange-600 font-semibold">{rtl ? 'مرتجعات' : 'Refunds'}</p>
            <p className="font-extrabold text-orange-500 tabular-nums">{formatMoney(sum(pref), currency)}</p>
            <p className="text-[11px] text-orange-400 tabular-nums">{pref.length} {rtl ? 'فاتورة' : 'bills'}</p>
          </div>
          <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3 text-center">
            <p className="text-xs text-sky-700 font-semibold">{rtl ? 'الصافي' : 'Net'}</p>
            <p className={`font-extrabold tabular-nums ${net >= 0 ? 'text-sky-700' : 'text-red-500'}`}>{formatMoney(net, currency)}</p>
            <p className="text-[11px] text-sky-600 tabular-nums">{rows.length} {rtl ? 'حركة' : 'moves'}</p>
          </div>
        </div>
        <Block title={rtl ? 'إيرادات' : 'Income'} xs={pin} color="text-emerald-600" />
        <Block title={rtl ? 'مصروفات' : 'Expenses'} xs={pout} color="text-red-500" />
        <Block title={rtl ? 'مرتجعات' : 'Refunds'} xs={pref} color="text-orange-500" />
      </div>
    </Modal>
  );
}

function RefundModal({ onClose, onDone, currency, rtl }: {
  onClose: () => void; onDone: () => void; currency: string | null | undefined; rtl: boolean;
}) {
  const { showToast } = useToast();
  const [q, setQ] = useState('');
  const [member, setMember] = useState<CheckInMemberHit | null>(null);
  const [hits, setHits] = useState<CheckInMemberHit[]>([]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);

  const search = async (v: string) => {
    setQ(v);
    setMember(null);
    if (v.trim().length < 2) { setHits([]); return; }
    try {
      setHits(await lookupMembersForCheckIn(v.trim()));
    } catch { setHits([]); }
  };

  const save = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) { showToast(rtl ? 'مبلغ غير صالح' : 'Invalid amount', 'error'); return; }
    if (reason.trim().length < 3) { showToast(rtl ? 'اكتب سبب المرتجع (3 أحرف على الأقل)' : 'Refund reason required (min 3 chars)', 'error'); return; }
    setBusy(true);
    try {
      await createRefund({ member_id: member?.id ?? null, amount: amt, description: reason.trim(), payment_method: method });
      showToast(rtl ? 'تم تسجيل المرتجع' : 'Refund recorded', 'success');
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || (rtl ? 'فشل تسجيل المرتجع' : 'Refund failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      disableDismiss={busy}
      title={rtl ? 'تسجيل مرتجع' : 'Record refund'}
      description={rtl ? 'يُخصم المرتجع من الدرج مباشرة.' : 'Deducted from the drawer immediately.'}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {rtl ? 'تراجع' : 'Back'}
          </button>
          <button type="button" onClick={save} disabled={busy}
            className="flex-1 rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">
            {busy ? (rtl ? 'جارٍ…' : '…') : (rtl ? 'تسجيل المرتجع' : 'Record refund')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'العضو (اختياري)' : 'Member (optional)'}</label>
          <input
            value={member ? member.full_name : q}
            onChange={(e) => search(e.target.value)}
            placeholder={rtl ? 'اسم / تليفون / كود…' : 'Name / phone / code…'}
            className="w-full h-12 md:h-11 px-4 text-base md:text-sm rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none"
          />
          {hits.length > 0 && !member && (
            <ul className="absolute z-20 mt-1 w-full rounded-xl border border-gray-100 bg-white shadow-lg max-h-48 overflow-auto py-1">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => { setMember(h); setHits([]); }}
                    className="w-full text-start px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900 truncate">{h.full_name}</span>
                    {h.phone_number && <span className="text-xs text-gray-500" dir="ltr">{h.phone_number}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {member && (
            <button type="button" onClick={() => { setMember(null); setQ(''); setHits([]); }}
              className="mt-1.5 text-xs font-bold text-gray-500 hover:text-gray-700">
              {rtl ? '× إلغاء اختيار العضو' : '× Clear member'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'المبلغ *' : 'Amount *'}</label>
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr"
              className="w-full h-12 md:h-11 px-4 text-base md:text-sm rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'الطريقة' : 'Method'}</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}
              className="w-full h-12 md:h-11 px-3 text-base md:text-sm rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none">
              {PAYMENT_METHODS.map((m) => <option key={m.code} value={m.code}>{m.ar}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'سبب المرتجع *' : 'Reason *'}</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder={rtl ? 'مثال: إلغاء حصة مدفوعة مقدما' : 'e.g. cancelled prepaid session'}
            className="w-full px-4 py-2.5 text-base md:text-sm rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none resize-none" />
        </div>
        {amount && Number(amount) > 0 && (
          <p className="text-sm text-gray-600 rounded-xl bg-orange-50 border border-orange-100 px-3.5 py-2.5">
            {rtl ? 'سيُخصم من الدرج:' : 'Deducted from drawer:'} <b className="text-orange-600 tabular-nums">{formatMoney(Number(amount), currency)}</b>
          </p>
        )}
      </div>
    </Modal>
  );
}
