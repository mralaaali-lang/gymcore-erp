import { useState } from 'react';
import { formatDateTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useMutation } from '@tanstack/react-query';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listTickets, updateTicketStatus } from '../../services/api';
import type { TicketData } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';

const statusVariants: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  open: 'warning', in_progress: 'warning',
  resolved: 'success', closed: 'neutral',
};

const priorityVariants: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  low: 'neutral', medium: 'warning',
  high: 'warning', critical: 'error',
};

export default function SupportTickets() {
  const { language } = useApp();
  const { showToast } = useToast();
  const isRtl = language === 'ar';
  const [filter, setFilter] = useState<string | undefined>(undefined);

  const params = filter ? { status: filter } : {};
  const { data, isLoading } = useApiQuery(['support-tickets', filter || ''], () => listTickets(params));
  const tickets: TicketData[] = data?.data ?? [];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateTicketStatus(id, status),
    onSuccess: () => {
      showToast(isRtl ? 'تم تحديث حالة التذكرة' : 'Ticket status updated', 'success');
    },
    onError: () => {
      showToast(isRtl ? 'فشل تحديث الحالة' : 'Failed to update status', 'error');
    },
  });

  const statuses = ['open', 'in_progress', 'resolved', 'closed'];

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'تذاكر الدعم' : 'Support Tickets'}
        subtitle={isRtl ? 'إدارة طلبات الدعم من المنشآت' : 'Manage gym support requests'}
        icon="support_agent"
      />

      <UnifiedTabs
        tabs={[
          { key: '', labelAr: 'الكل', labelEn: 'All', icon: 'inbox' },
          ...statuses.map((s) => ({ key: s, labelAr: s, labelEn: s })),
        ]}
        activeKey={filter ?? ''}
        onChange={(k) => setFilter(k || undefined)}
        variant="pills"
      />

      {isLoading && <PageLoader message={isRtl ? 'جاري التحميل...' : 'Loading...'} />}

      <div className="space-y-3">
        {tickets.length === 0 && !isLoading && (
          <Card>
            <p className="text-center text-gray-500 py-8">{isRtl ? 'لا توجد تذاكر' : 'No tickets found'}</p>
          </Card>
        )}
        {tickets.map((t) => (
          <Card key={t.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <span className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white text-xl">confirmation_number</span>
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{t.subject}</h3>
                    <StatusBadge
                      status={isRtl ? ({ open: 'مفتوح', in_progress: 'قيد التنفيذ', resolved: 'تم الحل', closed: 'مغلق' } as Record<string, string>)[t.status] || t.status : t.status}
                      variant={statusVariants[t.status] || 'neutral'}
                    />
                    <StatusBadge status={t.priority} variant={priorityVariants[t.priority] || 'neutral'} />
                  </div>
                  <p className="text-sm text-gray-500">{t.description}</p>
                  <p className="text-xs text-gray-500 mt-2">{t.gym_name} &middot; {formatDateTime(t.created_at)}</p>
                </div>
              </div>
              <select
                value={t.status}
                onChange={(e) => statusMutation.mutate({ id: t.id, status: e.target.value })}
                className="ml-4 px-3 py-1 border border-gray-100 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}