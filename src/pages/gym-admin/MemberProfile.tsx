import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { getMember } from '../../services/api';
import { useApiQuery } from '../../hooks/useApiQuery';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';

const typeLabels: Record<string, string> = { regular: 'عادي', pt: 'تدريب شخصي', class: 'حصة' };

const initial = (name: string) => name.charAt(0);

export default function MemberProfile() {
  const { language } = useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rtl = language === 'ar';

  const { data, isLoading, isError } = useApiQuery<Record<string, unknown>>(
    ['member', id || ''],
    () => getMember(id || '').then(r => (r.member || r) as Record<string, unknown>),
    { staleTime: 60_000, retry: false, enabled: !!id }
  );

  useEffect(() => {
    if (isError) navigate('/members');
  }, [isError, navigate]);

  if (isLoading) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
        <PageLoader />
      </div>
    );
  }

  if (!data) return null;

  const member = data as Record<string, string>;
  const memberName = member.full_name || member.name || '';
  const activePlan = member.plan_name || '-';
  const memberStatus = member.status === 'active' ? 'نشط' : member.status === 'expired' ? 'منتهي' : 'موقوف';

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      <Card className="flex items-center gap-4">
        <span className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center text-white font-bold text-xl shadow-sm shadow-emerald-500/25 shrink-0">
          {initial(memberName)}
        </span>
        <div className="min-w-0">
          <PageHeader
            title={memberName}
            subtitle={`${member.email || ''} | ${member.phone_number || ''}`}
            className="mb-0"
          />
        </div>
        <div className="ms-auto shrink-0">
          <span className="text-xs text-gray-400">{rtl ? `مشترك منذ ${member.join_date || ''}` : `Member since ${member.join_date || ''}`}</span>
        </div>
      </Card>

      <StatsGrid
        columns={3}
        stats={[
          { key: 'plan', label: rtl ? 'الباقة الحالية' : 'Active Plan', value: activePlan, icon: 'description', color: 'primary' },
          { key: 'status', label: rtl ? 'الحالة' : 'Status', value: memberStatus, icon: 'fitness_center', color: member.status === 'active' ? 'primary' : 'error' },
          { key: 'phone', label: rtl ? 'رقم الجوال' : 'Phone', value: member.phone_number || '', icon: 'call', color: 'info' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">history</span>
            </span>
            {rtl ? 'آخر الحضور' : 'Attendance History'}
          </h2>
          <div className="space-y-3">
            {(data.attendance_history as Array<Record<string, string>>)?.length > 0 ? (
              (data.attendance_history as Array<Record<string, string>>).map((a, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm text-gray-900">{a.date}</p>
                    <p className="text-xs text-gray-400">{a.check_in || a.checkIn} - {a.check_out || a.checkOut || '--'}</p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${(a.type === 'pt') ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {typeLabels[a.type] || a.type}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">
                {rtl ? 'لا توجد سجلات حضور' : 'No attendance records'}
              </p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">receipt_long</span>
            </span>
            {rtl ? 'المدفوعات' : 'Payment History'}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-right p-3 text-xs font-semibold text-gray-500">{rtl ? 'التاريخ' : 'Date'}</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-500">{rtl ? 'المبلغ' : 'Amount'}</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-500">{rtl ? 'الوصف' : 'Description'}</th>
                </tr>
              </thead>
              <tbody>
                {(data.payment_history as Array<Record<string, unknown>>)?.length > 0 ? (
                  (data.payment_history as Array<Record<string, unknown>>).map((p, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="p-3 text-gray-500">{String(p.date || '')}</td>
                      <td className="p-3 font-medium text-gray-900">{String(p.amount || '')} ر.س</td>
                      <td className="p-3 text-gray-500">{String(p.description || '')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-sm text-gray-400">
                      {rtl ? 'لا توجد مدفوعات' : 'No payments'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
