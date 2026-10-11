import { useQuery, useQueries } from '@tanstack/react-query';
import {
  listMembers,
  getTodayAttendance,
  getFinanceSummary,
  listStaff,
  getSetupProgress,
  getPlatformGym,
} from '../services/api';
import { useApp } from '../context/GymBrandContext';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('ar-EG')} ج.م`;
}

export function useGymDashboard() {
  const { tenantId } = useApp();
  
  const { data: gymInfo } = useQuery({
    queryKey: ['gym', 'info', tenantId],
    queryFn: () => getPlatformGym(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  const results = useQueries({
    queries: [
      {
        queryKey: ['dashboard', 'members'],
        queryFn: () => listMembers({ limit: 200 }),
        staleTime: 60_000,
      },
      {
        queryKey: ['dashboard', 'attendance'],
        queryFn: getTodayAttendance,
        staleTime: 30_000,
      },
      {
        queryKey: ['dashboard', 'finance'],
        queryFn: getFinanceSummary,
        staleTime: 60_000,
      },
      {
        queryKey: ['dashboard', 'staff'],
        queryFn: listStaff,
        staleTime: 60_000,
      },
    ],
  });

  const [membersQ, attendanceQ, financeQ, staffQ] = results;
  const isLoading = results.some((r) => r.isLoading);
  const isError = results.some((r) => r.isError);

  const members = membersQ.data?.members ?? [];
  const totalMembers = membersQ.data?.total ?? members.length;
  const activeSubscriptions = members.filter(
    (m) => m.subscription_status === 'active',
  ).length;
  const todayAttendance = attendanceQ.data?.records?.length ?? 0;
  const finance = financeQ.data?.data;
  const staffCount = staffQ.data?.data?.length ?? 0;

  return {
    isLoading,
    isError,
    gymInfo: gymInfo?.data,
    metrics: [
      {
        label: 'إجمالي الأعضاء',
        value: isLoading ? '—' : String(totalMembers),
        icon: 'group',
        trend: undefined,
        color: 'primary' as const,
      },
      {
        label: 'الاشتراكات النشطة',
        value: isLoading ? '—' : String(activeSubscriptions),
        icon: 'verified',
        trend: undefined,
        color: 'secondary' as const,
      },
      {
        label: 'حضور اليوم',
        value: isLoading ? '—' : String(todayAttendance),
        icon: 'today',
        trend: undefined,
        color: 'primary' as const,
      },
      {
        label: 'الإيرادات الشهرية',
        value: isLoading ? '—' : formatCurrency(finance?.monthly_revenue ?? 0),
        icon: 'payments',
        trend: undefined,
        color: 'secondary' as const,
      },
      {
        label: 'عدد الموظفين',
        value: isLoading ? '—' : String(staffCount),
        icon: 'badge',
        trend: undefined,
        color: 'warning' as const,
      },
      {
        label: 'الديون المعلقة',
        value: isLoading ? '—' : formatCurrency(finance?.outstanding_debts ?? 0),
        icon: 'receipt_long',
        trend: undefined,
        color: 'error' as const,
      },
    ],
  };
}

export type SetupStepId =
  | 'trainers'
  | 'subscriptions'
  | 'members'
  | 'cashbox'
  | 'schedule'
  | 'payments'
  | 'marketing'
  | 'settings';

export function useSetupProgress(enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: ['setup', 'progress'],
    queryFn: getSetupProgress,
    staleTime: 60_000,
    enabled,
  });

  const completed: Record<SetupStepId, boolean> = {
    trainers: data?.trainers ?? false,
    subscriptions: data?.subscriptions ?? false,
    members: data?.members ?? false,
    cashbox: data?.cashbox ?? false,
    schedule: data?.schedule ?? false,
    payments: data?.payments ?? false,
    marketing: data?.marketing ?? false,
    settings: data?.settings ?? false,
  };

  const doneCount = Object.values(completed).filter(Boolean).length;

  return { completed, isLoading, doneCount, total: 8 };
}
