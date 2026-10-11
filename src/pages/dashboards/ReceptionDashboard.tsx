import { useApiQuery } from '../../hooks/useApiQuery';
import { getTodayAttendance, listMembers, listProducts, listLeads, listOffers } from '../../services/api';
import { useApp } from '../../context/GymBrandContext';
import { getPlatformGym } from '../../services/api';
import MetricCard from '../../components/ui/MetricCard';
import { DashboardPage } from '../../components/dashboard';

// Reception desk sees only what its role may access (server enforces
// manager-only endpoints: finance/sales, cashbox, staff shifts, pending
// actions — querying those here produced 403 noise and dead metrics).
function useReceptionDashboard() {
  const { data: attendanceData, isLoading: aLoading } = useApiQuery(
    ['reception', 'attendance'],
    getTodayAttendance,
    { staleTime: 30_000 },
  );
  const { data: membersData, isLoading: mLoading } = useApiQuery(
    ['reception', 'members'],
    () => listMembers({ limit: 200 }),
    { staleTime: 60_000 },
  );
  const { data: productsData, isLoading: pLoading } = useApiQuery(
    ['reception', 'products'],
    () => listProducts(),
    { staleTime: 60_000 },
  );
  const { data: leadsData, isLoading: lLoading } = useApiQuery(
    ['reception', 'leads'],
    () => listLeads({ limit: 200 }),
    { staleTime: 60_000 },
  );
  const { data: offersData, isLoading: oLoading } = useApiQuery(
    ['reception', 'offers'],
    () => listOffers(),
    { staleTime: 60_000 },
  );
  const isLoading = aLoading || mLoading || pLoading || lLoading || oLoading;

  const todayAttendance = (attendanceData as any)?.records?.length ?? 0;
  const members = membersData?.members ?? [];
  const activeMembers = members.filter((m: any) => m.subscription_status === 'active').length;
  const products = (productsData as any)?.data ?? [];
  const inStock = products.filter((p: any) => (p.stock_quantity ?? 0) > 0).length;
  const leads = (leadsData as any)?.data ?? [];
  const newLeads = leads.filter((l: any) => l.status === 'new').length;
  const offers = Array.isArray(offersData) ? offersData : ((offersData as any)?.data ?? []);

  return {
    isLoading,
    metrics: [
      { label: 'تسجيل الدخول اليوم', value: isLoading ? '—' : String(todayAttendance), icon: 'qr_code', color: 'primary' as const },
      { label: 'الأعضاء النشطون', value: isLoading ? '—' : String(activeMembers), icon: 'group', color: 'secondary' as const },
      { label: 'إجمالي الأعضاء', value: isLoading ? '—' : String(members.length), icon: 'group', color: 'primary' as const },
      { label: 'عملاء محتملون جدد', value: isLoading ? '—' : String(newLeads), icon: 'person_add', color: 'secondary' as const },
      { label: 'منتجات متاحة', value: isLoading ? '—' : String(inStock), icon: 'shopping_cart', color: 'primary' as const },
      { label: 'عروض الاشتراكات', value: isLoading ? '—' : String(offers.length), icon: 'sell', color: 'warning' as const },
    ],
  };
}

export default function ReceptionDashboard() {
  const { metrics, isLoading } = useReceptionDashboard();
  const { tenantId } = useApp();
  const { data: gymInfo } = useApiQuery(
    ['gym', 'info'],
    () => getPlatformGym(tenantId).then((r) => r.data),
    { staleTime: 60_000, enabled: !!tenantId }
  );

  return (
    <div className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        title={gymInfo?.name || 'لوحة الاستقبال'}
        subtitle={gymInfo?.name ? `${gymInfo.name} · تسجيل الدخول السريع وإدارة الجلسات` : 'تسجيل الدخول السريع وإدارة الجلسات'}
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