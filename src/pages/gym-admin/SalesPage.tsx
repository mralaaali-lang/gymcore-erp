import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { formatMoney } from '../../utils/currency';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSales,
  createSale,
  listProducts,
  listMembers,
  getFinanceSummary,
  listExpenses,
  type ProductData,
  type MemberResponse,
} from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';

interface SaleRow {
  id: string; member_name?: string; staff_name?: string;
  total_amount: number; payment_method: string; created_at: string;
}
interface SaleItemRow {
  product_id: string; product_name: string; quantity: number; unit_price: number;
}

const POS_TABS = ['Create Sale', 'Sales', 'Products', 'Report', 'Settings'] as const;
type PosTab = typeof POS_TABS[number];
const TAB_LABEL: Record<PosTab, { en: string; ar: string }> = {
  'Create Sale': { en: 'Create Sale', ar: 'إنشاء فاتورة' },
  'Sales': { en: 'Sales', ar: 'المبيعات' },
  'Products': { en: 'Products', ar: 'المنتجات' },
  'Report': { en: 'Report', ar: 'التقارير' },
  'Settings': { en: 'Settings', ar: 'الإعدادات' },
};
const TAB_ICONS: Record<PosTab, string> = {
  'Create Sale': 'add_shopping_cart',
  'Sales': 'point_of_sale',
  'Products': 'inventory',
  'Report': 'bar_chart',
  'Settings': 'settings',
};

const paymentMethods = [
  { value: 'cash', labelAr: 'نقدي', labelEn: 'Cash' },
  { value: 'card', labelAr: 'بطاقة', labelEn: 'Card' },
  { value: 'wallet', labelAr: 'محفظة', labelEn: 'Wallet' },
];

const inputClass =
  'w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

export default function SalesPage() {
  const { language, gymProfile } = useApp();
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const [activeTab, setActiveTab] = useState<PosTab>('Create Sale');
  const [page, setPage] = useState(1);

  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [items, setItems] = useState<SaleItemRow[]>([{ product_id: '', product_name: '', quantity: 1, unit_price: 0 }]);

  const { data: salesRes, isLoading } = useApiQuery<{ data: SaleRow[]; pagination: any }>(['sales', String(page)], () => listSales(page));
  const { data: summaryRes } = useApiQuery<any>(['finance-summary'], () => getFinanceSummary());
  const { data: productsRes } = useQuery({ queryKey: ['products-all'], queryFn: () => listProducts(), enabled: activeTab === 'Create Sale' || activeTab === 'Products' });
  const { data: membersRes } = useQuery({ queryKey: ['members-search', memberSearch], queryFn: () => listMembers({ search: memberSearch || undefined, limit: 10 }), enabled: activeTab === 'Create Sale' });
  const { data: expensesRes } = useApiQuery<any>(['expenses'], () => listExpenses());

  const createMutation = useMutation({
    mutationFn: (data: { member_id?: string | null; items: { product_id: string; quantity: number }[]; payment_method?: string }) => createSale(data),
    onSuccess: () => {
      showToast(rtl ? 'تم إنشاء الفاتورة' : 'Invoice created', 'success');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
    onError: () => showToast(rtl ? 'فشل إنشاء الفاتورة' : 'Failed to create invoice', 'error'),
  });

  const resetForm = () => { setSelectedMemberId(''); setMemberSearch(''); setPaymentMethod('cash'); setItems([{ product_id: '', product_name: '', quantity: 1, unit_price: 0 }]); };
  const addItemRow = () => setItems([...items, { product_id: '', product_name: '', quantity: 1, unit_price: 0 }]);
  const removeItemRow = (idx: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); };
  const updateItem = (idx: number, field: keyof SaleItemRow, value: any) => {
    setItems(items.map((item, i) => {
      if (i !== idx) return item;
      const next = { ...item, [field]: value };
      if (field === 'product_id') {
        const product = productsRes?.data?.find((p: ProductData) => p.id === value);
        if (product) { next.product_name = product.name; next.unit_price = product.selling_price; }
      }
      return next;
    }));
  };
  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  const handleSubmit = () => {
    const validItems = items.filter((i) => i.product_id && i.quantity > 0);
    if (validItems.length === 0) { showToast(rtl ? 'أضف منتجاً واحداً على الأقل' : 'Add at least one product', 'warning'); return; }
    createMutation.mutate({ member_id: selectedMemberId || null, items: validItems.map((i) => ({ product_id: i.product_id, quantity: i.quantity })), payment_method: paymentMethod });
  };

  const sales = salesRes?.data || [];
  const pagination = salesRes?.pagination;
  const totalPages = pagination ? Math.ceil(pagination.total / 20) : 1;
  const monthlySales = summaryRes?.data?.monthly_sales ?? 0;
  const products = productsRes?.data || [];
  const totalExpenses = ((expensesRes?.data || []) as any[]).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  const renderCreateSale = () => (
    <div className="max-w-2xl mx-auto">
      <Card className="space-y-4">
        <h3 className="text-base font-bold text-gray-900">{rtl ? 'فاتورة جديدة' : 'New Sale'}</h3>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">{rtl ? 'بحث عن عضو' : 'Search Member'}</label>
          <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
            placeholder={rtl ? 'اسم العضو أو رقم الجوال...' : 'Member name or phone...'}
            className={`${inputClass} mb-2`} />
          {membersRes?.members && membersRes.members.length > 0 && (
            <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-2xl">
              {membersRes.members.map((m: MemberResponse) => (
                <button key={m.id} onClick={() => { setSelectedMemberId(m.id); setMemberSearch(m.full_name); }}
                  className={`w-full text-right px-4 py-2 text-sm text-gray-900 hover:bg-gray-50 transition-colors ${selectedMemberId === m.id ? 'bg-emerald-50' : ''}`}>
                  {m.full_name} - {m.phone_number}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-900">{rtl ? 'المنتجات' : 'Products'}</span>
            <div className="flex gap-2">
              <button onClick={addItemRow} className="px-3 py-1.5 border border-emerald-200 text-emerald-600 rounded-xl text-xs font-semibold hover:bg-emerald-50 transition flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">add</span>
                {rtl ? 'إضافة منتج' : 'ADD A PRODUCT'}
              </button>
              <button onClick={addItemRow} className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-50 transition flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">edit_note</span>
                {rtl ? 'إضافة بند' : 'ADD LINE ITEM'}
              </button>
            </div>
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-center mb-2">
              <div className="flex-1">
                <select value={item.product_id} onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">{rtl ? 'اختر منتجاً' : 'Select product'}</option>
                  {products.map((p: ProductData) => <option key={p.id} value={p.id}>{p.name} — {money(p.selling_price)}</option>)}
                </select>
              </div>
              <input type="number" min="1" value={item.quantity}
                onChange={(e) => updateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 px-2 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <span className="w-20 text-left text-sm font-semibold text-gray-900">{money(item.quantity * item.unit_price)}</span>
              {items.length > 1 && (
                <button onClick={() => removeItemRow(idx)} className="text-red-500 p-1"><span className="material-symbols-outlined text-lg">remove_circle</span></button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-2xl p-3">
          <span className="text-sm font-semibold text-gray-900">{rtl ? 'الإجمالي' : 'Total'}</span>
          <span className="text-xl font-bold text-emerald-600">{money(totalAmount)}</span>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">{rtl ? 'طريقة الدفع' : 'Payment Method'}</label>
          <div className="flex gap-2">
            {paymentMethods.map((pm) => (
              <button key={pm.value} onClick={() => setPaymentMethod(pm.value)}
                className={`flex-1 px-4 py-2.5 rounded-2xl text-sm font-medium border transition ${
                  paymentMethod === pm.value ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}>
                {rtl ? pm.labelAr : pm.labelEn}
              </button>
            ))}
          </div>
        </div>

        <Button variant="primary" fullWidth onClick={handleSubmit} disabled={createMutation.isPending}>
          {createMutation.isPending
            ? <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
            : <span className="material-symbols-outlined text-lg">receipt_long</span>}
          {createMutation.isPending ? (rtl ? 'جاري الحفظ...' : 'Saving...') : (rtl ? 'إتمام البيع' : 'COMPLETE SALE')}
        </Button>
      </Card>
    </div>
  );

  const renderSalesList = () => (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{rtl ? 'إجمالي المبيعات' : 'Monthly Sales'}: <span className="font-bold text-emerald-600 text-lg">{monthlySales}</span></p>
      </div>
      {isLoading ? <PageLoader variant="skeleton" rows={5} /> : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'العضو' : 'Member'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الموظف' : 'Staff'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الإجمالي' : 'Total'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الدفع' : 'Payment'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'التاريخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s: SaleRow, i: number) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-500">{(page - 1) * 20 + i + 1}</td>
                    <td className="p-4 font-medium text-gray-900">{s.member_name || '-'}</td>
                    <td className="p-4 text-gray-500">{s.staff_name || '-'}</td>
                    <td className="p-4 font-bold text-emerald-600">{money(s.total_amount)}</td>
                    <td className="p-4">
                      <StatusBadge
                        status={paymentMethods.find((pm) => pm.value === s.payment_method) ? (rtl ? paymentMethods.find((pm) => pm.value === s.payment_method)!.labelAr : paymentMethods.find((pm) => pm.value === s.payment_method)!.labelEn) : s.payment_method}
                        variant="neutral"
                      />
                    </td>
                    <td className="p-4 text-gray-500 text-xs" dir="ltr">{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {sales.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-500/50">{rtl ? 'لا توجد مبيعات' : 'No sales found'}</td></tr>}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-gray-100">
              <span className="text-sm text-gray-500">{rtl ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                  {rtl ? 'السابق' : 'Previous'}
                </Button>
                <Button variant="outline" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
                  {rtl ? 'التالي' : 'Next'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );

  const renderProducts = () => (
    <Card>
      <h3 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'المنتجات' : 'Products'}</h3>
      {products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map((p: ProductData) => (
            <div key={p.id} className="border border-gray-100 rounded-2xl p-4 hover:shadow-sm transition bg-gray-50">
              <p className="text-sm font-semibold text-gray-900">{p.name}</p>
              <p className="text-xs text-gray-500 mt-1">{rtl ? 'المخزون' : 'Stock'}: {p.stock_quantity}</p>
              <p className="text-sm font-bold text-emerald-600 mt-2">{money(p.selling_price)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500/60">
          <span className="material-symbols-outlined text-4xl block mb-2">inventory</span>
          <p className="text-sm">{rtl ? 'لا توجد منتجات' : 'No products'}</p>
        </div>
      )}
    </Card>
  );

  const renderReport = () => (
    <StatsGrid
      columns={3}
      stats={[
        { key: 'sales', label: rtl ? 'إجمالي المبيعات' : 'Total Sales', value: monthlySales, icon: 'point_of_sale', color: 'primary' },
        { key: 'expenses', label: rtl ? 'إجمالي المصروفات' : 'Total Expenses', value: money(totalExpenses), icon: 'receipt_long', color: 'error' },
        { key: 'profit', label: rtl ? 'صافي الربح' : 'Net Profit', value: money(monthlySales - totalExpenses), icon: 'payments', color: 'info' },
      ]}
    />
  );

  const renderPlaceholder = (tab: PosTab) => (
    <Card className="p-12 text-center">
      <span className="material-symbols-outlined text-5xl text-gray-500/30 block mb-3">settings</span>
      <p className="text-gray-500 font-medium">{rtl ? TAB_LABEL[tab].ar : TAB_LABEL[tab].en}</p>
      <p className="text-sm text-gray-500/60 mt-1">{rtl ? 'قيد التطوير' : 'Coming soon'}</p>
    </Card>
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
      <PageHeader
        title={rtl ? 'نقطة البيع' : 'Point of Sale'}
        subtitle={rtl ? 'المبيعات والمنتجات' : 'Sales & merchandise'}
        icon="point_of_sale"
      />

      <UnifiedTabs
        tabs={POS_TABS.map((tab) => ({
          key: tab,
          labelAr: TAB_LABEL[tab].ar,
          labelEn: TAB_LABEL[tab].en,
          icon: TAB_ICONS[tab],
        }))}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as PosTab)}
      />

      {activeTab === 'Create Sale' && renderCreateSale()}
      {activeTab === 'Sales' && renderSalesList()}
      {activeTab === 'Products' && renderProducts()}
      {activeTab === 'Report' && renderReport()}
      {activeTab === 'Settings' && renderPlaceholder('Settings')}
    </div>
  );
}
