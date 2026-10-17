import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { formatMoney } from '../../../utils/currency';
import { listStaff, createStaff, updateStaff, type StaffData } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import Modal from '../../../components/shared/Modal';
import Button from '../../../components/ui/Button';
import StatusBadge from '../../../components/ui/StatusBadge';

const roleLabels: Record<string, string> = {
  manager: 'مدير',
  coach: 'مدرب',
  receptionist: 'استقبال',
};

function roleVariant(role: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (role === 'manager') return 'warning';
  if (role === 'receptionist') return 'success';
  return 'neutral';
}

const roleOptions = [
  { value: 'manager', label: 'مدير' },
  { value: 'coach', label: 'مدرب' },
  { value: 'receptionist', label: 'استقبال' },
];

const FILTERS = [
  { value: 'all', labelAr: 'الكل', labelEn: 'All' },
  { value: 'manager', labelAr: 'المديرون', labelEn: 'Managers' },
  { value: 'coach', labelAr: 'المدربون', labelEn: 'Trainers' },
  { value: 'receptionist', labelAr: 'الاستقبال', labelEn: 'Reception' },
];

// Staff directory tab — full CRUD (was UsersPage). The role filter chips
// replace TrainersPage, which was a read-only coach-only card grid over the
// same listStaff data.
export default function StaffDirectory() {
  const { language, gymProfile } = useApp();
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const rtl = language === 'ar';
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const initialRole = params.get('role');
  const [roleFilter, setRoleFilter] = useState(
    FILTERS.some((f) => f.value === initialRole) ? (initialRole as string) : 'all'
  );
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffData | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('manager');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('');
  const [commission, setCommission] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['staff'],
    queryFn: () => listStaff(),
    staleTime: 30_000,
  });

  const allStaff: StaffData[] = data?.data || [];
  const staff = roleFilter === 'all' ? allStaff : allStaff.filter((s) => s.role === roleFilter);

  const createMutation = useMutation({
    mutationFn: () => createStaff({
      full_name: name,
      email,
      password,
      role,
      phone: phone || undefined,
      salary: salary ? Number(salary) : undefined,
      // العمولة تُضبط من أول يوم — إنشاؤها صفرًا دائمًا كان يطفئ الفيتشر
      commission_pct: commission === '' ? 0 : Math.min(100, Math.max(0, Number(commission))),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => updateStaff(editingUser!.id, {
      full_name: name,
      email,
      role,
      phone: phone || undefined,
      salary: salary ? Number(salary) : undefined,
      commission_pct: commission === '' ? undefined : Math.min(100, Math.max(0, Number(commission))),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      resetForm();
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (user: StaffData) => updateStaff(user.id, { is_active: !user.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('manager');
    setPhone('');
    setSalary('');
    setCommission('');
  };

  const openEdit = (user: StaffData) => {
    setEditingUser(user);
    setName(user.full_name);
    setEmail(user.email);
    setRole(user.role);
    setPhone(user.phone || '');
    setSalary(user.salary?.toString() || '');
    setCommission(user.commission_pct != null && user.commission_pct !== '' ? String(Number(user.commission_pct)) : '');
    setPassword('');
    setShowForm(true);
  };

  const openCreate = () => {
    setEditingUser(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('manager');
    setPhone('');
    setSalary('');
    setCommission('');
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (editingUser) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const inputCls = 'w-full px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none bg-white';

  if (isLoading) return <PageLoader variant="skeleton" message={rtl ? 'جاري التحميل...' : 'Loading...'} />;
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center text-red-700">
        {rtl ? 'فشل تحميل بيانات الموظفين' : 'Failed to load staff'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 bg-white border border-gray-100 rounded-2xl p-1 shadow-sm">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setRoleFilter(f.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                roleFilter === f.value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {rtl ? f.labelAr : f.labelEn}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 bg-white px-3 py-1.5 rounded-xl border border-gray-100 shadow-sm">
            {staff.length} {rtl ? 'موظف' : 'staff'}
          </span>
          <Button variant="primary" onClick={openCreate}>
            <span className="material-symbols-outlined text-lg">person_add</span>
            {rtl ? 'إضافة موظف' : 'Add staff'}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-gray-900">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-right p-4 text-xs font-semibold text-gray-500">#</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الاسم' : 'Name'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'البريد' : 'Email'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الدور' : 'Role'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الجوال' : 'Phone'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الراتب' : 'Salary'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'العمولة %' : 'Commission %'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <span className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                      <span className="material-symbols-outlined text-3xl text-gray-400">group</span>
                    </span>
                    <p className="text-gray-400 text-sm">{rtl ? 'لا يوجد موظفون' : 'No staff found'}</p>
                  </td>
                </tr>
              )}
              {staff.map((u, i) => (
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-gray-500">{i + 1}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                        {u.full_name.charAt(0)}
                      </span>
                      <span className="font-medium text-gray-900">{u.full_name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-gray-500">{u.email}</td>
                  <td className="p-4">
                    <StatusBadge status={roleLabels[u.role] || u.role} variant={roleVariant(u.role)} />
                  </td>
                  <td className="p-4 text-gray-500" dir="ltr">{u.phone || '—'}</td>
                  <td className="p-4 font-medium text-gray-900">{u.salary ? money(u.salary) : '—'}</td>
                  <td className="p-4 text-gray-600 tabular-nums">{u.commission_pct != null && Number(u.commission_pct) > 0 ? `${Number(u.commission_pct)}%` : '—'}</td>
                  <td className="p-4">
                    <StatusBadge status={u.is_active ? (rtl ? 'نشط' : 'Active') : (rtl ? 'غير نشط' : 'Inactive')} variant={u.is_active ? 'success' : 'error'} />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-emerald-600 hover:text-emerald-700 transition-colors text-sm font-medium"
                      >
                        {rtl ? 'تعديل' : 'Edit'}
                      </button>
                      <button
                        onClick={() => toggleStatusMutation.mutate(u)}
                        className={`text-sm font-medium transition-colors ${u.is_active ? 'text-red-600 hover:text-red-800' : 'text-emerald-600 hover:text-emerald-800'}`}
                      >
                        {u.is_active ? (rtl ? 'تعطيل' : 'Deactivate') : (rtl ? 'تفعيل' : 'Activate')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <Modal
          open
          onClose={resetForm}
          size="lg"
          // الصدفة القديمة ما كانتش بتتحكم `dir` خالص — وده بالنبط في الواجهة
          // الإنجليزي لأن الـpanel بيتعمل portal على <body> و`index.html` مثبّت
          // `dir="rtl"`. (نفس الفجوة اللي سدّها `ModalProps.dir` في §49.)
          dir={rtl ? 'rtl' : 'ltr'}
          disableDismiss={isPending}
          title={editingUser ? (rtl ? 'تعديل موظف' : 'Edit staff') : (rtl ? 'إضافة موظف' : 'Add staff')}
          footer={
            <div className="flex w-full gap-3">
              <Button variant="outline" fullWidth onClick={resetForm} className="px-4 py-2 text-sm">
                {rtl ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button variant="primary" fullWidth onClick={handleSubmit} disabled={isPending || !name || !email || (!editingUser && !password)} className="px-4 py-2 text-sm">
                {isPending ? '...' : (editingUser ? (rtl ? 'حفظ' : 'Save') : (rtl ? 'إضافة' : 'Add'))}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'الاسم' : 'Name'}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'البريد الإلكتروني' : 'Email'}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
            {!editingUser && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'كلمة المرور' : 'Password'}</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'الدور' : 'Role'}</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                {roleOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'الجوال' : 'Phone'}</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'الراتب' : 'Salary'}</label>
              <input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'نسبة العمولة %' : 'Commission %'}</label>
              <input type="number" min={0} max={100} step="0.5" value={commission} onChange={(e) => setCommission(e.target.value)}
                placeholder="0" className={inputCls} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
