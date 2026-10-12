import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { formatMoney } from '../../utils/currency';
import { listCashboxSessions, openCashbox, closeCashbox } from '../../services/api';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';
import { Plus } from 'lucide-react';

interface CashboxSession {
  id: string;
  staff_name: string;
  opening_balance: number;
  closing_balance: number | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
  notes: string;
}

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

export default function CashboxPage() {
  const { language, gymProfile } = useApp();
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState<CashboxSession | null>(null);
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [notes, setNotes] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['cashbox-sessions'],
    queryFn: () => listCashboxSessions(),
    staleTime: 10_000,
  });

  const sessions: CashboxSession[] = data?.data || [];

  const openMutation = useMutation({
    mutationFn: () => openCashbox(openingBalance ? Number(openingBalance) : undefined, notes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashbox-sessions'] });
      setOpenModal(false);
      setOpeningBalance('');
      setNotes('');
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => closeCashbox(closeModal!.id, Number(closingBalance), notes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashbox-sessions'] });
      setCloseModal(null);
      setClosingBalance('');
      setNotes('');
    },
  });

  const openSessionsToday = sessions.filter((s) => s.status === 'open');

  const formatCurrency = (v: number | null) =>
    v != null ? formatMoney(v, gymProfile?.currency) : '—';

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleString('ar-EG') : '—';

  if (isLoading) {
    return (
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
        <PageHeader title="الخزينة" icon="savings" />
        <PageLoader message={language === 'ar' ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    );
  }

  if (error) {
    return (
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
        <PageHeader title="الخزينة" icon="savings" />
        <Card className="text-center text-sm text-red-500">
          {language === 'ar' ? 'فشل تحميل بيانات الخزينة' : 'Failed to load cashbox data'}
        </Card>
      </div>
    );
  }

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
      <PageHeader
        title="الخزينة"
        subtitle={language === 'ar' ? 'جلسات الخزينة اليومية' : 'Daily cashbox sessions'}
        icon="savings"
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
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'الموظف' : 'Staff'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'رصيد الافتتاح' : 'Opening'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'رصيد الإغلاق' : 'Closing'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'تاريخ الافتتاح' : 'Opened At'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'تاريخ الإغلاق' : 'Closed At'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.staff_name}</td>
                    <td className="px-4 py-3 text-gray-900">{formatCurrency(s.opening_balance)}</td>
                    <td className="px-4 py-3 text-gray-900">{formatCurrency(s.closing_balance)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(s.opened_at)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(s.closed_at)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={s.status === 'open' ? (language === 'ar' ? 'مفتوحة' : 'Open') : (language === 'ar' ? 'مغلقة' : 'Closed')}
                        variant={s.status === 'open' ? 'success' : 'neutral'}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {s.status === 'open' && (
                        <button
                          onClick={() => { setCloseModal(s); setClosingBalance(''); setNotes(''); }}
                          className="text-red-500 hover:text-red-600 transition-colors text-sm font-medium"
                        >
                          {language === 'ar' ? 'إغلاق' : 'Close'}
                        </button>
                      )}
                      {s.status !== 'open' && (
                        <span className="text-gray-400 text-sm">{language === 'ar' ? '—' : '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
    </div>
  );
}

