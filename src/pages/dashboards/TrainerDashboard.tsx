import { useApiQuery } from '../../hooks/useApiQuery';
import { listPtSessions, getTodayAttendance } from '../../services/api';
import { useApp } from '../../context/GymBrandContext';
import { getPlatformGym } from '../../services/api';
import MetricCard from '../../components/ui/MetricCard';
import { DashboardPage } from '../../components/dashboard';

// Coach role may not query staff shifts (manager-only endpoint — was 403 noise).
function useTrainerDashboard() {
  const { data: sessionsData, isLoading: sLoading } = useApiQuery(
    ['trainer', 'sessions'],
    // §32: mine=true — a coach's dashboard must show THEIR sessions only.
    () => listPtSessions({ mine: true }),
    { staleTime: 30_000 },
  );
  const { data: attendanceData, isLoading: aLoading } = useApiQuery(
    ['trainer', 'attendance'],
    () => getTodayAttendance(),
    { staleTime: 30_000 },
  );
  const isLoading = sLoading || aLoading;

  const allSessions = (sessionsData as any)?.data ?? [];
  const completedCount = allSessions.filter((s: any) => s.status === 'completed').length;
  const totalSessions = allSessions.length;
  // Real PT-session-derived completion rate (replaces hardcoded rating).
  const completionRate = totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0;
  const todayAttendance = (attendanceData as any)?.records?.length ?? 0;
  const clientCount = new Set(allSessions.map((s: any) => s.member_id)).size;
  const avgSessionsPerClient = clientCount > 0 ? (totalSessions / clientCount).toFixed(1) : '0';

  return {
    isLoading,
    metrics: [
      { label: 'العملاء النشطون', value: isLoading ? '—' : String(clientCount), icon: 'group', color: 'primary' as const },
      { label: 'جداول اليوم', value: isLoading ? '—' : String(todayAttendance), icon: 'calendar_today', color: 'secondary' as const },
      { label: 'جلسات PT', value: isLoading ? '—' : String(totalSessions), icon: 'fitness_center', color: 'primary' as const },
      { label: 'متوسط الجلسات لكل عميل', value: isLoading ? '—' : avgSessionsPerClient, icon: 'equalizer', color: 'warning' as const },
      { label: 'الجلسات المكتملة', value: isLoading ? '—' : String(completedCount), icon: 'check_circle', color: 'secondary' as const },
      { label: 'معدل إنجاز الجلسات', value: isLoading ? '—' : `${completionRate}%`, icon: 'trending_up', trend: { value: `${completedCount}/${totalSessions}`, positive: true }, color: 'primary' as const },
    ],
  };
}

export default function TrainerDashboard() {
  const { metrics, isLoading } = useTrainerDashboard();
  const { tenantId } = useApp();
  const { data: gymInfo } = useApiQuery(
    ['gym', 'info'],
    () => getPlatformGym(tenantId).then((r) => r.data),
    { staleTime: 60_000, enabled: !!tenantId }
  );

  return (
    <div className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        title={gymInfo?.name || 'لوحة المدرب'}
        subtitle={gymInfo?.name ? `${gymInfo.name} · جداول التدريب وتقدم العملاء` : 'جداول التدريب وتقدم العملاء'}
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