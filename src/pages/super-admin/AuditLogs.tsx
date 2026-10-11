import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listAuditLogs } from '../../services/api';
import type { AuditLogEntry } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import FilterBar from '../../components/shared/FilterBar';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';

const actionLabels: Record<string, string> = {
  'user.login': 'تسجيل دخول',
  'user.logout': 'تسجيل خروج',
  'tenant.update': 'تحديث بيانات',
  'member.delete': 'حذف عضو',
  'payment.failed': 'فشل الدفع',
  'subscription.change': 'تغيير الاشتراك',
  'security.alert': 'تنبيه أمني',
};

const actionVariant: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  'user.login': 'success',
  'user.logout': 'neutral',
  'tenant.update': 'warning',
  'member.delete': 'error',
  'payment.failed': 'error',
  'subscription.change': 'warning',
  'security.alert': 'error',
};

function inferActionType(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes('login')) return 'user.login';
  if (lower.includes('logout')) return 'user.logout';
  if (lower.includes('delete') || lower.includes('حذف')) return 'member.delete';
  if (lower.includes('payment') || lower.includes('دفع')) return 'payment.failed';
  if (lower.includes('subscription') || lower.includes('اشتراك')) return 'subscription.change';
  if (lower.includes('security') || lower.includes('أمن')) return 'security.alert';
  if (lower.includes('update') || lower.includes('تحديث') || lower.includes('create') || lower.includes('إنشاء')) return 'tenant.update';
  return 'tenant.update';
}

export default function AuditLogs() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const { data, isLoading, error } = useApiQuery(
    ['audit-logs', search, dateFilter],
    () => listAuditLogs({ search: search || undefined, date: dateFilter || undefined, limit: 200 }),
  );

  const logs: AuditLogEntry[] = data?.data ?? [];

  const columns = [
    { key: 'timestamp', label: isRtl ? 'التاريخ' : 'Timestamp' },
    { key: 'action', label: isRtl ? 'الإجراء' : 'Action' },
    { key: 'tenant', label: isRtl ? 'الجهة' : 'Tenant' },
    { key: 'ip', label: 'IP' },
    { key: 'user', label: isRtl ? 'المستخدم' : 'User' },
  ];
  const rows = logs.map((log) => {
    const actionKey = inferActionType(log.actionType);
    return {
      id: log.id,
      timestamp: new Date(log.timestamp).toLocaleString(isRtl ? 'ar-EG' : 'en-US'),
      action: (
        <StatusBadge
          status={isRtl ? (actionLabels[actionKey] || log.actionType) : log.actionType}
          variant={actionVariant[actionKey] || 'neutral'}
        />
      ),
      tenant: log.tenantName,
      ip: log.ipAddress,
      user: log.user,
    };
  });

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'سجلات التدقيق' : 'Audit Logs'}
        subtitle={isRtl ? 'تتبع نشاط النظام والأحداث الأمنية' : 'System activity and security event tracking'}
        icon="fact_check"
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={isRtl ? 'بحث في السجلات...' : 'Search logs...'}
      />

      <div className="flex items-center gap-2.5">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {isLoading ? (
        <PageLoader message={isRtl ? 'جاري التحميل...' : 'Loading...'} />
      ) : error ? (
        <Card>
          <div className="text-center py-12 text-red-500 text-sm">
            {isRtl ? 'فشل تحميل السجلات' : 'Failed to load logs'}
          </div>
        </Card>
      ) : (
        <Card>
          <DataTable columns={columns} data={rows} />
        </Card>
      )}
    </div>
  );
}