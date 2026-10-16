import { useQuery } from '@tanstack/react-query';
import { formatDate, formatTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { getMyVisits, getMyPoints, getMySubscription } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';

// All values derive from the member's real records:
// /api/attendance/my-visits (last 20), /api/loyalty/my-points,
// /api/subscriptions/my. Replaces the previous fully-mocked page
// (hardcoded 42 sessions, fake achievements and activity feed).
const TIER_LABELS: Record<string, string> = {
  bronze: 'برونزي',
  silver: 'فضي',
  gold: 'ذهبي',
  platinum: 'بلاتيني',
};

const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function AthleteProgress() {
  const { language } = useApp();
  const isRtl = language === 'ar';

  const visits = useQuery({ queryKey: ['my-visits'], queryFn: getMyVisits, staleTime: 30_000 });
  const points = useQuery({ queryKey: ['my-points'], queryFn: getMyPoints, staleTime: 60_000 });
  const subscription = useQuery({ queryKey: ['my-subscription'], queryFn: getMySubscription, staleTime: 60_000 });

  if (visits.isLoading || points.isLoading || subscription.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <PageLoader variant="skeleton" message={isRtl ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    );
  }

  const visitList = (visits.data?.data ?? []) as { id: string; check_in_time: string; entry_method: string }[];
  const loyalty = (points.data?.data ?? { points_balance: 0, tier: 'bronze' }) as { points_balance: number; tier: string };
  const sub = (subscription.data?.data ?? null) as { plan_name?: string; start_date?: string; end_date?: string } | null;

  // Derived stats — honest scope: the API returns the last 20 visits.
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthVisits = visitList.filter((v) => (v.check_in_time || '').startsWith(monthPrefix)).length;

  const weekly = WEEKDAYS_AR.map((day) => ({ day, count: 0 }));
  for (const v of visitList) {
    const d = new Date(v.check_in_time);
    if (!Number.isNaN(d.getTime())) weekly[d.getDay()].count += 1;
  }
  const maxWeekly = Math.max(1, ...weekly.map((w) => w.count));

  const subProgress = sub?.start_date && sub?.end_date
    ? Math.min(100, Math.max(0, Math.round(
        ((Date.now() - new Date(sub.start_date).getTime()) /
          (new Date(sub.end_date).getTime() - new Date(sub.start_date).getTime())) * 100
      )))
    : 0;
  const daysLeft = sub?.end_date
    ? Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
    : 0;

  const stats = [
    { label: isRtl ? 'زياراتي (آخر 20)' : 'My visits (last 20)', value: String(visitList.length), icon: 'door_open' },
    { label: isRtl ? 'زيارات هذا الشهر' : 'Visits this month', value: String(monthVisits), icon: 'calendar_month' },
    { label: isRtl ? 'نقاط الولاء' : 'Loyalty points', value: String(loyalty.points_balance ?? 0), icon: 'stars' },
    { label: isRtl ? 'المستوى' : 'Tier', value: TIER_LABELS[loyalty.tier] ?? loyalty.tier ?? '—', icon: 'military_tech' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader title={isRtl ? 'تقدمي' : 'My Progress'} icon="emoji_events" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <span className="material-symbols-outlined text-emerald-600 mb-2">{s.icon}</span>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Weekly visit distribution (from loaded visits) */}
      <Card className="p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4">
          {isRtl ? 'توزيع زياراتي على أيام الأسبوع' : 'Visits by weekday'}
        </h2>
        <div className="flex items-end justify-between gap-2 h-36">
          {weekly.map((w) => (
            <div key={w.day} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs font-semibold text-gray-700">{w.count}</span>
              <div
                className="w-full rounded-t-lg bg-emerald-500/80"
                style={{ height: `${Math.max(4, (w.count / maxWeekly) * 100)}%` }}
              />
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{w.day}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Subscription progress */}
      {sub && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-gray-900">
              {isRtl ? 'تقدم اشتراكي' : 'My subscription'}
            </h2>
            <span className="text-sm font-semibold text-emerald-600">{sub.plan_name}</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${subProgress}%` }} />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {isRtl ? `متبقي ${daysLeft} يومًا` : `${daysLeft} days left`} · {subProgress}%
          </p>
        </Card>
      )}

      {/* Recent visits */}
      <Card className="p-5">
        <h2 className="text-base font-bold text-gray-900 mb-3">
          {isRtl ? 'آخر الزيارات' : 'Recent visits'}
        </h2>
        {visitList.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            {isRtl ? 'لا توجد زيارات مسجلة بعد' : 'No visits recorded yet'}
          </p>
        ) : (
          <div className="space-y-2">
            {visitList.slice(0, 8).map((v) => {
              const d = new Date(v.check_in_time);
              return (
                <div key={v.id} className="bg-white rounded-2xl p-3 border border-gray-100 flex justify-between items-center">
                  <span className="text-sm text-gray-600">
                    {Number.isNaN(d.getTime()) ? '—' : formatDate(d)}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {Number.isNaN(d.getTime()) ? '' : formatTime(d)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
