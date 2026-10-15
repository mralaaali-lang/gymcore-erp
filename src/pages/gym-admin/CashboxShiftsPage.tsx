import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '../../utils/date';
import { fmtNum } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../utils/currency';
import {
  listCashboxSessions, openCashbox, closeCashbox, getCashSessionLedger, getShiftReport,
  listStaff, type CashboxSessionRow, type CashLedgerRow, type ShiftReport,
} from '../../services/api';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';

const inputClass =
  'w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

/** Local YYYY-MM-DD. */
function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Reference format: YYYY/MM/DD hh:mm AM/PM (browser-local wall clock). */
function fmtDT12(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(h12)}:${pad(d.getMinutes())} ${h24 < 12 ? 'AM' : 'PM'}`;
}

// ====================================================================
// صفحة الشيفتات (إعادة بناء بمواصفة صاحب المشروع — نسخة نظام الكاشير):
// رابط الخزنة + إجراءات → بانر الفتح/التسليم → فلتر (من/إلى/موظف) →
// سجل الشيفتات (15 عمودًا بطرق الدفع والفرق الملون) → تقرير إقفال طباعي
// inline (view برابط ?report=) يُطبع بـ window.print مع CSS يخفي الشيل.
// الشيفت = وردية كاشير: فتح بمبلغ → حركات → إقفال بعدّ فعلي → فرق محسوب.
// ====================================================================

export default function CashboxShiftsPage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency;
  const gymName = gymProfile?.name;

  const today = useMemo(() => dayStr(new Date()), []);
  const monthStart = useMemo(() => dayStr(new Date()).slice(0, 8) + '01', []);

  const [closingBalance, setClosingBalance] = useState('');
  const [openingAmount, setOpeningAmount] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [ledgerId, setLedgerId] = useState<string | null>(null);

  // فلتر السجل — مسودات لا تُطبق إلا بزر البحث.
  const [draftFrom, setDraftFrom] = useState(monthStart);
  const [draftTo, setDraftTo] = useState(today);
  const [draftStaff, setDraftStaff] = useState('');
  const [applied, setApplied] = useState({ from: monthStart, to: today, staff: '' });

  const reportId = params.get('report');

  const { data: sessionsData, isLoading, error } = useQuery({
    queryKey: ['cashbox-sessions', applied.from, applied.to, applied.staff],
    queryFn: () => listCashboxSessions({
      from: applied.from || undefined,
      to: applied.to || undefined,
      staff_id: applied.staff || undefined,
    }),
    staleTime: 10_000,
  });

  const { data: staffRes } = useQuery({
    queryKey: ['staff-list'],
    queryFn: () => listStaff(),
    staleTime: 60_000,
  });
  const staffList = (staffRes as unknown as { data?: { id: string; full_name?: string; name?: string }[] })?.data ?? [];

  const { data: ledgerRes, isLoading: ledgerLoading } = useQuery({
    queryKey: ['cash-ledger', ledgerId],
    queryFn: () => getCashSessionLedger(ledgerId!),
    enabled: !!ledgerId,
  });

  const { data: reportRes, isLoading: reportLoading } = useQuery({
    queryKey: ['shift-report', reportId],
    queryFn: () => getShiftReport(reportId!),
    enabled: !!reportId,
    staleTime: 30_000,
  });

  const sessions: CashboxSessionRow[] = sessionsData?.data || [];
  const openSession = sessions.find((s) => s.status === 'open');
  const report: ShiftReport | undefined = reportRes?.data;

  // وضع الطباعة: إخفاء الشيل أثناء window.print().
  useEffect(() => {
    if (reportId) document.body.classList.add('shift-printing');
    else document.body.classList.remove('shift-printing');
    return () => document.body.classList.remove('shift-printing');
  }, [reportId]);

  const closeMutation = useMutation({
    mutationFn: () => closeCashbox(openSession!.id, Number(closingBalance), shiftNotes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashbox-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['cashbook'] });
      queryClient.invalidateQueries({ queryKey: ['gym', 'finance', 'summary'] });
      setClosingBalance('');
      setShiftNotes('');
      showToast(rtl ? 'تم إغلاق الوردية' : 'Shift closed', 'success');
    },
    onError: () => showToast(rtl ? 'فشل الإغلاق' : 'Close failed', 'error'),
  });

  const openMutation = useMutation({
    mutationFn: () => openCashbox(openingAmount ? Number(openingAmount) : 0, shiftNotes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashbox-sessions'] });
      setOpeningAmount('');
      setShiftNotes('');
      showToast(rtl ? 'تم فتح شيفت جديد' : 'New shift opened', 'success');
    },
    onError: () => showToast(rtl ? 'فشل فتح الشيفت' : 'Open failed', 'error'),
  });

  const isProcessing = closeMutation.isPending || openMutation.isPending;

  // §34ث — server numeric aggregates arrive as strings (SUM) — coerce once here.
  const formatCurrency = (v: number | string | null | undefined) =>
    v != null && v !== '' ? formatMoney(Number(v), currency) : '—';

  const closeReport = () => {
    const next = new URLSearchParams(params);
    next.delete('report');
    setParams(next, { replace: true });
  };

  if (isLoading) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
        <PageLoader message={rtl ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    );
  }

  if (error) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
        <Card className="text-center text-sm text-red-500">
          {rtl ? 'فشل تحميل بيانات الشيفتات' : 'Failed to load shifts data'}
        </Card>
      </div>
    );
  }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-5 bg-gray-50 min-h-screen -m-6 p-6">
      {/* رابط الخزنة (أزرار حصة/بيع/عضو حُذفت بطلب صاحب المشروع) */}
      <div className="flex items-center gap-2 flex-wrap no-print">
        <button
          type="button"
          onClick={() => navigate('/admin/cashbox')}
          className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-sm font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
        >
          <span className="material-symbols-outlined text-lg">store</span>
          {rtl ? 'الخزنة' : 'Cashbox'}
        </button>
      </div>

      {reportId ? (
        <ShiftReportView
          report={report}
          loading={reportLoading}
          gymName={gymName}
          rtl={rtl}
          onClose={closeReport}
        />
      ) : (
        <>
          {/* البانر: لا شيفت مفتوح → فتح بمبلغ / شيفت مفتوح → تسليم */}
          {!openSession ? (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm px-6 py-10 text-center">
              <span className="material-symbols-outlined text-5xl text-gray-300">lock_open</span>
              <p className="text-xl font-extrabold text-gray-900 mt-3">
                {rtl ? 'لا يوجد شيفت مفتوح' : 'No open shift'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {rtl ? 'افتح شيفت جديد لبدء تتبع الحركات المالية' : 'Open a new shift to start tracking money movements'}
              </p>
              <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
                <button
                  type="button"
                  onClick={() => openMutation.mutate()}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-1.5 h-12 px-6 rounded-2xl text-sm font-bold bg-white border-2 border-gray-200 text-gray-800 hover:border-emerald-400 hover:text-emerald-700 transition disabled:opacity-50 min-w-[140px]"
                >
                  <span className="material-symbols-outlined text-xl">door_open</span>
                  {isProcessing ? '…' : (rtl ? 'فتح شيفت' : 'Open shift')}
                </button>
                <input
                  type="number"
                  min={0}
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0"
                  aria-label={rtl ? 'المبلغ الافتتاحي' : 'Opening amount'}
                  className="h-12 w-40 px-4 rounded-2xl border-2 border-gray-200 bg-white text-base text-gray-900 text-center tabular-nums focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
          ) : (
            <Card>
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4">
                <p className="text-sm text-orange-700 font-medium">
                  {rtl ? `شيفت مفتوح بواسطة ${openSession.staff_name ?? '—'}` : `Shift open by ${openSession.staff_name ?? '—'}`} #{openSession.shift_no ?? '—'}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="rounded-xl bg-white/70 border border-orange-100 p-2">
                    <p className="text-[11px] text-orange-600">{rtl ? 'مقبوضات' : 'Cash In'}</p>
                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(openSession.cash_in)}</p>
                  </div>
                  <div className="rounded-xl bg-white/70 border border-orange-100 p-2">
                    <p className="text-[11px] text-orange-600">{rtl ? 'مدفوعات' : 'Cash Out'}</p>
                    <p className="text-sm font-bold text-red-500">{formatCurrency(openSession.cash_out)}</p>
                  </div>
                  <div className="rounded-xl bg-white/70 border border-orange-100 p-2">
                    <p className="text-[11px] text-orange-600">{rtl ? 'المتوقع' : 'Expected'}</p>
                    <p className="text-sm font-bold text-gray-900">{formatCurrency(openSession.expected_balance)}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'رصيد الإغلاق (المعدود فعليًا)' : 'Closing Balance'}</label>
                  <input type="number" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'ملاحظات التسليم' : 'Notes'}</label>
                  <input value={shiftNotes} onChange={(e) => setShiftNotes(e.target.value)} className={inputClass} placeholder={rtl ? '…' : '…'} />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => closeMutation.mutate()}
                  disabled={isProcessing || !closingBalance}
                  className="px-6 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm shadow-red-500/25"
                >
                  {isProcessing ? '...' : (rtl ? 'إغلاق وتسليم' : 'Close & Handover')}
                </button>
                <button
                  onClick={() => setLedgerId(openSession.id)}
                  className="px-6 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all"
                >
                  {rtl ? 'الدفتر' : 'Ledger'}
                </button>
              </div>
            </Card>
          )}

          {/* كارت الفلتر */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 flex items-end gap-3 flex-wrap">
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
              {rtl ? 'من تاريخ' : 'From'}
              <input type="date" value={draftFrom} max={draftTo} onChange={(e) => setDraftFrom(e.target.value)}
                className="h-11 min-w-[150px] px-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
              {rtl ? 'إلى تاريخ' : 'To'}
              <input type="date" value={draftTo} min={draftFrom} max={today} onChange={(e) => setDraftTo(e.target.value)}
                className="h-11 min-w-[150px] px-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
              {rtl ? 'الموظف' : 'Staff'}
              <select value={draftStaff} onChange={(e) => setDraftStaff(e.target.value)}
                className="h-11 min-w-[150px] px-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 outline-none">
                <option value="">{rtl ? 'الكل' : 'All'}</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name ?? s.name ?? s.id.slice(0, 8)}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setApplied({ from: draftFrom, to: draftTo, staff: draftStaff })}
              className="inline-flex items-center gap-1.5 h-11 px-6 rounded-xl text-sm font-bold bg-sky-600 text-white hover:bg-sky-700 transition ms-auto min-h-[44px]"
            >
              <span className="material-symbols-outlined text-lg">search</span>
              {rtl ? 'بحث' : 'Search'}
            </button>
          </div>

          {/* سجل الشيفتات */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-900">{rtl ? 'سجل الشيفتات' : 'Shift log'}</h2>
              <span className="ms-auto inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 tabular-nums">
                {sessions.length} {rtl ? 'شيفت' : 'shifts'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-start">
                    {[
                      rtl ? 'الموظف' : 'Staff',
                      rtl ? 'الفتح' : 'Opened',
                      rtl ? 'الإقفال' : 'Closed',
                      rtl ? 'الافتتاحي' : 'Opening',
                      rtl ? 'إيرادات' : 'Income',
                      rtl ? 'مصروفات' : 'Expenses',
                      rtl ? 'نقدي' : 'Cash',
                      rtl ? 'فيزا' : 'Card',
                      rtl ? 'محفظة' : 'Wallet',
                      rtl ? 'انستاباي' : 'Instapay',
                      rtl ? 'المتوقع' : 'Expected',
                      rtl ? 'الفعلي' : 'Actual',
                      rtl ? 'الفرق' : 'Diff',
                      rtl ? 'الحالة' : 'Status',
                    ].map((h) => (
                      <th key={h} className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                    <th className="py-3 px-3 w-12"><span className="sr-only">{rtl ? 'طباعة' : 'Print'}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 && (
                    <tr><td colSpan={15} className="p-10 text-center text-gray-400 text-sm">
                      {rtl ? 'لا شيفتات في هذا النطاق' : 'No shifts in this range'}
                    </td></tr>
                  )}
                  {sessions.map((s) => {
                    const diff = s.difference != null && (s.difference as unknown as string) !== '' ? Number(s.difference) : null;
                    const open = s.status === 'open';
                    return (
                      <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-3 font-medium text-gray-900 text-start whitespace-nowrap">{s.staff_name ?? '—'}</td>
                        <td className="py-3 px-3 text-gray-600 text-xs text-start whitespace-nowrap" dir="ltr">{fmtDT12(s.opened_at)}</td>
                        <td className="py-3 px-3 text-gray-600 text-xs text-start whitespace-nowrap" dir="ltr">{s.closed_at ? fmtDT12(s.closed_at) : '—'}</td>
                        <td className="py-3 px-3 text-gray-900 text-start tabular-nums whitespace-nowrap">{formatCurrency(s.opening_balance)}</td>
                        <td className="py-3 px-3 text-emerald-600 text-start tabular-nums whitespace-nowrap">{formatCurrency(s.income_total ?? s.cash_in)}</td>
                        <td className="py-3 px-3 text-red-500 text-start tabular-nums whitespace-nowrap">{formatCurrency(s.expense_total ?? s.cash_out)}</td>
                        <td className="py-3 px-3 text-gray-700 text-start tabular-nums whitespace-nowrap">{formatCurrency(s.m_cash)}</td>
                        <td className="py-3 px-3 text-gray-700 text-start tabular-nums whitespace-nowrap">{formatCurrency(s.m_visa)}</td>
                        <td className="py-3 px-3 text-gray-700 text-start tabular-nums whitespace-nowrap">{formatCurrency(s.m_wallet)}</td>
                        <td className="py-3 px-3 text-gray-700 text-start tabular-nums whitespace-nowrap">{formatCurrency(s.m_instapay)}</td>
                        <td className="py-3 px-3 text-gray-900 font-medium text-start tabular-nums whitespace-nowrap">{formatCurrency(s.expected_balance)}</td>
                        <td className="py-3 px-3 text-gray-900 text-start tabular-nums whitespace-nowrap">{formatCurrency(s.closing_balance)}</td>
                        <td className="py-3 px-3 text-start tabular-nums whitespace-nowrap">
                          {diff != null ? (
                            <span className={`font-bold ${diff === 0 ? 'text-gray-500' : diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {diff > 0 ? '+' : ''}{formatMoney(diff, currency)}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-3 px-3 text-start">
                          <StatusBadge
                            status={open ? (rtl ? 'مفتوح' : 'Open') : (rtl ? 'مقفل' : 'Closed')}
                            variant={open ? 'success' : 'neutral'}
                          />
                        </td>
                        <td className="py-3 px-3 text-start">
                          <button
                            type="button"
                            title={rtl ? 'طباعة تقرير الشيفت' : 'Print shift report'}
                            onClick={() => {
                              const next = new URLSearchParams(params);
                              next.set('report', s.id);
                              setParams(next);
                            }}
                            className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition min-w-[44px] min-h-[44px]"
                          >
                            <span className="material-symbols-outlined text-xl">print</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* دفتر الوردية */}
      {ledgerId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setLedgerId(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-xl border border-gray-100" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{rtl ? 'دفتر الوردية' : 'Shift Ledger'}</h2>
              <button onClick={() => setLedgerId(null)} className="w-9 h-9 rounded-xl hover:bg-gray-50 text-gray-500 flex items-center justify-center" aria-label={rtl ? 'إغلاق' : 'Close'}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {ledgerLoading ? (
              <div className="py-8 text-center text-gray-400 text-sm">{rtl ? 'جاري التحميل...' : 'Loading...'}</div>
            ) : !ledgerRes ? (
              <div className="py-8 text-center text-red-500 text-sm">{rtl ? 'فشل تحميل الدفتر' : 'Failed to load ledger'}</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3">
                    <p className="text-gray-500 text-xs">{rtl ? 'الموظف' : 'Staff'}</p>
                    <p className="font-bold text-gray-900 truncate">{ledgerRes.data.session.staff_name ?? '—'}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3">
                    <p className="text-gray-500 text-xs">{rtl ? 'الافتتاحي' : 'Opening'}</p>
                    <p className="font-bold text-gray-900">{formatCurrency(ledgerRes.data.session.opening_balance)}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
                    <p className="text-emerald-700 text-xs">{rtl ? 'مقبوضات' : 'Cash In'}</p>
                    <p className="font-bold text-emerald-700">{formatCurrency(ledgerRes.data.session.cash_in)}</p>
                  </div>
                  <div className="rounded-2xl bg-red-50 border border-red-100 p-3">
                    <p className="text-red-600 text-xs">{rtl ? 'مدفوعات' : 'Cash Out'}</p>
                    <p className="font-bold text-red-600">{formatCurrency(ledgerRes.data.session.cash_out)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto border border-gray-100 rounded-2xl">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{rtl ? 'النوع' : 'Type'}</th>
                        <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{rtl ? 'البيان' : 'Description'}</th>
                        <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{rtl ? 'الطرف' : 'Party'}</th>
                        <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{rtl ? 'التاريخ' : 'When'}</th>
                        <th className="text-end px-4 py-2.5 text-xs font-semibold text-gray-500">{rtl ? 'المبلغ' : 'Amount'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerRes.data.rows.map((row: CashLedgerRow) => {
                        const tone = row.type === 'payment' ? 'text-emerald-600' : row.type === 'refund' ? 'text-orange-500' : 'text-red-500';
                        const label = row.type === 'payment' ? (rtl ? 'وارد' : 'In') : row.type === 'refund' ? (rtl ? 'مرتجع' : 'Refund') : (rtl ? 'صادر' : 'Out');
                        const icon = row.type === 'payment' ? 'arrow_downward' : row.type === 'refund' ? 'sync' : 'arrow_upward';
                        return (
                          <tr key={row.id} className="border-b border-gray-100 last:border-0">
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${tone}`}>
                                <span className="material-symbols-outlined text-sm">{icon}</span>
                                {label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-900">{row.description ?? '—'}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{row.party ?? '—'}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                            <td className={`px-4 py-2.5 text-end font-bold ${tone}`}>
                              {row.type === 'payment' ? '+' : '−'}{formatCurrency(row.amount)}
                            </td>
                          </tr>
                        );
                      })}
                      {ledgerRes.data.rows.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">{rtl ? 'لا حركات في هذه الوردية' : 'No movements in this shift'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ====================================================================
// كارت تقرير الإقفال الطباعي — view برابط (?report=) يُطبع بـ window.print.
// ====================================================================
function ShiftReportView({ report, loading, gymName, rtl, onClose }: {
  report?: ShiftReport; loading: boolean; gymName?: string | null; rtl: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.classList.add('shift-printing');
    return () => document.body.classList.remove('shift-printing');
  }, []);

  const egp = (v: number | string | null | undefined) =>
    `${fmtNum(Number(v ?? 0))} ${rtl ? 'جنيه' : 'EGP'}`;

  if (loading) {
    return <Card><p className="py-10 text-center text-sm text-gray-400">{rtl ? 'جاري التحميل...' : 'Loading...'}</p></Card>;
  }
  if (!report) {
    return <Card><p className="py-10 text-center text-sm text-red-500">{rtl ? 'تعذر تحميل التقرير' : 'Report failed to load'}</p></Card>;
  }
  const s = report.session;
  const no = s.shift_no ?? '—';
  const diff = s.difference != null && (s.difference as unknown as string) !== '' ? Number(s.difference) : null;
  const signed = (v: number | string | null | undefined) => {
    const n = Number(v ?? 0);
    return `${n > 0 ? '+' : ''}${fmtNum(n)} ${rtl ? 'جنيه' : 'EGP'}`;
  };

  return (
    <div className="shift-print bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      {/* 1) الهيدر الكحلي */}
      <div className="flex items-center gap-3 px-5 py-3.5" style={{ background: '#1b2f4b' }}>
        <span className="material-symbols-outlined text-2xl text-white">print</span>
        <h2 className="text-base font-extrabold text-white">
          {rtl ? `تقرير الشيفت #${no}` : `Shift report #${no}`}
        </h2>
        <div className="ms-auto flex items-center gap-2 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-bold transition"
            style={{ background: '#efe8d5', color: '#5b4a1e' }}
          >
            <span className="material-symbols-outlined text-lg">print</span>
            {rtl ? 'طباعة' : 'Print'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-bold bg-white text-gray-700 hover:bg-gray-100 transition"
          >
            <span className="material-symbols-outlined text-lg">close</span>
            {rtl ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>

      {/* 2) الترويسة الرسمية */}
      <div className="text-center px-5 pt-5">
        <p className="text-2xl font-extrabold text-gray-900">{gymName || '—'}</p>
        <p className="text-xs text-gray-500 mt-1">{rtl ? `تقرير الشيفت #${no}` : `Shift report #${no}`}</p>
      </div>

      <div className="p-5 space-y-4">
        {/* 3) جدولان: معلومات + ملخص */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-gray-200 overflow-hidden">
            <p className="px-4 py-2.5 bg-gray-50 text-sm font-bold text-gray-900 border-b border-gray-100">
              {rtl ? 'معلومات الشيفت' : 'Shift info'}
            </p>
            <InfoRow k={rtl ? 'الموظف' : 'Staff'} v={s.staff_name ?? '—'} />
            <InfoRow k={rtl ? 'بداية' : 'Opened'} v={fmtDT12(s.opened_at)} ltr />
            <InfoRow k={rtl ? 'نهاية' : 'Closed'} v={s.closed_at ? fmtDT12(s.closed_at) : (rtl ? 'مفتوح' : 'Open')} ltr={!!s.closed_at} />
            <InfoRow k={rtl ? 'الافتتاحي' : 'Opening'} v={egp(s.opening_balance)} last />
          </div>
          <div className="rounded-2xl border border-gray-200 overflow-hidden">
            <p className="px-4 py-2.5 bg-gray-50 text-sm font-bold text-gray-900 border-b border-gray-100">
              {rtl ? 'الملخص المالي' : 'Money summary'}
            </p>
            <InfoRow k={rtl ? 'الإيرادات' : 'Income'} v={egp(report.ops ? sumOf(report, 'in') : s.income_total)} vClass="text-emerald-600" bold />
            <InfoRow k={rtl ? 'المصروفات' : 'Expenses'} v={egp(report.ops ? sumOf(report, 'out') : s.expense_total)} vClass="text-red-500" bold />
            <InfoRow k={rtl ? 'الصافي' : 'Net'} v={signed(netOf(report))} bold />
            <InfoRow k={rtl ? 'الرصيد المتوقع' : 'Expected'} v={egp(s.expected_balance)} />
            <InfoRow k={rtl ? 'رصيد الإقفال' : 'Closing'} v={s.closing_balance != null ? egp(s.closing_balance) : '—'} />
            <InfoRow
              k={rtl ? 'الفرق' : 'Difference'} last
              v={diff == null ? '—' : signed(diff)}
              vClass={diff == null ? undefined : diff === 0 ? 'text-gray-500' : diff > 0 ? 'text-emerald-600' : 'text-red-500'}
              bold
            />
          </div>
        </div>

        {/* 4) الإيرادات بطرق الدفع */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MethodCard icon="payments" bg="bg-emerald-50" border="border-emerald-200" text="text-emerald-700" label={rtl ? 'نقدي' : 'Cash'} value={egp(s.m_cash)} title={rtl ? 'نقدي' : 'cash'} />
          <MethodCard icon="credit_card" bg="bg-sky-50" border="border-sky-200" text="text-sky-700" label={rtl ? 'فيزا-بطاقة' : 'Card'} value={egp(s.m_visa)} title={rtl ? 'بطاقة + فيزا' : 'card + visa'} />
          <MethodCard icon="wallet" bg="bg-amber-50" border="border-amber-200" text="text-amber-700" label={rtl ? 'محفظة' : 'Wallet'} value={egp(s.m_wallet)} title={rtl ? 'محفظة + فودافون كاش' : 'wallet + vodafone'} />
          <MethodCard icon="smartphone" bg="bg-orange-50" border="border-orange-200" text="text-orange-700" label={rtl ? 'انستاباي' : 'Instapay'} value={egp(s.m_instapay)} title={rtl ? 'انستاباي + تحويل' : 'instapay + bank'} />
        </div>

        {/* 5) تفصيل العمليات */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <p className="px-4 py-2.5 bg-gray-50 text-sm font-bold text-gray-900 border-b border-gray-100">
            {rtl ? 'تفصيل العمليات' : 'Operations breakdown'}
          </p>
          <OpsRow rtl={rtl} label={rtl ? 'اشتراكات وتجديدات ودفعات' : 'Subs & payments'} n={report.ops.subs_count} v={egp(report.ops.subs_sum)} />
          <OpsRow rtl={rtl} label={rtl ? 'مبيعات منتجات' : 'Product sales'} n={report.ops.sales_count} v={egp(report.ops.sales_sum)} />
          <OpsRow rtl={rtl} label={rtl ? 'مصروفات عامة' : 'General expenses'} n={report.ops.gen_exp_count} v={egp(report.ops.gen_exp_sum)} red />
          <OpsRow rtl={rtl} label={rtl ? 'رواتب موظفين' : 'Staff salaries'} n={report.salaries.pay_count} v={egp(report.salaries.pay_sum)} red />
          <OpsRow rtl={rtl} label={rtl ? 'مرتجعات' : 'Refunds'} n={report.ops.refund_count} v={egp(report.ops.refund_sum)} orange last />
        </div>
      </div>
    </div>
  );
}

function sumOf(r: ShiftReport, kind: 'in' | 'out'): number | string {
  return kind === 'in' ? r.session.income_total ?? r.session.cash_in : r.session.expense_total ?? r.session.cash_out;
}
function netOf(r: ShiftReport): number {
  const ops = r.ops;
  return Number(ops.subs_sum) + Number(ops.sales_sum) - Number(ops.gen_exp_sum) - Number(r.salaries.pay_sum) - Number(ops.refund_sum);
}

function InfoRow({ k, v, vClass, bold, last, ltr }: {
  k: string; v: string; vClass?: string; bold?: boolean; last?: boolean; ltr?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 px-4 py-2 ${last ? '' : 'border-b border-gray-100'}`}>
      <span className="text-xs text-gray-500">{k}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-extrabold' : 'font-semibold'} ${vClass ?? 'text-gray-900'}`} dir={ltr ? 'ltr' : undefined}>{v}</span>
    </div>
  );
}

function MethodCard({ icon, bg, border, text, label, value, title }: {
  icon: string; bg: string; border: string; text: string; label: string; value: string; title: string;
}) {
  return (
    <div title={title} className={`rounded-2xl border ${border} ${bg} p-4 text-center`}>
      <span className={`material-symbols-outlined text-3xl ${text}`}>{icon}</span>
      <p className={`text-xs font-semibold mt-1 ${text}`}>{label}</p>
      <p className={`text-base font-extrabold tabular-nums mt-0.5 ${text}`}>{value}</p>
    </div>
  );
}

function OpsRow({ rtl, label, n, v, red, orange, last }: {
  rtl: boolean; label: string; n: number | string; v: string; red?: boolean; orange?: boolean; last?: boolean;
}) {
  const c = red ? 'text-red-500' : orange ? 'text-orange-500' : 'text-gray-900';
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 ${last ? '' : 'border-b border-gray-100'}`}>
      <span className="text-sm text-gray-700 flex-1">{label}</span>
      <span className="text-xs text-gray-400 tabular-nums">{n} {rtl ? 'عملية' : 'ops'}</span>
      <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${c}`}>{v}</span>
    </div>
  );
}
