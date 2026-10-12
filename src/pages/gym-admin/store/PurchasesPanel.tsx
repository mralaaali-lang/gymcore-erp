import { useState } from 'react';
import { useApp } from '../../../context/GymBrandContext';
import { formatMoney } from '../../../utils/currency';
import { useToast } from '../../../context/ToastContext';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPurchases,
  createPurchase,
  listProducts,
  listSuppliers,
  type ProductData,
} from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import StatusBadge from '../../../components/ui/StatusBadge';

// Purchases panel — merged from PurchasesPage (§23), the "purchases" tab of the
// Store hub. Manager-only: reception never renders this tab (endpoints 403).
interface PurchaseRow {
  id: string;
  supplier_name?: string;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
  notes?: string;
}

interface PurchaseItemRow {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

const paymentMethods = [
  { value: 'cash', labelAr: 'نقدي', labelEn: 'Cash' },
  { value: 'card', labelAr: 'بطاقة', labelEn: 'Card' },
  { value: 'wallet', labelAr: 'محفظة', labelEn: 'Wallet' },
  { value: 'bank', labelAr: 'تحويل بنكي', labelEn: 'Bank Transfer' },
];

const statusLabelsAr: Record<string, string> = { pending: 'قيد الانتظار', completed: 'مكتمل', cancelled: 'ملغي' };
const statusLabelsEn: Record<string, string> = { pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled' };
const statusVariant = (status: string): 'success' | 'warning' | 'error' | 'neutral' =>
  status === 'completed' ? 'success' : status === 'pending' ? 'warning' : status === 'cancelled' ? 'error' : 'neutral';

const inputClass =
  'w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

export default function PurchasesPanel() {
  const { language, gymProfile } = useApp();
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const rtl = language === 'ar';
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItemRow[]>([{ product_id: '', product_name: '', quantity: 1, unit_price: 0 }]);

  const { data: purchasesRes, isLoading } = useApiQuery<{ data: PurchaseRow[] }>(
    ['purchases'],
    () => listPurchases(),
  );

  const { data: productsRes } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => listProducts(),
    enabled: showModal,
  });

  const { data: suppliersRes } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: () => listSuppliers(),
    enabled: showModal,
  });

  const createMutation = useMutation({
    mutationFn: (data: { supplier_id?: string | null; items: { product_id: string; quantity: number; unit_price: number }[]; payment_method?: string; notes?: string }) =>
      createPurchase(data),
    onSuccess: () => {
      showToast(rtl ? 'تم إنشاء المشتريات' : 'Purchase created', 'success');
      setShowModal(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['products-all'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => {
      showToast(rtl ? 'فشل إنشاء المشتريات' : 'Failed to create purchase', 'error');
    },
  });

  const resetForm = () => {
    setSupplierId('');
    setPaymentMethod('cash');
    setNotes('');
    setItems([{ product_id: '', product_name: '', quantity: 1, unit_price: 0 }]);
  };

  const addItemRow = () => {
    setItems([...items, { product_id: '', product_name: '', quantity: 1, unit_price: 0 }]);
  };

  const removeItemRow = (idx: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof PurchaseItemRow, value: any) => {
    const updated = items.map((item, i) => {
      if (i !== idx) return item;
      const next = { ...item, [field]: value };
      if (field === 'product_id') {
        const product = productsRes?.data?.find((p: ProductData) => p.id === value);
        if (product) {
          next.product_name = product.name;
          next.unit_price = product.purchase_price;
        }
      }
      return next;
    });
    setItems(updated);
  };

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  const handleSubmit = () => {
    const validItems = items.filter((i) => i.product_id && i.quantity > 0);
    if (validItems.length === 0) {
      showToast(rtl ? 'أضف منتجاً واحداً على الأقل' : 'Add at least one product', 'warning');
      return;
    }
    createMutation.mutate({
      supplier_id: supplierId || null,
      items: validItems.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })),
      payment_method: paymentMethod,
      notes: notes || undefined,
    });
  };

  const purchases = purchasesRes?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setShowModal(true)}>
          <span className="material-symbols-outlined text-lg">add</span>
          {rtl ? 'إضافة مشتريات' : 'Add Purchase'}
        </Button>
      </div>

      {isLoading ? (
        <PageLoader variant="skeleton" rows={5} />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'المورد' : 'Supplier'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الإجمالي' : 'Total'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'طريقة الدفع' : 'Payment'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'التاريخ' : 'Date'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'ملاحظات' : 'Notes'}</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p: PurchaseRow, i: number) => (
                  <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-500">{i + 1}</td>
                    <td className="p-4 font-medium text-gray-900">{p.supplier_name || '-'}</td>
                    <td className="p-4 font-medium text-emerald-600">{money(p.total_amount)}</td>
                    <td className="p-4">
                      <StatusBadge
                        status={paymentMethods.find((pm) => pm.value === p.payment_method)
                          ? rtl
                            ? paymentMethods.find((pm) => pm.value === p.payment_method)!.labelAr
                            : paymentMethods.find((pm) => pm.value === p.payment_method)!.labelEn
                          : p.payment_method}
                        variant="neutral"
                      />
                    </td>
                    <td className="p-4">
                      <StatusBadge
                        status={rtl ? statusLabelsAr[p.status] || p.status : statusLabelsEn[p.status] || p.status}
                        variant={statusVariant(p.status)}
                      />
                    </td>
                    <td className="p-4 text-gray-500 text-xs" dir="ltr">
                      {new Date(p.created_at).toLocaleDateString(rtl ? 'ar-EG' : 'en-US')}
                    </td>
                    <td className="p-4 text-gray-500 text-xs max-w-[120px] truncate">{p.notes || '-'}</td>
                  </tr>
                ))}
                {purchases.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      {rtl ? 'لا توجد مشتريات' : 'No purchases found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 mx-4 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                {rtl ? 'مشتريات جديدة' : 'New Purchase'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {rtl ? 'المورد' : 'Supplier'}
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{rtl ? 'اختر المورد' : 'Select supplier'}</option>
                  {(suppliersRes?.data || []).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {rtl ? 'المنتجات' : 'Products'}
                  </label>
                  <button
                    onClick={addItemRow}
                    className="text-xs text-emerald-600 font-medium flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    {rtl ? 'إضافة صنف' : 'Add Item'}
                  </button>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-end mb-2">
                    <div className="flex-[2]">
                      <select
                        value={item.product_id}
                        onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                        className={inputClass}
                      >
                        <option value="">{rtl ? 'اختر منتجاً' : 'Select product'}</option>
                        {(productsRes?.data || []).map((p: ProductData) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({rtl ? 'شراء' : 'cost'}: {p.purchase_price})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-16">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-2 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 text-center focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 text-center focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="w-20 text-left text-sm font-medium text-gray-900 py-2">
                      {money(item.quantity * item.unit_price)}
                    </div>
                    {items.length > 1 && (
                      <button onClick={() => removeItemRow(idx)} className="text-red-500 p-1">
                        <span className="material-symbols-outlined text-lg">remove_circle</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between bg-gray-50 border border-gray-100 p-3 rounded-2xl">
                <span className="text-sm font-medium text-gray-900">
                  {rtl ? 'الإجمالي' : 'Total'}
                </span>
                <span className="text-lg font-bold text-emerald-600">{money(totalAmount)}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {rtl ? 'طريقة الدفع' : 'Payment Method'}
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className={inputClass}
                >
                  {paymentMethods.map((pm) => (
                    <option key={pm.value} value={pm.value}>
                      {rtl ? pm.labelAr : pm.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {rtl ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder={rtl ? 'ملاحظات إضافية...' : 'Additional notes...'}
                />
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
                {rtl ? 'حفظ المشتريات' : 'Save Purchase'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
              >
                {rtl ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
