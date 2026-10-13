import { useState, type FormEvent } from 'react';
import { formatTime } from '../../utils/date';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { getTodayAttendance, manualCheckInByPhone } from '../../services/api';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useMutation } from '@tanstack/react-query';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import PageLoader from '../../components/shared/PageLoader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';
import Spinner from '../../components/ui/Spinner';

// Row shape returned by GET /api/attendance/today → { data: [...] }.
// The backend column is full_name (NOT member_name).
interface AttendanceRow {
  id: string;
  check_in_time: string;
  entry_method: string;
  full_name: string;
  phone_number?: string;
  verified_by_name?: string;
}

export default function AttendanceRecords() {
  const { language } = useApp();
  const { showToast } = useToast();
  const rtl = language === 'ar';
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: records, isLoading } = useApiQuery<AttendanceRow[]>(
    ['attendance', 'today'],
    () => getTodayAttendance().then(r => (r.records || []) as unknown as AttendanceRow[]),
    { staleTime: 15_000 }
  );

  const checkInMutation = useMutation({
    mutationFn: (memberPhone: string) => manualCheckInByPhone(memberPhone),
    onSuccess: () => {
      showToast(rtl ? 'تم تسجيل الدخول' : 'Check-in recorded', 'success');
      setPhone('');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: () => {
      showToast(rtl ? 'فشل تسجيل الدخول — تحقق من رقم الهاتف' : 'Check-in failed — verify the phone number', 'error');
    },
    onSettled: () => {
      setSubmitting(false);
    },
  });

  const rRecords = records || [];
  const latestCheckIn = rRecords.length
    ? formatTime(
        Math.max(...rRecords.map(r => new Date(r.check_in_time).getTime()))
      )
    : '--:--';
  const handleCheckIn = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed) return;
    setSubmitting(true);
    checkInMutation.mutate(trimmed);
  };

  const typeLabels: Record<string, string> = { regular: 'عادي', pt: 'تدريب شخصي', class: 'حصة', qr: 'QR', manual: 'يدوي', manual_phone: 'هاتف' };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      <PageHeader
        title={rtl ? 'تسجيل الحضور' : 'Attendance Records'}
        subtitle={rtl ? 'سجلات حضور الأعضاء اليوم' : "Today's member check-ins"}
        icon="fact_check"
      />

      <StatsGrid
        columns={2}
        stats={[
          { key: 'checked', label: rtl ? 'تم الحضور اليوم' : 'Checked in today', value: rRecords.length, icon: 'how_to_reg', color: 'primary' },
          { key: 'latest', label: rtl ? 'آخر تسجيل' : 'Latest check-in', value: latestCheckIn, icon: 'schedule', color: 'info' },
        ]}
      />

      {/* Manual check-in by phone — matches POST /api/attendance/manual { member_phone } */}
      <Card className="p-5">
        <form onSubmit={handleCheckIn} className="flex flex-wrap items-center gap-3">
          <span className="material-symbols-outlined text-emerald-600">phone_android</span>
          <input
            type="tel"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={rtl ? 'رقم هاتف العضو…' : 'Member phone number…'}
            className="flex-1 min-w-[220px] px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
          />
          <Button type="submit" variant="primary" disabled={submitting || !phone.trim()}>
            {submitting && <Spinner size="sm" />}
            {rtl ? 'تسجيل حضور' : 'Check in'}
          </Button>
        </form>
      </Card>

      {isLoading ? (
        <Card>
          <PageLoader variant="skeleton" rows={5} />
        </Card>
      ) : rRecords.length === 0 ? (
        <Card className="p-12 text-center">
          <span className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <span className="material-symbols-outlined text-3xl text-gray-400">calendar_check</span>
          </span>
          <p className="text-gray-500 font-medium">{rtl ? 'لا توجد تسجيلات حضور اليوم بعد' : 'No check-ins today yet'}</p>
        </Card>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الاسم' : 'Member'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'وقت الدخول' : 'Check-In'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'النوع' : 'Type'}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'سجّله' : 'Recorded by'}</th>
                </tr>
              </thead>
              <tbody>
                {rRecords.map((r, i) => {
                  const checkInTime = formatTime(r.check_in_time);
                  const entryType: string = r.entry_method;
                  return (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.full_name}</td>
                      <td className="px-4 py-3">
                        <span className="text-emerald-600 font-medium" dir="ltr">{checkInTime}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={typeLabels[entryType] || entryType} variant={entryType === 'pt' ? 'success' : 'neutral'} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.verified_by_name || '--'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
