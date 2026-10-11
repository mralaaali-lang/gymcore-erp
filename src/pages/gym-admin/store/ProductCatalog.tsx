import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { listProducts, createProduct, updateProduct, deleteProduct } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';

// Product catalog — merged from InventoryManagement (§23), now the "products"
// tab of the Store hub. Served to both gym-admin and reception (POS stock view).
interface ProductForm {
  name: string;
  barcode: string;
  stock_quantity: number;
  purchase_price: number;
  selling_price: number;
}

const emptyForm: ProductForm = { name: '', barcode: '', stock_quantity: 0, purchase_price: 0, selling_price: 0 };

const inputClass =
  'w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

export default function ProductCatalog() {
  const { language } = useApp();
  const rtl = language === 'ar';
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ['products', search],
    queryFn: () => listProducts(search || undefined),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['products-all'] });
  };

  const createMut = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      showToast(rtl ? 'تم إضافة المنتج' : 'Product added', 'success');
      invalidate();
      closeForm();
    },
    onError: () => showToast(rtl ? 'فشل إضافة المنتج' : 'Failed to add product', 'error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductForm> }) => updateProduct(id, data),
    onSuccess: () => {
      showToast(rtl ? 'تم تحديث المنتج' : 'Product updated', 'success');
      invalidate();
      closeForm();
    },
    onError: () => showToast(rtl ? 'فشل تحديث المنتج' : 'Failed to update product', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      showToast(rtl ? 'تم حذف المنتج' : 'Product deleted', 'success');
      invalidate();
    },
    onError: () => showToast(rtl ? 'فشل حذف المنتج' : 'Failed to delete product', 'error'),
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleEdit = (p: ProductForm & { id: string }) => {
    setForm({
      name: p.name,
      barcode: p.barcode || '',
      stock_quantity: p.stock_quantity,
      purchase_price: p.purchase_price,
      selling_price: p.selling_price,
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMut.mutate({ id: editingId, data: form });
    } else {
      createMut.mutate(form);
    }
  };

  const products = data?.data || [];
  const mutating = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={rtl ? 'بحث بالاسم أو الباركود...' : 'Search by name or barcode...'}
          className={`${inputClass} sm:max-w-sm`}
        />
        <div className="sm:ms-auto">
          <Button variant={showForm ? 'outline' : 'primary'} onClick={() => (showForm ? closeForm() : setShowForm(true))}>
            <span className="material-symbols-outlined text-lg">{showForm ? 'close' : 'add'}</span>
            {showForm
              ? (rtl ? 'إلغاء' : 'Cancel')
              : (rtl ? 'إضافة منتج' : 'Add Product')}
          </Button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-base font-bold text-gray-900">
            {editingId ? (rtl ? 'تعديل منتج' : 'Edit Product') : (rtl ? 'إضافة منتج' : 'New Product')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {rtl ? 'الاسم' : 'Name'} <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'الباركود' : 'Barcode'}</label>
              <input type="text" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'المخزون' : 'Stock'}</label>
              <input type="number" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: +e.target.value })} className={inputClass} min="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {rtl ? 'سعر الشراء' : 'Purchase Price'} <span className="text-red-500">*</span>
              </label>
              <input type="number" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: +e.target.value })} className={inputClass} min="0" step="0.01" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {rtl ? 'سعر البيع' : 'Selling Price'} <span className="text-red-500">*</span>
              </label>
              <input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: +e.target.value })} className={inputClass} min="0" step="0.01" required />
            </div>
          </div>
          <Button type="submit" variant="primary" disabled={mutating}>
            {mutating && <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>}
            {editingId ? (rtl ? 'حفظ التعديلات' : 'Save Changes') : (rtl ? 'إضافة' : 'Add')}
          </Button>
        </form>
      )}

      {isLoading && <PageLoader variant="skeleton" rows={5} />}
      {error && (
        <Card className="p-8 text-center text-red-500">
          {rtl ? 'حدث خطأ أثناء تحميل المنتجات' : 'Failed to load products'}
        </Card>
      )}
      {!isLoading && !error && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الاسم' : 'Name'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الباركود' : 'Barcode'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'المخزون' : 'Stock'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'سعر الشراء' : 'Purchase'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'سعر البيع' : 'Selling'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p: any, i: number) => (
                  <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-500">{i + 1}</td>
                    <td className="p-4 font-medium text-gray-900">{p.name}</td>
                    <td className="p-4 text-gray-500" dir="ltr">{p.barcode || '-'}</td>
                    <td className="p-4 text-gray-900">{p.stock_quantity}</td>
                    <td className="p-4 text-gray-500">{p.purchase_price?.toLocaleString?.() ?? p.purchase_price}</td>
                    <td className="p-4 font-medium text-emerald-600">{p.selling_price?.toLocaleString?.() ?? p.selling_price}</td>
                    <td className="p-4 space-x-2 space-x-reverse">
                      <button onClick={() => handleEdit(p)} className="text-emerald-600 hover:text-emerald-700 transition-colors text-sm font-medium ml-2">
                        {rtl ? 'تعديل' : 'Edit'}
                      </button>
                      <button
                        onClick={() => { if (confirm(rtl ? 'تأكيد الحذف؟' : 'Confirm delete?')) deleteMut.mutate(p.id); }}
                        className="text-red-500 hover:text-red-700 transition-colors text-sm font-medium"
                      >
                        {rtl ? 'حذف' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      {rtl ? 'لا توجد منتجات' : 'No products found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
