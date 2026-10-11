import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { listStaff, createStaff, updateStaff, listShifts, clockIn, clockOut } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';

export default function StaffManagement() {
  const { language } = useApp();
  const rtl = language === 'ar';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'coach', phone: '', salary: 0 });
  const [, setClockStaffId] = useState<string | null>(null);

  const { data: staffData, isLoading: staffLoading, error: staffError } = useQuery({
    queryKey: ['staff'],
    queryFn: listStaff,
  });

  const { data: shiftsData, isLoading: shiftsLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: listShifts,
  });

  const createMut = useMutation({
    mutationFn: createStaff,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['staff'] }); setShowForm(false); resetForm(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateStaff(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['staff'] }); setShowForm(false); setEditingId(null); resetForm(); },
  });

  const clockInMut = useMutation({
    mutationFn: clockIn,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shifts'] }); setClockStaffId(null); },
  });

  const clockOutMut = useMutation({
    mutationFn: clockOut,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shifts'] }); setClockStaffId(null); },
  });

  const resetForm = () => setForm({ full_name: '', email: '', password: '', role: 'coach', phone: '', salary: 0 });

  const handleEdit = (s: any) => {
    setForm({ full_name: s.full_name, email: s.email, password: '', role: s.role, phone: s.phone || '', salary: s.salary || 0 });
    setEditingId(s.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      const payload: any = { full_name: form.full_name, role: form.role, phone: form.phone, salary: form.salary };
      if (form.password) payload.password = form.password;
      updateMut.mutate({ id: editingId, data: payload });
    } else {
      createMut.mutate(form);
    }
  };

  const staff = staffData?.data || [];
  const shifts = shiftsData?.data || [];

  const roleBadges: Record<string, string> = { manager: 'مدير', coach: 'مدرب', receptionist: 'استقبال' };
  const inputCls = 'w-full px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none';

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      <PageHeader
        title="إدارة الموظفين"
        subtitle={rtl ? 'إدارة فريق عمل الصالة وسجل الدوام' : 'Manage gym team and attendance log'}
        icon="badge"
        actions={
          <Button variant="primary" onClick={() => { setShowForm(!showForm); setEditingId(null); resetForm(); }}>
            <span className="material-symbols-outlined text-lg">person_add</span>
            {showForm ? 'إلغاء' : 'إضافة موظف'}
          </Button>
        }
      />

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-base font-bold text-gray-900">{editingId ? 'تعديل موظف' : 'إضافة موظف'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">البريد</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} required={!editingId} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{editingId ? 'كلمة المرور (اتركه فارغاً إن لم ترد التغيير)' : 'كلمة المرور'}</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} required={!editingId} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الدور</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
                  <option value="manager">مدير</option>
                  <option value="coach">مدرب</option>
                  <option value="receptionist">استقبال</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الجوال</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الراتب</label>
                <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: +e.target.value })} className={inputCls} min="0" />
              </div>
            </div>
            <Button type="submit" variant="primary" className="px-6">
              {editingId ? 'حفظ التعديلات' : 'إضافة'}
            </Button>
          </form>
        </Card>
      )}

      <h2 className="text-lg font-bold text-gray-900">قائمة الموظفين</h2>
      {staffLoading && <PageLoader message="جاري التحميل..." />}
      {staffError && <div className="text-center py-4 text-red-500 bg-white rounded-3xl border border-gray-100 shadow-sm">حدث خطأ أثناء تحميل الموظفين</div>}
      {!staffLoading && !staffError && staff.length === 0 && (
        <Card className="text-center py-4">
          <p className="text-gray-400">لا يوجد موظفون</p>
        </Card>
      )}

      {!staffLoading && !staffError && staff.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">الاسم</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">الدور</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">الجوال</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">الراتب</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">الحالة</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s: any, i: number) => (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-500">{i + 1}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">{s.full_name.charAt(0)}</span>
                        <div>
                          <p className="font-medium text-gray-900">{s.full_name}</p>
                          <p className="text-xs text-gray-400">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={roleBadges[s.role] || s.role} variant="neutral" />
                    </td>
                    <td className="p-4 text-gray-500" dir="ltr">{s.phone || '-'}</td>
                    <td className="p-4 font-medium text-gray-900">{s.salary ? `${s.salary.toLocaleString()} ر.س` : '-'}</td>
                    <td className="p-4">
                      <StatusBadge status={s.is_active ? 'نشط' : 'غير نشط'} variant={s.is_active ? 'success' : 'error'} />
                    </td>
                    <td className="p-4">
                      <button onClick={() => handleEdit(s)} className="text-emerald-600 hover:text-emerald-700 transition-colors text-sm font-medium">تعديل</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">سجل الدوام</h2>
        <div className="flex gap-2">
          <Button variant="primary" className="px-3 py-1.5 text-sm" onClick={() => clockInMut.mutate()}>
            <span className="material-symbols-outlined text-base">login</span>تسجيل دخول
          </Button>
          <button onClick={() => clockOutMut.mutate()} className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors shadow-sm shadow-red-500/25">
            <span className="material-symbols-outlined text-base">logout</span>تسجيل خروج
          </button>
        </div>
      </div>

      {shiftsLoading && <PageLoader message="جاري التحميل..." />}
      {!shiftsLoading && shifts.length === 0 && (
        <Card className="text-center py-4">
          <p className="text-gray-400">لا توجد سجلات دوام</p>
        </Card>
      )}

      {!shiftsLoading && shifts.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">الموظف</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">الدور</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">وقت الحضور</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">وقت الانصراف</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">المدة</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((sh: any, i: number) => (
                  <tr key={sh.id || i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-500">{i + 1}</td>
                    <td className="p-4 font-medium text-gray-900">{sh.staff_name || sh.full_name || '-'}</td>
                    <td className="p-4 text-gray-500">{sh.role || '-'}</td>
                    <td className="p-4 text-gray-500">{sh.clock_in ? new Date(sh.clock_in).toLocaleString('ar-EG') : '-'}</td>
                    <td className="p-4 text-gray-500">{sh.clock_out ? new Date(sh.clock_out).toLocaleString('ar-EG') : '-'}</td>
                    <td className="p-4 text-gray-500">{sh.duration || '-'}</td>
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


