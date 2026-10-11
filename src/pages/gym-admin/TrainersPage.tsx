import { useQuery } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { listTrainers, type StaffData } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';

export default function TrainersPage() {
  const { language } = useApp();
  const rtl = language === 'ar';

  const { data, isLoading, error } = useQuery({
    queryKey: ['trainers'],
    queryFn: () => listTrainers(),
    staleTime: 30_000,
  });

  const trainers: StaffData[] = data?.data || [];

  if (isLoading) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
        <PageLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
        <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center text-red-700">
          {rtl ? 'فشل تحميل بيانات المدربين' : 'Failed to load trainers'}
        </div>
      </div>
    );
  }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      <PageHeader
        title="المدربين"
        subtitle={rtl ? 'فريق المدربين في الصالة' : 'Gym training team'}
        icon="fitness_center"
        actions={
          <span className="text-sm text-gray-500 bg-white px-3 py-1.5 rounded-xl border border-gray-100 shadow-sm">
            {trainers.length} {rtl ? 'مدرب' : 'trainers'}
          </span>
        }
      />

      {trainers.length === 0 && (
        <Card className="p-12 text-center">
          <span className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gray-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-gray-400 text-3xl">fitness_center</span>
          </span>
          <p className="text-gray-500">
            {rtl ? 'لا يوجد مدربون' : 'No trainers found'}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {trainers.map((t) => (
          <Card key={t.id} hoverable>
            <div className="flex items-center gap-4 mb-4">
              <span className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg shrink-0">
                {t.full_name.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-gray-900 truncate">{t.full_name}</p>
                <p className="text-xs text-gray-400 truncate">{t.email}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center p-2 rounded-xl bg-gray-50">
                <span className="text-gray-500">{rtl ? 'الجوال' : 'Phone'}</span>
                <span className="font-medium text-gray-900" dir="ltr">{t.phone || '—'}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded-xl bg-gray-50">
                <span className="text-gray-500">{rtl ? 'الراتب' : 'Salary'}</span>
                <span className="font-medium text-gray-900">{t.salary ? `${t.salary.toLocaleString()} ر.س` : '—'}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded-xl bg-gray-50">
                <span className="text-gray-500">{rtl ? 'الحالة' : 'Status'}</span>
                <StatusBadge
                  status={t.is_active ? (rtl ? 'نشط' : 'Active') : (rtl ? 'غير نشط' : 'Inactive')}
                  variant={t.is_active ? 'success' : 'error'}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
