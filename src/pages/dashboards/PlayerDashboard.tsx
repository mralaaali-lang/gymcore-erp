import { useApiQuery } from '../../hooks/useApiQuery';
import { getMyVisits, getMySubscription, getUpcomingClasses, getMyPoints } from '../../services/api';
import { useApp } from '../../context/GymBrandContext';
import { getPlatformGym } from '../../services/api';
import MetricCard from '../../components/ui/MetricCard';
import { DashboardPage } from '../../components/dashboard';

// Monthly visit target used to derive the goal-progress stat from real visits.
const MONTHLY_VISIT_GOAL = 20;

function usePlayerDashboard() {
  const { data: visitsData, isLoading: vLoading } = useApiQuery(
    ['player', 'visits'],
    getMyVisits,
    { staleTime: 30_000 },
  );
  const { data: subData, isLoading: subLoading } = useApiQuery(
    ['player', 'subscription'],
    getMySubscription,
    { staleTime: 60_000 },
  );
  const { data: classesData, isLoading: cLoading } = useApiQuery(
    ['player', 'classes'],
    getUpcomingClasses,
    { staleTime: 30_000 },
  );
  const { data: pointsData, isLoading: pLoading } = useApiQuery(
    ['player', 'points'],
    getMyPoints,
    { staleTime: 60_000 },
  );
  const isLoading = vLoading || subLoading || cLoading || pLoading;

  const visits = (visitsData as any)?.data ?? [];
  const monthlyVisits = visits.length;
  // Goal progress derived from real visit count (replaces hardcoded 75%).
  const goalProgress = Math.min(100, Math.round((monthlyVisits / MONTHLY_VISIT_GOAL) * 100));
  const sub = (subData as any)?.data;
  const upcomingClasses = (classesData as any)?.data ?? [];
  const nextClass = upcomingClasses[0];
  const points = (pointsData as any)?.data;

  const remainingDays = sub?.end_date
    ? Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
    : 0;

  return {
    isLoading,
    metrics: [
      { label: 'حضوري هذا الشهر', value: isLoading ? '—' : String(monthlyVisits), icon: 'calendar_view_day', trend: { value: String(monthlyVisits > 10 ? '+' : ''), positive: true }, color: 'primary' as const },
      { label: 'الحصة القادمة', value: nextClass ? `${nextClass.day} ${nextClass.start_time || ''}` : '—', icon: 'event', color: 'secondary' as const },
      { label: 'الخطة النشطة', value: sub?.plan_name || '—', icon: 'workspace_premium', color: 'primary' as const },
      { label: 'الأيام المتبقية', value: isLoading ? '—' : String(remainingDays), icon: 'hourglass_top', trend: { value: `-${30 - remainingDays}`, positive: false }, color: 'warning' as const },
      { label: 'نقاط الولاء', value: isLoading ? '—' : String(points?.points_balance ?? points?.balance ?? 0), icon: 'exercise', trend: { value: '+12', positive: true }, color: 'secondary' as const },
      { label: 'تقدم الهدف', value: isLoading ? '—' : `${goalProgress}%`, icon: 'trending_up', trend: { value: `${monthlyVisits}/${MONTHLY_VISIT_GOAL}`, positive: true }, color: 'primary' as const },
    ],
  };
}

export default function PlayerDashboard() {
  const { metrics, isLoading } = usePlayerDashboard();
  const { tenantId } = useApp();
  const { data: gymInfo } = useApiQuery(
    ['gym', 'info'],
    () => getPlatformGym(tenantId).then((r) => r.data),
    { staleTime: 60_000, enabled: !!tenantId }
  );

  return (
    <div className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        title={gymInfo?.name || 'ملفي الرياضي'}
        subtitle={gymInfo?.name ? `${gymInfo.name} · متابعة تقدمي وحصصي القادمة` : 'متابعة تقدمي وحصصي القادمة'}
      >
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-3xl p-5 md:p-6 animate-pulse shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-2xl bg-gray-100" />
                  <div className="h-4 w-24 bg-gray-100 rounded" />
                </div>
                <div className="h-8 w-20 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {metrics.map((m) => (
              <MetricCard key={m.label} {...m} />
            ))}
          </div>
        )}
      </DashboardPage>
    </div>
  );
}