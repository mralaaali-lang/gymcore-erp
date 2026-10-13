import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { formatMoney } from '../../utils/currency';
import { listCashboxSessions, openCashbox, closeCashbox, getFinanceSummary } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

interface CashboxSession {
  id: string;
  staff_name: string;
  staff_id?: string;
  opening_balance: number;
  closing_balance: number | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
  notes: string;
}

const inputClass =
  'w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

export default function CashboxShiftsPage() {
  const { language, gymProfile } = useApp();
  const queryClient = useQueryClient();
  const [closingBalance, setClosingBalance] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');

  const { data: sessionsData, isLoading, error } = useQuery({
    queryKey: ['cashbox-sessions'],
    queryFn: () => listCashboxSessions(),
    staleTime: 10_000,
  });

  const { data: financeData } = useQuery({
    queryKey: ['finance-summary'],
    queryFn: () => getFinanceSummary(),
    staleTime: 30_000,
  });

  const sessions: CashboxSession[] = sessionsData?.data || [];
  const openSession = sessions.find((s) => s.status === 'open');
  const completedShifts = sessions.filter((s) => s.status === 'closed');

  const closeMutation = useMutation({
    mutationFn: () => closeCashbox(openSession!.id, Number(closingBalance), shiftNotes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashbox-sessions'] });
      setClosingBalance('');
      setShiftNotes('');
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => openCashbox(0, shiftNotes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashbox-sessions'] });
      setClosingBalance('');
      setShiftNotes('');
    },
  });

  const isProcessing = closeMutation.isPending || reopenMutation.isPending;

  const handleShiftHandover = () => {
    if (openSession) {
      closeMutation.mutate();
    } else {
      reopenMutation.mutate();
    }
  };

  const formatCurrency = (v: number | null) =>
    v != null ? formatMoney(v, gymProfile?.currency) : '—';

  const formatDate = (d: string | null) =>
    d ? formatDateTime(d) : '—';

  if (isLoading) {
    return (
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
        <PageHeader title="تسليم الخزينة" icon="swap_horiz" />
        <PageLoader message={language === 'ar' ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    );
  }

  if (error) {
    return (
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
        <PageHeader title="تسليم الخزينة" icon="swap_horiz" />
        <Card className="text-center text-sm text-red-500">
          {language === 'ar' ? 'فشل تحميل بيانات تسليم الخزينة' : 'Failed to load shift handover data'}
        </Card>
      </div>
    );
  }

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
      <PageHeader
        title="تسليم الخزينة"
        subtitle={language === 'ar' ? 'تسليم الورديات بين الموظفين' : 'Shift handover between staff'}
        icon="swap_horiz"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl text-emerald-600">swap_horiz</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {language === 'ar' ? 'تسليم الوردية' : 'Shift Handover'}
            </h2>
          </div>

          {openSession ? (
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                <p className="text-sm text-orange-700 font-medium">
                  {language === 'ar' ? `الجلسة الحالية مفتوحة بواسطة ${openSession.staff_name}` : `Current session open by ${openSession.staff_name}`}
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  {language === 'ar' ? 'رصيد الافتتاح' : 'Opening balance'}: {formatCurrency(openSession.opening_balance)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ar' ? 'رصيد الإغلاق' : 'Closing Balance'}</label>
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
                  value={shiftNotes}
                  onChange={(e) => setShiftNotes(e.target.value)}
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder={language === 'ar' ? 'ملاحظات التسليم...' : 'Handover notes...'}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleShiftHandover}
                  disabled={isProcessing || !closingBalance}
                  className="px-6 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm shadow-red-500/25"
                >
                  {isProcessing ? '...' : (language === 'ar' ? 'إغلاق وتسليم' : 'Close & Handover')}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gray-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-gray-400 text-3xl">lock_open</span>
              </div>
              <p className="text-gray-500 text-sm mb-4">
                {language === 'ar' ? 'لا توجد جلسة مفتوحة حالياً' : 'No open session currently'}
              </p>
              <Button
                variant="primary"
                onClick={() => reopenMutation.mutate()}
                disabled={isProcessing}
              >
                {isProcessing ? '...' : (language === 'ar' ? 'فتح جلسة جديدة' : 'Open New Session')}
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl text-emerald-600">summarize</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {language === 'ar' ? 'ملخص مالي' : 'Finance Summary'}
            </h2>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded-2xl bg-gray-50 border border-gray-100">
              <span className="text-sm text-gray-500">{language === 'ar' ? 'إيرادات الشهر' : 'Monthly Revenue'}</span>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(financeData?.data?.monthly_revenue ?? null)}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-2xl bg-gray-50 border border-gray-100">
              <span className="text-sm text-gray-500">{language === 'ar' ? 'مصروفات الشهر' : 'Monthly Expenses'}</span>
              <span className="text-sm font-bold text-red-500">{formatCurrency(financeData?.data?.monthly_expenses ?? null)}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-2xl bg-gray-50 border border-gray-100">
              <span className="text-sm text-gray-500">{language === 'ar' ? 'مبيعات الشهر' : 'Monthly Sales'}</span>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(financeData?.data?.monthly_sales ?? null)}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-2xl bg-gray-50 border border-gray-100">
              <span className="text-sm text-gray-500">{language === 'ar' ? 'الديون المستحقة' : 'Outstanding Debts'}</span>
              <span className="text-sm font-bold text-red-500">{formatCurrency(financeData?.data?.outstanding_debts ?? null)}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {language === 'ar' ? 'الورديات المكتملة' : 'Completed Shifts'}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{language === 'ar' ? 'الموظف' : 'Staff'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{language === 'ar' ? 'رصيد الافتتاح' : 'Opening'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{language === 'ar' ? 'رصيد الإغلاق' : 'Closing'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{language === 'ar' ? 'الفرق' : 'Difference'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{language === 'ar' ? 'تاريخ الإغلاق' : 'Closed At'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{language === 'ar' ? 'ملاحظات' : 'Notes'}</th>
              </tr>
            </thead>
            <tbody>
              {completedShifts.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    {language === 'ar' ? 'لا توجد ورديات مكتملة' : 'No completed shifts'}
                  </td>
                </tr>
              )}
              {completedShifts.map((s) => {
                const diff = s.closing_balance != null && s.opening_balance != null
                  ? s.closing_balance - s.opening_balance
                  : null;
                return (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-900">{s.staff_name}</td>
                    <td className="p-4 text-gray-900">{formatCurrency(s.opening_balance)}</td>
                    <td className="p-4 text-gray-900">{formatCurrency(s.closing_balance)}</td>
                    <td className="p-4">
                      {diff != null ? (
                        <span className={`font-medium ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {diff >= 0 ? '+' : ''}{formatMoney(diff, gymProfile?.currency)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="p-4 text-gray-500 text-xs">{formatDate(s.closed_at)}</td>
                    <td className="p-4 text-gray-500 text-xs max-w-[160px] truncate">{s.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

