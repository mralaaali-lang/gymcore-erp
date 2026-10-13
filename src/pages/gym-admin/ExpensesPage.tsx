import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { formatDate } from '../../utils/date';
import { formatMoney } from '../../utils/currency';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listExpenses, createExpense, listExpenseCategories, getFinanceSummary } from '../../services/api';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';
import { Plus } from 'lucide-react';

interface ExpenseRow {
  id: string;
  amount: number;
  description: string;
  category_name?: string;
  staff_name?: string;
  created_at: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
}

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

export default function ExpensesPage() {
  const { language, gymProfile } = useApp();
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const { data: expensesRes, isLoading } = useApiQuery<{ data: ExpenseRow[] }>(
    ['expenses'],
    () => listExpenses(),
  );

  const { data: summaryRes } = useApiQuery<any>(['finance-summary'], () => getFinanceSummary());

  const { data: categoriesRes } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => listExpenseCategories(),
    enabled: showModal,
  });

  const createMutation = useMutation({
    mutationFn: (data: { amount: number; description: string; category_id?: string | null }) =>
      createExpense(data),
    onSuccess: () => {
      showToast(language === 'ar' ? 'تم إضافة المصروف' : 'Expense added', 'success');
      setShowModal(false);
      setAmount('');
      setDescription('');
      setCategoryId('');
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
    onError: () => {
      showToast(language === 'ar' ? 'فشل إضافة المصروف' : 'Failed to add expense', 'error');
    },
  });

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      showToast(language === 'ar' ? 'المبلغ مطلوب' : 'Amount is required', 'warning');
      return;
    }
    if (!description.trim()) {
      showToast(language === 'ar' ? 'الوصف مطلوب' : 'Description is required', 'warning');
      return;
    }
    createMutation.mutate({
      amount: parsed,
      description: description.trim(),
      category_id: categoryId || null,
    });
  };

  const expenses = expensesRes?.data || [];
  const monthlyExpenses = summaryRes?.data?.monthly_expenses ?? 0;
  const categories = categoriesRes?.data || [];

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
      <PageHeader
        title={language === 'ar' ? 'المصروفات' : 'Expenses'}
        subtitle={language === 'ar' ? 'تتبع مصروفات النادي' : 'Track gym expenses'}
        icon="receipt_long"
        actions={
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <Plus size={16} />
            {language === 'ar' ? 'إضافة مصروف' : 'Add Expense'}
          </Button>
        }
      />
      <StatsGrid
        columns={4}
        stats={[
          { key: 'monthly', label: language === 'ar' ? 'مصروفات الشهر' : 'Monthly Expenses', value: money(monthlyExpenses), icon: 'receipt_long', color: 'error' },
        ]}
      />

      {isLoading ? (
        <PageLoader variant="skeleton" rows={5} />
      ) : expenses.length === 0 ? (
        <Card className="text-center py-12">
          <span className="material-symbols-outlined text-5xl text-gray-500/30 block mb-3">receipt_long</span>
          <p className="text-sm font-medium text-gray-500">{language === 'ar' ? 'لا توجد مصروفات' : 'No expenses found'}</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'الوصف' : 'Description'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'التصنيف' : 'Category'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'الموظف' : 'Staff'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e: ExpenseRow, i: number) => (
                  <tr key={e.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-red-500">{money(e.amount)}</td>
                    <td className="px-4 py-3 text-gray-900">{e.description}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={e.category_name || '-'} variant="neutral" />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{e.staff_name || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs" dir="ltr">
                      {formatDate(e.created_at)}
                    </td>
                  </tr>
                ))}
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
                {language === 'ar' ? 'مصروف جديد' : 'New Expense'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ar' ? 'المبلغ' : 'Amount'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder={language === 'ar' ? 'المبلغ' : 'Amount'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ar' ? 'الوصف' : 'Description'} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder={language === 'ar' ? 'وصف المصروف' : 'Expense description'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ar' ? 'التصنيف' : 'Category'}
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{language === 'ar' ? 'اختر التصنيف' : 'Select category'}</option>
                  {categories.map((cat: ExpenseCategory) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="primary"
                fullWidth
                onClick={handleSubmit}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>}
                {language === 'ar' ? 'حفظ' : 'Save'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

