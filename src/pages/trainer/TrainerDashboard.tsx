// ====================================================================
// Trainer Dashboard (/trainer/training) — §32: rebuilt on real data.
//
// Previously 100% mock: hardcoded "24 active clients / 8 sessions",
// fabricated member rows (S001–S004 with invented names/amounts), a
// static schedule list and a PAYMENTS_MOCK card. Every figure now comes
// from GET /api/training/sessions?mine=true (pt_sessions scoped to the
// signed-in coach) and session completion writes through the real
// PUT /api/training/sessions/:id/complete. No payment card exists
// because PT income is manager-side (pt_packages) — coaches see
// sessions, not payroll.
// ====================================================================
import { useMemo, useState } from 'react';
import { formatDate, formatTime } from '../../utils/date';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listPtSessions, completePtSession } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';

interface SessionRow {
  id: string;
  member_id: string;
  member_name: string;
  package_id: string;
  package_name: string;
  session_number: number;
  scheduled_at: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
}

function isSameDay(iso: string | null, ref: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

export default function TrainerDashboard() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useApiQuery(
    ['trainer', 'my-sessions'],
    () => listPtSessions({ mine: true }),
    { staleTime: 30_000 },
  );
  const sessions = useMemo(() => ((data?.data ?? []) as unknown) as SessionRow[], [data]);

  const now = new Date();
  const completed = sessions.filter((s) => s.status === 'completed');
  const clientCount = new Set(sessions.map((s) => s.member_id)).size;
  const todaySessions = useMemo(
    () =>
      sessions
        .filter((s) => isSameDay(s.scheduled_at, now) || (s.status === 'completed' && isSameDay(s.completed_at, now)))
        .sort((a, b) => (a.scheduled_at || a.completed_at || '').localeCompare(b.scheduled_at || b.completed_at || '')),
    [sessions], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const monthCompleted = completed.filter((s) =>
    s.completed_at != null &&
    new Date(s.completed_at).getMonth() === now.getMonth() &&
    new Date(s.completed_at).getFullYear() === now.getFullYear(),
  ).length;
  const completionRate = sessions.length > 0 ? Math.round((completed.length / sessions.length) * 100) : 0;

  // Group the coach's sessions by member × package for progress bars.
  const packages = useMemo(() => {
    const map = new Map<string, { member_name: string; package_name: string; total: number; done: number }>();
    sessions.forEach((s) => {
      const k = `${s.member_id}|${s.package_id}`;
      const e = map.get(k) ?? { member_name: s.member_name, package_name: s.package_name, total: 0, done: 0 };
      e.total += 1;
      if (s.status === 'completed') e.done += 1;
      map.set(k, e);
    });
    return [...map.entries()];
  }, [sessions]);

  const handleComplete = async (s: SessionRow) => {
    setBusyId(s.id);
    try {
      await completePtSession(s.id);
      showToast(isRtl ? 'تم إنهاء الجلسة بنجاح' : 'Session completed', 'success');
      refetch();
    } catch {
      showToast(isRtl ? 'تعذر إنهاء الجلسة' : 'Failed to complete session', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const timeOf = (iso: string) => formatTime(iso);
  const dateSubtitle = formatDate(now);

  if (isLoading) return <PageLoader variant="skeleton" />;

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'لوحة المدرب' : 'Trainer Dashboard'}
        subtitle={dateSubtitle}
        icon="fitness_center"
      />

      <StatsGrid
        columns={4}
        stats={[
          { key: 'clients', label: isRtl ? 'أعضائي' : 'My Clients', value: String(clientCount), icon: 'group', color: 'primary' as const },
          { key: 'today', label: isRtl ? 'جلسات اليوم' : "Today's Sessions", value: String(todaySessions.length), icon: 'calendar_today', color: 'secondary' as const },
          { key: 'month', label: isRtl ? 'مكتملة هذا الشهر' : 'Completed This Month', value: String(monthCompleted), icon: 'check_circle', color: 'primary' as const },
          { key: 'rate', label: isRtl ? 'نسبة الإنجاز' : 'Completion Rate', value: `${completionRate}%`, icon: 'trending_up', trend: { value: `${completed.length}/${sessions.length}`, positive: true }, color: 'warning' as const },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {isRtl ? 'جدول اليوم' : "Today's Schedule"}
          </h2>
          {todaySessions.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {isRtl ? 'لا توجد جلسات مجدولة اليوم.' : 'No sessions scheduled today.'}
            </p>
          ) : (
            <div className="space-y-3">
              {todaySessions.map((s) => {
                const when = s.scheduled_at || s.completed_at || '';
                const done = s.status === 'completed';
                return (
                  <div key={s.id} className="flex items-center gap-4 p-3 rounded-2xl bg-gray-50">
                    <div className="w-20 text-center shrink-0">
                      <span className="text-xs text-emerald-600">{timeOf(when)}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{s.member_name}</p>
                      <p className="text-sm text-gray-500">{s.package_name} — {isRtl ? 'جلسة' : 'session'} {s.session_number}</p>
                    </div>
                    {done ? (
                      <StatusBadge status={isRtl ? 'مكتملة' : 'Completed'} variant="neutral" />
                    ) : (
                      <Button variant="primary" onClick={() => handleComplete(s)} disabled={busyId === s.id}>
                        {isRtl ? 'إنهاء' : 'Complete'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {isRtl ? 'باقاتي الجارية' : 'My Packages In Progress'}
          </h2>
          {packages.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {isRtl ? 'لا توجد جلسات PT مسجلة لك بعد.' : 'No PT sessions assigned to you yet.'}
            </p>
          ) : (
            <div className="space-y-3">
              {packages.map(([k, p]) => {
                const progress = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                return (
                  <div key={k} className="p-4 rounded-2xl bg-gray-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{p.member_name}</p>
                      <StatusBadge
                        status={p.done === p.total ? (isRtl ? 'مكتملة' : 'Finished') : (isRtl ? 'جارية' : 'Active')}
                        variant={p.done === p.total ? 'neutral' : 'success'}
                      />
                    </div>
                    <p className="text-xs text-gray-500">{p.package_name}</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{p.done}/{p.total}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="flex gap-3">
        <Button variant="primary" onClick={() => navigate('/trainer/training/pt')}>
          <span className="material-symbols-outlined">event_available</span>
          {isRtl ? 'إدارة الجلسات' : 'Manage Sessions'}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/trainer/training/clients')}>
          <span className="material-symbols-outlined">trending_up</span>
          {isRtl ? 'تقدم الأعضاء' : 'Client Progress'}
        </Button>
      </div>
    </div>
  );
}
