import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { getFinanceSummary, listPayments, createPayment, listMembers } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import { Plus } from 'lucide-react';

const inputClass =
  'w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

export default function FinancialReports() {
  const { language } = useApp();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'payments' | 'summary'>('payments');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ member_id: '', amount: 0, description: '', payment_method: 'cash' });

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['finance-summary'],
    queryFn: getFinanceSummary,
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => listPayments(),
  });

  const { data: membersData } = useQuery({
    queryKey: ['members'],
    queryFn: () => listMembers(),
  });

  const createMut = useMutation({
    mutationFn: createPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      setShowForm(false);
      setForm({ member_id: '', amount: 0, description: '', payment_method: 'cash' });
    },
  });

  const summary = summaryData?.data;
  const payments = paymentsData?.data || [];
  const members = membersData?.members || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMut.mutate(form);
  };

  const methodLabels: Record<string, string> = { cash: 'نقدي', card: 'بطاقة', bank: 'تحويل بنكي', wallet: 'محفظة' };
  const methodIcons: Record<string, string> = { cash: 'payments', card: 'credit_card', bank: 'account_balance', wallet: 'wallet' };
  const statusLabels: Record<string, string> = { completed: 'مكتمل', pending: 'معلق', failed: 'فاشل' };
  const statusVariant = (status: string): 'success' | 'warning' | 'error' | 'neutral' =>
    status === 'completed' ? 'success' : status === 'pending' ? 'warning' : status === 'failed' ? 'error' : 'neutral';

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
      <PageHeader
        title="التقارير المالية"
        subtitle={language === 'ar' ? 'المدفوعات والملخص المالي' : 'Payments and financial summary'}
        icon="bar_chart"
        actions={
          tab === 'payments' ? (
            <Button variant="primary" onClick={() => setShowForm(!showForm)}>
              <Plus size={16} />إضافة دفعة
            </Button>
          ) : undefined
        }
      />
      {summaryLoading && <PageLoader message="جاري التحميل..." />}

      {summary && (
        <StatsGrid
          columns={4}
          stats={[
            { key: 'revenue', label: 'إيرادات الشهر', value: `${summary.monthly_revenue?.toLocaleString()} ر.س`, icon: 'wallet', color: 'primary' },
            { key: 'expenses', label: 'مصروفات الشهر', value: `${summary.monthly_expenses?.toLocaleString()} ر.س`, icon: 'receipt_long', color: 'error' },
            { key: 'debts', label: 'الديون المستحقة', value: `${summary.outstanding_debts?.toLocaleString()} ر.س`, icon: 'credit_card', color: 'info' },
            { key: 'sales', label: 'عدد المبيعات', value: summary.monthly_sales || 0, icon: 'shopping_bag', color: 'secondary' },
          ]}
        />
      )}

      <UnifiedTabs
        tabs={[
          { key: 'payments', labelAr: 'المدفوعات', labelEn: 'Payments', icon: 'receipt_long' },
          { key: 'summary', labelAr: 'ملخص', labelEn: 'Summary', icon: 'bar_chart' },
        ]}
        activeKey={tab}
        onChange={(key) => setTab(key as 'payments' | 'summary')}
      />

      {tab === 'payments' && (
        <>
          {showForm && (
            <Card>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xl text-emerald-600">add</span>
                </div>
                <h2 className="text-lg font-bold text-gray-900">إضافة دفعة</h2>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">المشترك</label>
                    <select value={form.member_id} onChange={(e) => setForm({ ...form, member_id: e.target.value })} className={inputClass} required>
                      <option value="">اختر مشترك</option>
                      {members.map((m: any) => (
                        <option key={m.id} value={m.id}>{m.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ</label>
                    <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} className={inputClass} min="0" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">طريقة الدفع</label>
                    <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className={inputClass}>
                      <option value="cash">نقدي</option>
                      <option value="card">بطاقة</option>
                      <option value="bank">تحويل بنكي</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
                    <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
                  </div>
                </div>
                <Button variant="primary" type="submit">إضافة</Button>
              </form>
            </Card>
          )}

          {paymentsLoading && <PageLoader message="جاري التحميل..." />}
          {!paymentsLoading && payments.length === 0 && (
            <Card className="text-center py-12">
              <span className="material-symbols-outlined text-5xl text-gray-500/30 block mb-3">receipt_long</span>
              <p className="text-sm font-medium text-gray-500">لا توجد مدفوعات</p>
            </Card>
          )}

          {!paymentsLoading && payments.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">#</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">التاريخ</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">المشترك</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">المبلغ</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">الوسيلة</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p: any, i: number) => (
                      <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                        <td className="px-4 py-3 text-gray-500">{p.created_at ? new Date(p.created_at).toLocaleDateString('ar-EG') : '-'}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.member_name || p.member?.full_name || '-'}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.amount?.toLocaleString()} ر.س</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 text-gray-500">
                            <span className="material-symbols-outlined text-sm">{methodIcons[p.payment_method] || 'payments'}</span>
                            {methodLabels[p.payment_method] || p.payment_method}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={statusLabels[p.status] || p.status} variant={statusVariant(p.status)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'summary' && summary && (
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl text-emerald-600">bar_chart</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">ملخص مالي</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">الإيرادات</p>
              <p className="text-2xl font-bold text-emerald-600">{summary.monthly_revenue?.toLocaleString()} ر.س</p>
            </div>
            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">المصروفات</p>
              <p className="text-2xl font-bold text-red-500">{summary.monthly_expenses?.toLocaleString()} ر.س</p>
            </div>
            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">الديون</p>
              <p className="text-2xl font-bold text-emerald-600">{summary.outstanding_debts?.toLocaleString()} ر.س</p>
            </div>
            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">المبيعات</p>
              <p className="text-2xl font-bold text-gray-900">{summary.monthly_sales || 0}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

