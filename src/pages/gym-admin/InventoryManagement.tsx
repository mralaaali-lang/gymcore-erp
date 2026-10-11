import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { listProducts, createProduct, updateProduct, deleteProduct } from '../../services/api';

export default function InventoryManagement() {
  const { language } = useApp();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', barcode: '', stock_quantity: 0, purchase_price: 0, selling_price: 0 });

  const { data, isLoading, error } = useQuery({
    queryKey: ['products', search],
    queryFn: () => listProducts(search || undefined),
  });

  const createMut = useMutation({
    mutationFn: createProduct,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setShowForm(false); resetForm(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateProduct(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setShowForm(false); setEditingId(null); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const resetForm = () => setForm({ name: '', barcode: '', stock_quantity: 0, purchase_price: 0, selling_price: 0 });

  const handleEdit = (p: any) => {
    setForm({ name: p.name, barcode: p.barcode || '', stock_quantity: p.stock_quantity, purchase_price: p.purchase_price, selling_price: p.selling_price });
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

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">المنتجات</h1>
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); resetForm(); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-petrol-light transition-colors">
          <span className="material-symbols-outlined text-lg">add</span>
          {showForm ? 'إلغاء' : 'إضافة منتج'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-surface-variant p-5 mb-6 space-y-4">
          <h2 className="text-base font-bold text-gray-800">{editingId ? 'تعديل منتج' : 'إضافة منتج'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2 rounded-xl border border-surface-variant bg-white text-sm focus:ring-2 focus:ring-primary" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الباركود</label>
              <input type="text" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="w-full px-4 py-2 rounded-xl border border-surface-variant bg-white text-sm focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المخزون</label>
              <input type="number" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: +e.target.value })} className="w-full px-4 py-2 rounded-xl border border-surface-variant bg-white text-sm focus:ring-2 focus:ring-primary" min="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">سعر الشراء</label>
              <input type="number" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: +e.target.value })} className="w-full px-4 py-2 rounded-xl border border-surface-variant bg-white text-sm focus:ring-2 focus:ring-primary" min="0" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">سعر البيع</label>
              <input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: +e.target.value })} className="w-full px-4 py-2 rounded-xl border border-surface-variant bg-white text-sm focus:ring-2 focus:ring-primary" min="0" required />
            </div>
          </div>
          <button type="submit" className="px-6 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-petrol-light transition-colors">
            {editingId ? 'حفظ التعديلات' : 'إضافة'}
          </button>
        </form>
      )}

      {isLoading && <div className="text-center py-8 text-gray-500">جاري التحميل...</div>}
      {error && <div className="text-center py-8 text-red-500">حدث خطأ أثناء تحميل المنتجات</div>}
      {!isLoading && !error && products.length === 0 && (
        <div className="text-center py-8 text-gray-400">لا توجد منتجات</div>
      )}

      {!isLoading && !error && products.length > 0 && (
        <div className="bg-white rounded-2xl border border-surface-variant overflow-hidden">
          <div className="p-4 border-b border-surface-variant">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الباركود..." className="w-full max-w-sm px-4 py-2 rounded-xl border border-surface-variant bg-surface text-sm focus:ring-2 focus:ring-primary" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface border-b border-surface-variant">
                  <th className="text-right p-4 font-semibold text-gray-700">#</th>
                  <th className="text-right p-4 font-semibold text-gray-700">الاسم</th>
                  <th className="text-right p-4 font-semibold text-gray-700">الباركود</th>
                  <th className="text-right p-4 font-semibold text-gray-700">المخزون</th>
                  <th className="text-right p-4 font-semibold text-gray-700">سعر الشراء</th>
                  <th className="text-right p-4 font-semibold text-gray-700">سعر البيع</th>
                  <th className="text-right p-4 font-semibold text-gray-700">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p: any, i: number) => (
                  <tr key={p.id} className="border-b border-surface-variant hover:bg-surface transition-colors">
                    <td className="p-4 text-gray-500">{i + 1}</td>
                    <td className="p-4 font-medium text-gray-800">{p.name}</td>
                    <td className="p-4 text-gray-500" dir="ltr">{p.barcode || '-'}</td>
                    <td className="p-4">{p.stock_quantity}</td>
                    <td className="p-4">{p.purchase_price.toLocaleString()} ر.س</td>
                    <td className="p-4">{p.selling_price.toLocaleString()} ر.س</td>
                    <td className="p-4 space-x-2 space-x-reverse">
                      <button onClick={() => handleEdit(p)} className="text-primary hover:text-petrol-light transition-colors text-sm font-medium ml-2">تعديل</button>
                      <button onClick={() => { if (confirm('تأكيد الحذف؟')) deleteMut.mutate(p.id); }} className="text-red-500 hover:text-red-700 transition-colors text-sm font-medium">حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
