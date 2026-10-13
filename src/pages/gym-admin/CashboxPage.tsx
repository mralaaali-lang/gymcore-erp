import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { formatMoney } from '../../utils/currency';
import {
  listCashboxSessions,
  openCashbox,
  closeCashbox,
  getCashSessionLedger,
  getCashbook,
  type CashboxSessionRow,
  type CashLedgerRow,
} from '../../services/api';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';
import { Plus } from 'lucide-react';

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

export default function CashboxPage() {
  const { language, gymProfile } = useApp();
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState<CashboxSessionRow | null>(null);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [journalDays, setJournalDays] = useState(7);
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [notes, setNotes] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['cashbox-sessions'],
    queryFn: () => listCashboxSessions(),
    staleTime: 10_000,
  });

  // §34ث — per-shift petty ledger, opened on demand from the sessions table
  const { data: ledgerRes, isLoading: ledgerLoading } = useQuery({
    queryKey: ['cash-ledger', ledgerId],
    queryFn: () => getCashSessionLedger(ledgerId!),
    enabled: !!ledgerId,
  });

  // §34ث — cash journal: daily cash in/out/net from the ledger, gym-local days
  const { data: journalRes } = useQuery({
    queryKey: ['cashbook', journalDays],
    queryFn: () => getCashbook(journalDays),
    staleTime: 30_000,
  });

  const sessions: CashboxSessionRow[] = data?.data || [];

  const openMutation = useMutation({
    mutationFn: () => openCashbox(openingBalance ? Number(openingBalance) : undefined, notes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashbox-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['cashbook'] });
      setOpenModal(false);
      setOpeningBalance('');
      setNotes('');
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => closeCashbox(closeModal!.id, Number(closingBalance), notes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashbox-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['cashbook'] });
      queryClient.invalidateQueries({ queryKey: ['cash-ledger'] });
      setCloseModal(null);
      setClosingBalance('');
      setNotes('');
    },
  });

  const openSessionsToday = sessions.filter((s) => s.status === 'open');

  // §34ث — server numeric aggregates arrive as strings (SUM) — coerce once here.
  const formatCurrency = (v: number | string | null | undefined) =>
    v != null && v !== '' ? formatMoney(Number(v), gymProfile?.currency) : '—';

  const ar = language === 'ar';

  const formatDate = (d: string | null) =>
    d ? formatDateTime(d) : '—';

  if (isLoading) {
    return (
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
        <PageLoader message={language === 'ar' ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    );
  }

  if (error) {
    return (
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
        <Card className="text-center text-sm text-red-500">
          {language === 'ar' ? 'فشل تحميل بيانات الخزينة' : 'Failed to load cashbox data'}
        </Card>
      </div>
    );
  }

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
      <PageHeader
        actions={
          <>
            <span className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 text-sm shadow-sm">
              <span className="text-amber-600 font-medium">
                {language === 'ar' ? 'جلسات مفتوحة اليوم' : 'Open sessions today'}: {openSessionsToday.length}
              </span>
            </span>
            <Button variant="primary" onClick={() => setOpenModal(true)} disabled={openSessionsToday.length > 0}>
              <Plus size={16} />
              فتح الخزينة
            </Button>
          </>
        }
      />
      {sessions.length === 0 ? (
        <Card className="text-center py-12">
          <span className="material-symbols-outlined text-5xl text-gray-500/30 block mb-3">savings</span>
          <p className="text-sm font-medium text-gray-500">{language === 'ar' ? 'لا توجد جلسات خزينة' : 'No cashbox sessions'}</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'الموظف' : 'Staff'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'رصيد الافتتاح' : 'Opening'}</th>
                  {/* §34ث — reconciliation straight from the ledger */}
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'مقبوضات' : 'Cash In'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'مدفوعات' : 'Cash Out'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'المتوقع' : 'Expected'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'رصيد الإغلاق' : 'Closing'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'الفرق' : 'Difference'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'تاريخ الافتتاح' : 'Opened At'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'الحالة' : 'Status'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const diff = s.difference != null && s.difference !== '' ? Number(s.difference) : null;
                  return (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.staff_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-900">{formatCurrency(s.opening_balance)}</td>
                    <td className="px-4 py-3 text-emerald-600">{formatCurrency(s.cash_in)}</td>
                    <td className="px-4 py-3 text-red-500">{formatCurrency(s.cash_out)}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{formatCurrency(s.expected_balance)}</td>
                    <td className="px-4 py-3 text-gray-900">{formatCurrency(s.closing_balance)}</td>
                    <td className="px-4 py-3">
                      {diff != null ? (
                        <span className={`font-medium ${diff === 0 ? 'text-gray-500' : diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {diff > 0 ? '+' : ''}{formatMoney(diff, gymProfile?.currency)}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(s.opened_at)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={s.status === 'open' ? (ar ? 'مفتوحة' : 'Open') : (ar ? 'مغلقة' : 'Closed')}
                        variant={s.status === 'open' ? 'success' : 'neutral'}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setLedgerId(s.id)}
                          className="text-emerald-600 hover:text-emerald-700 transition-colors text-sm font-medium"
                        >
                          {ar ? 'الدفتر' : 'Ledger'}
                        </button>
                        {s.status === 'open' ? (
                          <button
                            onClick={() => { setCloseModal(s); setClosingBalance(''); setNotes(''); }}
                            className="text-red-500 hover:text-red-600 transition-colors text-sm font-medium"
                          >
                            {ar ? 'إغلاق' : 'Close'}
                          </button>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* §34ث — cash journal (يومية الكاش): real per-day cash movement */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl text-emerald-600">book</span>
            </div>
            <h2 className="text-base font-bold text-gray-900">{ar ? 'يومية الكاش' : 'Cash Journal'}</h2>
          </div>
          <select
            value={journalDays}
            onChange={(e) => setJournalDays(Number(e.target.value))}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
            aria-label={ar ? 'عدد الأيام' : 'Days'}
          >
            <option value={7}>{ar ? 'آخر 7 أيام' : 'Last 7 days'}</option>
            <option value={14}>{ar ? 'آخر 14 يومًا' : 'Last 14 days'}</option>
            <option value={30}>{ar ? 'آخر 30 يومًا' : 'Last 30 days'}</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'التاريخ' : 'Date'}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'المقبوضات' : 'Cash In'}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'المدفوعات' : 'Cash Out'}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{ar ? 'الصافي' : 'Net'}</th>
              </tr>
            </thead>
            <tbody>
              {(journalRes?.data.rows ?? []).map((d) => (
                <tr key={d.date} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-gray-900" dir="ltr">{d.date}</td>
                  <td className="px-4 py-2.5 text-emerald-600">{formatCurrency(d.cash_in)}</td>
                  <td className="px-4 py-2.5 text-red-500">{formatCurrency(d.cash_out)}</td>
                  <td className={`px-4 py-2.5 font-medium ${Number(d.net) >= 0 ? 'text-gray-900' : 'text-red-500'}`}>{formatCurrency(d.net)}</td>
                </tr>
              ))}
              {journalRes && (
                <tr className="bg-gray-50 font-bold">
                  <td className="px-4 py-3 text-gray-900">{ar ? 'الإجمالي' : 'Total'}</td>
                  <td className="px-4 py-3 text-emerald-600">{formatCurrency(journalRes.data.totals.cash_in)}</td>
                  <td className="px-4 py-3 text-red-500">{formatCurrency(journalRes.data.totals.cash_out)}</td>
                  <td className="px-4 py-3 text-gray-900">{formatCurrency(journalRes.data.totals.net)}</td>
                </tr>
              )}
              {(!journalRes || journalRes.data.rows.length === 0) && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">{ar ? 'لا حركات كاش في هذه الفترة' : 'No cash movements in this period'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {openModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpenModal(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-gray-100" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{language === 'ar' ? 'فتح الخزينة' : 'Open Cashbox'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ar' ? 'رصيد الافتتاح' : 'Opening Balance'}</label>
                <input
                  type="number"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ar' ? 'ملاحظات' : 'Notes'}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`${inputClass} resize-none`}
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" fullWidth onClick={() => setOpenModal(false)}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button variant="primary" fullWidth onClick={() => openMutation.mutate()} disabled={openMutation.isPending || openSessionsToday.length > 0}>
                {openMutation.isPending ? '...' : (language === 'ar' ? 'فتح' : 'Open')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {closeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setCloseModal(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-gray-100" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{language === 'ar' ? 'إغلاق الخزينة' : 'Close Cashbox'}</h2>
            <div className="space-y-4">
              {/* §34ث — show what the drawer SHOULD contain before counting it */}
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">{ar ? 'الافتتاحي' : 'Opening'}</span><span className="font-medium text-gray-900">{formatCurrency(closeModal.opening_balance)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{ar ? 'مقبوضات' : 'Cash in'}</span><span className="font-medium text-emerald-600">+{formatCurrency(closeModal.cash_in)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{ar ? 'مدفوعات' : 'Cash out'}</span><span className="font-medium text-red-500">−{formatCurrency(closeModal.cash_out)}</span></div>
                <div className="flex justify-between border-t border-gray-200 mt-2 pt-2"><span className="font-semibold text-gray-700">{ar ? 'المتوقع بالأدراج' : 'Expected in drawer'}</span><span className="font-bold text-gray-900">{formatCurrency(closeModal.expected_balance)}</span></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{ar ? 'رصيد الإغلاق (المعدود فعليًا)' : 'Closing Balance (actual count)'}</label>
                <input
                  type="number"
                  value={closingBalance}
                  onChange={(e) => setClosingBalance(e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ar' ? 'ملاحظات' : 'Notes'}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`${inputClass} resize-none`}
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" fullWidth onClick={() => setCloseModal(null)}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <button
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending || !closingBalance}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm shadow-red-500/25"
              >
                {closeMutation.isPending ? '...' : (language === 'ar' ? 'إغلاق' : 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* §34ث — centered per-session ledger modal (دفتر الوردية) */}
      {ledgerId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setLedgerId(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-xl border border-gray-100" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{ar ? 'دفتر الوردية' : 'Shift Ledger'}</h2>
              <button onClick={() => setLedgerId(null)} className="w-9 h-9 rounded-xl hover:bg-gray-50 text-gray-500 flex items-center justify-center" aria-label={ar ? 'إغلاق' : 'Close'}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {ledgerLoading ? (
              <div className="py-8 text-center text-gray-400 text-sm">{ar ? 'جاري التحميل...' : 'Loading...'}</div>
            ) : !ledgerRes ? (
              <div className="py-8 text-center text-red-500 text-sm">{ar ? 'فشل تحميل الدفتر' : 'Failed to load ledger'}</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3">
                    <p className="text-gray-500 text-xs">{ar ? 'الموظف' : 'Staff'}</p>
                    <p className="font-bold text-gray-900 truncate">{ledgerRes.data.session.staff_name ?? '—'}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3">
                    <p className="text-gray-500 text-xs">{ar ? 'الافتتاحي' : 'Opening'}</p>
                    <p className="font-bold text-gray-900">{formatCurrency(ledgerRes.data.session.opening_balance)}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
                    <p className="text-emerald-700 text-xs">{ar ? 'مقبوضات' : 'Cash In'}</p>
                    <p className="font-bold text-emerald-700">{formatCurrency(ledgerRes.data.session.cash_in)}</p>
                  </div>
                  <div className="rounded-2xl bg-red-50 border border-red-100 p-3">
                    <p className="text-red-600 text-xs">{ar ? 'مدفوعات' : 'Cash Out'}</p>
                    <p className="font-bold text-red-600">{formatCurrency(ledgerRes.data.session.cash_out)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto border border-gray-100 rounded-2xl">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{ar ? 'النوع' : 'Type'}</th>
                        <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{ar ? 'البيان' : 'Description'}</th>
                        <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{ar ? 'الطرف' : 'Party'}</th>
                        <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{ar ? 'التاريخ' : 'When'}</th>
                        <th className="text-end px-4 py-2.5 text-xs font-semibold text-gray-500">{ar ? 'المبلغ' : 'Amount'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerRes.data.rows.map((row: CashLedgerRow) => (
                        <tr key={row.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${row.type === 'payment' ? 'text-emerald-600' : 'text-red-500'}`}>
                              <span className="material-symbols-outlined text-sm">{row.type === 'payment' ? 'arrow_downward' : 'arrow_upward'}</span>
                              {row.type === 'payment' ? (ar ? 'وارد' : 'In') : (ar ? 'صادر' : 'Out')}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-900">{row.description ?? '—'}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{row.party ?? '—'}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                          <td className={`px-4 py-2.5 text-end font-bold ${row.type === 'payment' ? 'text-emerald-600' : 'text-red-500'}`}>
                            {row.type === 'payment' ? '+' : '−'}{formatCurrency(row.amount)}
                          </td>
                        </tr>
                      ))}
                      {ledgerRes.data.rows.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">{ar ? 'لا حركات في هذه الوردية' : 'No movements in this shift'}</td></tr>
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

