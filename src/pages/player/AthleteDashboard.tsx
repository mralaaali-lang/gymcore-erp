import { useQuery } from '@tanstack/react-query';
import { formatDate, formatTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { getMyProfile, getMySubscription, getUpcomingClasses, getMyVisits } from '../../services/api';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  expired: 'error',
  suspended: 'warning',
};

export default function AthleteDashboard() {
  const { language } = useApp();
  const isRtl = language === 'ar';

  const profile = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile, staleTime: 60_000 });
  const subscription = useQuery({ queryKey: ['my-subscription'], queryFn: getMySubscription, staleTime: 60_000 });
  const classes = useQuery({ queryKey: ['my-classes'], queryFn: getUpcomingClasses, staleTime: 30_000 });
  const visits = useQuery({ queryKey: ['my-visits'], queryFn: getMyVisits, staleTime: 30_000 });

  if (profile.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <PageLoader message={isRtl ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    );
  }

  const member = profile.data?.data;
  const sub = subscription.data?.data;
  const upcoming = classes.data?.data || [];
  const recent = visits.data?.data || [];

  const membershipProgress = sub?.start_date && sub?.end_date
    ? Math.min(100, Math.round(
        ((Date.now() - new Date(sub.start_date).getTime()) /
          (new Date(sub.end_date).getTime() - new Date(sub.start_date).getTime())) * 100
      ))
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-6 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
            {member?.full_name?.charAt(0) || '?'}
          </div>
          <div className="flex-1">
            <p className="text-sm text-white/80">{isRtl ? 'مرحبا بعودتك' : 'Welcome back'}</p>
            <h1 className="text-2xl font-bold text-white">{member?.full_name}</h1>
          </div>
          <span className="material-symbols-outlined text-3xl">fitness_center</span>
        </div>
      </div>

      {sub && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{sub.plan_name}</p>
              <p className="text-xs text-gray-500 mt-1">
                {isRtl ? 'تنتهي في' : 'Expires'}: {formatDate(sub.end_date)}
              </p>
            </div>
            <StatusBadge
              status={sub.status === 'active' ? (isRtl ? 'نشط' : 'Active') : sub.status}
              variant={statusVariant[sub.status] || 'neutral'}
            />
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100">
            <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${membershipProgress}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {membershipProgress}% {isRtl ? 'من العضوية مستخدمة' : 'of membership used'}
          </p>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          {isRtl ? 'الحصص القادمة' : 'Upcoming Classes'}
        </h2>
        <div className="space-y-3">
          {upcoming.length === 0 && (
            <p className="text-sm text-gray-400">{isRtl ? 'لا توجد حصص قادمة' : 'No upcoming classes'}</p>
          )}
          {upcoming.slice(0, 3).map((c) => (
            <Card key={c.id}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined">fitness_center</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.trainer_name}</p>
                </div>
                <span className="text-xs text-emerald-600">{c.day} {c.start_time}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          {isRtl ? 'آخر الزيارات' : 'Recent Visits'}
        </h2>
        <Card className="divide-y divide-gray-100">
          {recent.length === 0 && (
            <p className="p-4 text-sm text-gray-400">{isRtl ? 'لا توجد زيارات' : 'No visits yet'}</p>
          )}
          {recent.slice(0, 3).map((v: any) => (
            <div key={v.id} className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined">login</span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-900">
                  {formatDate(v.check_in_time)}
                </p>
                <p className="text-xs text-gray-500">{v.entry_method}</p>
              </div>
              <span className="text-xs text-gray-500">
                {formatTime(v.check_in_time)}
              </span>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="primary">
          <span className="material-symbols-outlined">calendar_add_on</span>
          {isRtl ? 'حجز حصة' : 'Book Class'}
        </Button>
        <Button variant="secondary">
          <span className="material-symbols-outlined">trending_up</span>
          {isRtl ? 'عرض التقدم' : 'View Progress'}
        </Button>
      </div>
    </div>
  );
}
