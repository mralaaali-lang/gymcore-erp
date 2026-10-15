import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '../../../utils/date';
import { useApp } from '../../../context/GymBrandContext';
import { listShifts, clockIn, clockOut } from '../../../services/api';
import PageLoader from '../../../components/shared/PageLoader';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';

// Attendance-log tab — the shifts section of the old StaffManagement page.
// Its staff CRUD half was a duplicate of UsersPage and lives in the "staff"
// tab now (see StaffDirectory).
export default function ShiftsLog() {
  const { language } = useApp();
  const rtl = language === 'ar';
  const queryClient = useQueryClient();

  const { data: shiftsData, isLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: listShifts,
    staleTime: 30_000,
  });

  const clockInMut = useMutation({
    mutationFn: () => clockIn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  });

  const clockOutMut = useMutation({
    mutationFn: clockOut,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  });

  const shifts = shiftsData?.data || [];

  if (isLoading) return <PageLoader message={rtl ? 'جاري التحميل...' : 'Loading...'} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 bg-white px-3 py-1.5 rounded-xl border border-gray-100 shadow-sm">
          {shifts.length} {rtl ? 'سجل' : 'records'}
        </span>
        <div className="flex gap-2">
          <Button variant="primary" className="px-3 py-1.5 text-sm" onClick={() => clockInMut.mutate()} disabled={clockInMut.isPending}>
            <span className="material-symbols-outlined text-base">login</span>
            {rtl ? 'تسجيل دخول' : 'Clock in'}
          </Button>
          <button
            onClick={() => clockOutMut.mutate()}
            disabled={clockOutMut.isPending}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors shadow-sm shadow-red-500/25 disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-base">logout</span>
            {rtl ? 'تسجيل خروج' : 'Clock out'}
          </button>
        </div>
      </div>

      {shifts.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-gray-400">{rtl ? 'لا توجد سجلات دوام' : 'No attendance records'}</p>
        </Card>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الموظف' : 'Staff'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'الدور' : 'Role'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'وقت الحضور' : 'Clock in'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'وقت الانصراف' : 'Clock out'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{rtl ? 'المدة' : 'Duration'}</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((sh: any, i: number) => (
                  <tr key={sh.id || i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-500">{i + 1}</td>
                    <td className="p-4 font-medium text-gray-900">{sh.staff_name || sh.full_name || '—'}</td>
                    <td className="p-4 text-gray-500">{sh.role || '—'}</td>
                    <td className="p-4 text-gray-500">{sh.clock_in ? formatDateTime(sh.clock_in) : '—'}</td>
                    <td className="p-4 text-gray-500">{sh.clock_out ? formatDateTime(sh.clock_out) : '—'}</td>
                    <td className="p-4 text-gray-500">{sh.duration || '—'}</td>
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
