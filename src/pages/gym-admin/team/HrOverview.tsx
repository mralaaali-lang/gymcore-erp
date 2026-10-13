import { useState } from 'react';
import { formatDate } from '../../../utils/date';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { formatMoney } from '../../../utils/currency';
import { listStaff, listPayroll, processPayroll, getStaffAttendanceSummary } from '../../../services/api';

// HR & payroll tab — content of the old HRDashboard page without its
// standalone title (TeamPage's header now owns the page title).
export default function HrOverview() {
  const { language, gymProfile } = useApp();
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const rtl = language === 'ar';
  const queryClient = useQueryClient();
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ staff_user_id: '', base_salary_paid: 0, commissions_paid: 0 });

  const { data: staffData } = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const { data: payrollData, isLoading: payrollLoading } = useQuery({ queryKey: ['payroll'], queryFn: listPayroll });
  const { data: attendanceData, isLoading: attendanceLoading } = useQuery({ queryKey: ['staff-attendance'], queryFn: getStaffAttendanceSummary });

  const payMut = useMutation({
    mutationFn: processPayroll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      setShowPayForm(false);
      setPayForm({ staff_user_id: '', base_salary_paid: 0, commissions_paid: 0 });
    },
  });

  const staff = staffData?.data || [];
  const payroll = payrollData?.data || [];
  const attendance = attendanceData?.data || [];

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    payMut.mutate(payForm);
  };

  const totalStaff = staff.length;
  const activeStaff = staff.filter((s: any) => s.is_active).length;
  const totalShiftsThisMonth = attendance.reduce((sum: number, a: any) => sum + (a.monthly_shifts || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">{rtl ? 'إجمالي الموظفين' : 'Total staff'}</p>
          <p className="text-2xl font-bold text-gray-800">{totalStaff}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">{rtl ? 'الموظفون النشطون' : 'Active staff'}</p>
          <p className="text-2xl font-bold text-[#006c49]">{activeStaff}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">{rtl ? 'عدد الدوامات هذا الشهر' : 'Shifts this month'}</p>
          <p className="text-2xl font-bold text-primary">{totalShiftsThisMonth}</p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-4">{rtl ? 'سجل الحضور' : 'Attendance summary'}</h2>
        {attendanceLoading && <div className="text-center py-4 text-gray-500">{rtl ? 'جاري التحميل...' : 'Loading...'}</div>}
        {!attendanceLoading && attendance.length === 0 && (
          <div className="text-center py-4 text-gray-400 bg-white rounded-2xl border border-gray-100">{rtl ? 'لا توجد بيانات حضور' : 'No attendance data'}</div>
        )}
        {!attendanceLoading && attendance.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-right p-4 font-semibold text-gray-700">#</th>
                    <th className="text-right p-4 font-semibold text-gray-700">{rtl ? 'الاسم' : 'Name'}</th>
                    <th className="text-right p-4 font-semibold text-gray-700">{rtl ? 'الدور' : 'Role'}</th>
                    <th className="text-right p-4 font-semibold text-gray-700">{rtl ? 'عدد الدوامات' : 'Shifts'}</th>
                    <th className="text-right p-4 font-semibold text-gray-700">{rtl ? 'حضر اليوم' : 'Here today'}</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((a: any, i: number) => (
                    <tr key={a.staff_id || a.id || i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-gray-500">{i + 1}</td>
                      <td className="p-4 font-medium text-gray-800">{a.full_name || a.staff_name || '—'}</td>
                      <td className="p-4 text-gray-600">{a.role || '—'}</td>
                      <td className="p-4">{a.monthly_shifts || 0}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${a.clocked_in_today ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                          {a.clocked_in_today ? (rtl ? 'نعم' : 'Yes') : (rtl ? 'لا' : 'No')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">{rtl ? 'الرواتب' : 'Payroll'}</h2>
          <button
            onClick={() => setShowPayForm(!showPayForm)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-petrol-light transition-colors"
          >
            <span className="material-symbols-outlined text-lg">payments</span>
            {showPayForm ? (rtl ? 'إلغاء' : 'Cancel') : (rtl ? 'صرف راتب' : 'Pay salary')}
          </button>
        </div>

        {showPayForm && (
          <form onSubmit={handlePay} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 space-y-4">
            <h3 className="text-base font-bold text-gray-800">{rtl ? 'صرف راتب' : 'Pay salary'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'الموظف' : 'Staff member'}</label>
                <select value={payForm.staff_user_id} onChange={(e) => setPayForm({ ...payForm, staff_user_id: e.target.value })} className="w-full px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary" required>
                  <option value="">{rtl ? 'اختر موظف' : 'Select staff'}</option>
                  {staff.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'الراتب الأساسي' : 'Base salary'}</label>
                <input type="number" value={payForm.base_salary_paid} onChange={(e) => setPayForm({ ...payForm, base_salary_paid: +e.target.value })} className="w-full px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary" min="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'العمولات' : 'Commissions'}</label>
                <input type="number" value={payForm.commissions_paid} onChange={(e) => setPayForm({ ...payForm, commissions_paid: +e.target.value })} className="w-full px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary" min="0" />
              </div>
            </div>
            <button type="submit" disabled={payMut.isPending} className="px-6 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-petrol-light transition-colors disabled:opacity-60">
              {rtl ? 'صرف' : 'Pay'}
            </button>
          </form>
        )}

        {payrollLoading && <div className="text-center py-4 text-gray-500">{rtl ? 'جاري التحميل...' : 'Loading...'}</div>}
        {!payrollLoading && payroll.length === 0 && (
          <div className="text-center py-4 text-gray-400 bg-white rounded-2xl border border-gray-100">{rtl ? 'لا توجد سجلات رواتب' : 'No payroll records'}</div>
        )}
        {!payrollLoading && payroll.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-right p-4 font-semibold text-gray-700">#</th>
                    <th className="text-right p-4 font-semibold text-gray-700">{rtl ? 'الاسم' : 'Name'}</th>
                    <th className="text-right p-4 font-semibold text-gray-700">{rtl ? 'الراتب الأساسي' : 'Base salary'}</th>
                    <th className="text-right p-4 font-semibold text-gray-700">{rtl ? 'العمولات' : 'Commissions'}</th>
                    <th className="text-right p-4 font-semibold text-gray-700">{rtl ? 'تاريخ الصرف' : 'Payment date'}</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.map((p: any, i: number) => (
                    <tr key={p.id || i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-gray-500">{i + 1}</td>
                      <td className="p-4 font-medium text-gray-800">{p.staff_name || p.full_name || '—'}</td>
                      <td className="p-4">{money(p.base_salary_paid)}</td>
                      <td className="p-4">{money(p.commissions_paid)}</td>
                      <td className="p-4 text-gray-600">{p.payment_date ? formatDate(p.payment_date) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
