import { useState } from 'react';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listDebts, createDebt, payDebt, listMembers, type MemberResponse } from '../../../services/api';
import { formatMoney } from '../../../utils/currency';
import Button from '../../../components/ui/Button';
import PageLoader from '../../../components/shared/PageLoader';
import Card from '../../../components/ui/Card';
import StatusBadge from '../../../components/ui/StatusBadge';
import { Plus } from 'lucide-react';

// Debts panel — merged from DebtsPage (§26), the "Debts" tab of the Billing hub.
// Old route /admin/debts now deep-links here via ?tab=Debts.
interface DebtRow {
  id: string;
  member_name?: string;
  member_phone?: string;
  original_amount: number;
  remaining_amount: number;
  due_date: string;
  status: string;
  reason?: string;
  created_at?: string;
}

const statusAr: Record<string, string> = { active: 'نشط', paid: 'مدفوع', overdue: 'متأخر' };
const statusEn: Record<string, string> = { active: 'Active', paid: 'Paid', overdue: 'Overdue' };
const statusVariant = (status: string): 'success' | 'warning' | 'error' | 'neutral' =>
  status === 'paid' ? 'success' : status === 'overdue' ? 'error' : status === 'active' ? 'warning' : 'neutral';

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

export default function DebtsPanel() {
  const { language, gymProfile } = useApp();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency || 'EGP';
  const money = (n?: number) => (n == null ? '-' : formatMoney(Number(n), currency));
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<DebtRow | null>(null);

  const [memberId, setMemberId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reason, setReason] = useState('');
  const [payAmount, setPayAmount] = useState('');

  const { data: debtsRes, isLoading } = useApiQuery<{ data: DebtRow[] }>(
    ['debts'],
    () => listDebts(),
  );

  const { data: membersRes } = useQuery({
    queryKey: ['members-search', memberSearch],
    queryFn: () => listMembers({ search: memberSearch || undefined, limit: 10 }),
    enabled: showModal,
  });

  const createMutation = useMutation({
    mutationFn: (data: { member_id: string; amount: number; due_date: string; reason?: string }) =>
      createDebt(data),
    onSuccess: () => {
      showToast(rtl ? 'تم إضافة الدين' : 'Debt added', 'success');
      setShowModal(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: () => {
      showToast(rtl ? 'فشل إضافة الدين' : 'Failed to add debt', 'error');
    },
  });

  const payMutation = useMutation({
    mutationFn: (data: { id: string; amount: number }) => payDebt(data.id, data.amount),
    onSuccess: () => {
      showToast(rtl ? 'تم تسديد الدفعة' : 'Payment recorded', 'success');
      setShowPayModal(false);
      setSelectedDebt(null);
      setPayAmount('');
      queryClient.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: () => {
      showToast(rtl ? 'فشل تسديد الدفعة' : 'Failed to record payment', 'error');
    },
  });

  const resetForm = () => {
    setMemberId('');
    setMemberSearch('');
    setAmount('');
    setDueDate('');
    setReason('');
  };

  const handleCreate = () => {
    const parsed = parseFloat(amount);
    if (!memberId) {
      showToast(rtl ? 'اختر عضواً' : 'Select a member', 'warning');
      return;
    }
    if (!parsed || parsed <= 0) {
      showToast(rtl ? 'المبلغ مطلوب' : 'Amount is required', 'warning');
      return;
    }
    if (!dueDate) {
      showToast(rtl ? 'تاريخ الاستحقاق مطلوب' : 'Due date is required', 'warning');
      return;
    }
    createMutation.mutate({ member_id: memberId, amount: parsed, due_date: dueDate, reason: reason.trim() || undefined });
  };

  const handlePay = () => {
    if (!selectedDebt) return;
    const parsed = parseFloat(payAmount);
    if (!parsed || parsed <= 0) {
      showToast(rtl ? 'المبلغ مطلوب' : 'Amount is required', 'warning');
      return;
    }
    if (parsed > Number(selectedDebt.remaining_amount)) {
      showToast(rtl ? 'المبلغ أكبر من المتبقي' : 'Amount exceeds remaining', 'warning');
      return;
    }
    payMutation.mutate({ id: selectedDebt.id, amount: parsed });
  };

  const openPayModal = (debt: DebtRow) => {
    setSelectedDebt(debt);
    setPayAmount('');
    setShowPayModal(true);
  };

  const debts = debtsRes?.data || [];

  const isOverdue = (debt: DebtRow) => {
    if (debt.status === 'paid') return false;
    return new Date(debt.due_date) < new Date();
  };

  return (
    <div className="space-y-6">
      {/* Toolbar — the hub page owns the header, the panel owns its actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {rtl ? 'ديون الأعضاء وتسديداتها' : 'Member debts and repayments'}
        </p>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {rtl ? 'إضافة دين' : 'Add Debt'}
        </Button>
      </div>

      {isLoading ? (
        <PageLoader variant="skeleton" rows={5} />
      ) : debts.length === 0 ? (
        <Card className="text-center py-12">
          <span className="material-symbols-outlined text-5xl text-gray-500/30 block mb-3">payments</span>
          <p className="text-sm font-medium text-gray-500">{rtl ? 'لا توجد ديون' : 'No debts found'}</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'العضو' : 'Member'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الجوال' : 'Phone'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المبلغ الأصلي' : 'Original'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المتبقي' : 'Remaining'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {debts.map((d: DebtRow, i: number) => {
                  const overdue = isOverdue(d);
                  return (
                    <tr
                      key={d.id}
                      className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${overdue ? 'bg-red-50/50' : ''}`}
                    >
                      <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                      <td className={`px-4 py-3 font-medium ${overdue ? 'text-red-500' : 'text-gray-900'}`}>
                        <div className="flex items-center gap-2">
                          {d.member_name}
                          {overdue && <span className="material-symbols-outlined text-red-500 text-base">warning</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500" dir="ltr">{d.member_phone || '-'}</td>
                      <td className="px-4 py-3 text-gray-900" dir="ltr">{money(d.original_amount)}</td>
                      <td className={`px-4 py-3 font-medium ${overdue ? 'text-red-500' : 'text-gray-900'}`} dir="ltr">{money(d.remaining_amount)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs" dir="ltr">
                        {new Date(d.due_date).toLocaleDateString(rtl ? 'ar-EG' : 'en-US')}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={rtl ? statusAr[d.status] || d.status : statusEn[d.status] || d.status}
                          variant={statusVariant(overdue ? 'overdue' : d.status)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {d.status !== 'paid' && (
                          <button
                            onClick={() => openPayModal(d)}
                            className="inline-flex items-center px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold shadow-sm shadow-emerald-500/25 active:scale-[0.98] transition-all"
                          >
                            {rtl ? 'تسديد' : 'Pay'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                {rtl ? 'دين جديد' : 'New Debt'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {rtl ? 'بحث عن عضو' : 'Search Member'}
                </label>
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder={rtl ? 'اسم العضو أو رقم الجوال...' : 'Member name or phone...'}
                  className={`${inputClass} mb-2`}
                />
                {membersRes?.members && membersRes.members.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-2xl">
                    {membersRes.members.map((m: MemberResponse) => (
                      <button
                        key={m.id}
                        onClick={() => { setMemberId(m.id); setMemberSearch(m.full_name); }}
                        className={`w-full text-start px-4 py-2 text-sm text-gray-900 hover:bg-gray-50 transition-colors ${memberId === m.id ? 'bg-emerald-50' : ''}`}
                      >
                        {m.full_name} - {m.phone_number}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {rtl ? 'المبلغ' : 'Amount'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder={rtl ? 'المبلغ' : 'Amount'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {rtl ? 'تاريخ الاستحقاق' : 'Due Date'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {rtl ? 'السبب' : 'Reason'}
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder={rtl ? 'سبب الدين' : 'Reason for debt'}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="primary" fullWidth onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending && <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>}
                {rtl ? 'إضافة الدين' : 'Add Debt'}
              </Button>
              <Button variant="outline" onClick={() => setShowModal(false)}>
                {rtl ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showPayModal && selectedDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowPayModal(false)}>
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                {rtl ? 'تسديد دين' : 'Pay Debt'}
              </h2>
              <button onClick={() => setShowPayModal(false)} className="w-9 h-9 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-4 space-y-1">
              <p className="text-sm text-gray-500">
                {rtl ? 'العضو' : 'Member'}: <span className="font-medium text-gray-900">{selectedDebt.member_name}</span>
              </p>
              <p className="text-sm text-gray-500">
                {rtl ? 'المبلغ المتبقي' : 'Remaining'}: <span className="font-medium text-red-500">{money(selectedDebt.remaining_amount)}</span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {rtl ? 'مبلغ الدفعة' : 'Payment Amount'} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className={inputClass}
                placeholder={rtl ? 'مبلغ الدفعة' : 'Payment amount'}
              />
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="primary" fullWidth onClick={handlePay} disabled={payMutation.isPending}>
                {payMutation.isPending && <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>}
                {rtl ? 'تسديد' : 'Pay'}
              </Button>
              <Button variant="outline" onClick={() => setShowPayModal(false)}>
                {rtl ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
