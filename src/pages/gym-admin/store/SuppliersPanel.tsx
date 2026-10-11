import { useState } from 'react';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { listSuppliers, createSupplier } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import StatusBadge from '../../../components/ui/StatusBadge';

// Suppliers panel — merged from SuppliersPage (§23), the "suppliers" tab of the
// Store hub. Manager-only: reception never renders this tab (endpoints 403).
// Note: the old page had an "Edit" button whose submit always called
// createSupplier (the backend exposes only GET/POST /api/finance/suppliers),
// so editing silently created duplicate rows. The fake edit UI is removed in
// this merge; a real PUT endpoint is a separate backend milestone.
interface SupplierRow {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  status?: string;
  created_at?: string;
}

const statusAr: Record<string, string> = { active: 'نشط', inactive: 'غير نشط' };
const statusEn: Record<string, string> = { active: 'Active', inactive: 'Inactive' };
const statusVariant = (status: string): 'success' | 'warning' | 'error' | 'neutral' =>
  status === 'active' ? 'success' : 'neutral';

const inputClass =
  'w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

export default function SuppliersPanel() {
  const { language } = useApp();
  const rtl = language === 'ar';
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const { data: suppliersRes, isLoading } = useApiQuery<{ data: SupplierRow[] }>(
    ['suppliers'],
    () => listSuppliers(),
  );

  const createMutation = useMutation({
    mutationFn: (data: { name: string; phone?: string; email?: string; address?: string; notes?: string }) =>
      createSupplier(data),
    onSuccess: () => {
      showToast(rtl ? 'تم إضافة المورد' : 'Supplier added', 'success');
      setShowModal(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers-all'] });
    },
    onError: () => {
      showToast(rtl ? 'فشل إضافة المورد' : 'Failed to add supplier', 'error');
    },
  });

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setNotes('');
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      showToast(rtl ? 'الاسم مطلوب' : 'Name is required', 'warning');
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const suppliers = suppliersRes?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => { resetForm(); setShowModal(true); }}>
          <span className="material-symbols-outlined text-lg">add</span>
          {rtl ? 'إضافة مورد' : 'Add Supplier'}
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
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الاسم' : 'Name'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الجوال' : 'Phone'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'البريد' : 'Email'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'العنوان' : 'Address'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'ملاحظات' : 'Notes'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s: SupplierRow) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-500">{suppliers.indexOf(s) + 1}</td>
                    <td className="p-4 font-medium text-gray-900">{s.name}</td>
                    <td className="p-4 text-gray-500" dir="ltr">{s.phone || '-'}</td>
                    <td className="p-4 text-gray-500">{s.email || '-'}</td>
                    <td className="p-4 text-gray-500 text-xs max-w-[150px] truncate">{s.address || '-'}</td>
                    <td className="p-4 text-gray-500 text-xs max-w-[120px] truncate">{s.notes || '-'}</td>
                    <td className="p-4">
                      <StatusBadge
                        status={rtl ? statusAr[s.status || 'active'] : statusEn[s.status || 'active']}
                        variant={statusVariant(s.status || 'active')}
                      />
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      {rtl ? 'لا يوجد موردون' : 'No suppliers found'}
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
            className="bg-white rounded-3xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 mx-4 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                {rtl ? 'إضافة مورد جديد' : 'New Supplier'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {rtl ? 'الاسم' : 'Name'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder={rtl ? 'اسم المورد' : 'Supplier name'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'الجوال' : 'Phone'}</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder={rtl ? 'رقم الجوال' : 'Phone number'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'البريد الإلكتروني' : 'Email'}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder={rtl ? 'البريد الإلكتروني' : 'Email address'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'العنوان' : 'Address'}</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={inputClass}
                  placeholder={rtl ? 'العنوان' : 'Address'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'ملاحظات' : 'Notes'}</label>
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
                {rtl ? 'إضافة' : 'Add'}
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
