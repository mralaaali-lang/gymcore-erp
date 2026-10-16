import { useMemo, useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listPtSessions, listMembers } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';

type StatusFilter = 'all' | 'active' | 'completed' | 'overdue';

interface SessionRow {
  id: string;
  memberId: string;
  memberName: string;
  trainerName: string;
  totalSessions: number;
  completedSessions: number;
  status: 'active' | 'completed' | 'overdue';
}

const statusVariant: Record<SessionRow['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  completed: 'neutral',
  overdue: 'error',
};

export default function SessionManagement() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data: sessionsData, isLoading: sessionsLoading } = useApiQuery(
    ['pt-sessions'],
    () => listPtSessions(),
  );
  const { data: membersData, isLoading: membersLoading } = useApiQuery(
    ['members'],
    () => listMembers(),
  );

  const sessions = useMemo(() => sessionsData?.data ?? [], [sessionsData]);
  const membersById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of membersData?.members ?? []) map.set(m.id, m.full_name);
    return map;
  }, [membersData]);

  const rows: SessionRow[] = useMemo(() => {
    const groups = new Map<string, { memberName: string; trainerName: string; items: Record<string, unknown>[] }>();
    for (const s of sessions) {
      const rec = s as unknown as Record<string, unknown>;
      const memberId = String(rec.member_id ?? rec.memberId ?? rec.member_name ?? '');
      const memberName =
        (rec.member_name as string | undefined) ||
        ((rec.member as Record<string, unknown> | undefined)?.full_name as string | undefined) ||
        membersById.get(memberId) ||
        '—';
      const trainerName =
        (rec.trainer_name as string | undefined) ||
        ((rec.trainer as Record<string, unknown> | undefined)?.full_name as string | undefined) ||
        '—';
      const g = groups.get(memberId) || { memberName, trainerName, items: [] };
      g.items.push(rec);
      groups.set(memberId, g);
    }
    const now = Date.now();
    return [...groups.entries()].map(([memberId, g], idx) => {
      const totalSessions = g.items.length;
      const completedSessions = g.items.filter((r) => r.status === 'completed').length;
      const hasOverdue = g.items.some((r) => {
        if (r.status === 'completed') return false;
        const at = r.scheduled_at ? new Date(String(r.scheduled_at)).getTime() : NaN;
        return !Number.isNaN(at) && at < now;
      });
      const status: SessionRow['status'] =
        completedSessions === totalSessions && totalSessions > 0
          ? 'completed'
          : hasOverdue
            ? 'overdue'
            : 'active';
      return {
        id: `${memberId || 'row'}-${idx}`,
        memberId,
        memberName: g.memberName,
        trainerName: g.trainerName,
        totalSessions,
        completedSessions,
        status,
      };
    });
  }, [sessions, membersById]);

  const filtered = filter === 'all' ? rows : rows.filter((s) => s.status === filter);
  const isLoading = sessionsLoading || membersLoading;

  const statusLabels: Record<SessionRow['status'], string> = {
    active: isRtl ? 'نشط' : 'Active',
    completed: isRtl ? 'مكتمل' : 'Completed',
    overdue: isRtl ? 'متأخر' : 'Overdue',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'إدارة الجلسات' : 'Session Management'}
        icon="event_note"
        actions={
          <Button variant="primary">
            <span className="material-symbols-outlined">add</span>
            {isRtl ? 'جلسة جديدة' : 'New Session'}
          </Button>
        }
      />

      <UnifiedTabs
        tabs={[
          { key: 'all', labelAr: 'الكل', labelEn: 'All' },
          { key: 'active', labelAr: 'نشط', labelEn: 'Active' },
          { key: 'completed', labelAr: 'مكتمل', labelEn: 'Completed' },
          { key: 'overdue', labelAr: 'متأخر', labelEn: 'Overdue' },
        ]}
        activeKey={filter}
        onChange={(k) => setFilter(k as StatusFilter)}
        variant="pills"
      />

      <Card>
        {isLoading ? (
          <PageLoader variant="skeleton" message={isRtl ? 'جاري التحميل...' : 'Loading...'} />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'العضو' : 'Member'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'المدرب' : 'Trainer'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'التقدم' : 'Progress'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'المبلغ' : 'Amount'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'الحالة' : 'Status'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const progress = s.totalSessions > 0 ? Math.round((s.completedSessions / s.totalSessions) * 100) : 0;
                  return (
                    <tr key={s.id} className="border-t border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <p className="text-sm font-medium text-gray-900">{s.memberName}</p>
                      </td>
                      <td className="p-4 text-sm text-gray-500">{s.trainerName}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 w-24 h-2 rounded-full bg-gray-100">
                            <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {s.completedSessions}/{s.totalSessions}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-sm text-gray-900">—</p>
                      </td>
                      <td className="p-4"><StatusBadge status={statusLabels[s.status]} variant={statusVariant[s.status]} /></td>
                      <td className="p-4">
                        <button className="text-emerald-600 hover:text-emerald-600 transition-colors">
                          <span className="material-symbols-outlined">more_vert</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-gray-500">
                {isRtl ? 'لا توجد جلسات' : 'No sessions found'}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
