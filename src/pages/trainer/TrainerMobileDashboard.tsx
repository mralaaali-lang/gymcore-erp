import { useMemo, useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listPtSessions, listMembers } from '../../services/api';
import PageLoader from '../../components/shared/PageLoader';
import StatusBadge from '../../components/ui/StatusBadge';

export default function TrainerMobileDashboard() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [tab, setTab] = useState<'today' | 'clients'>('today');

  const { data: sessionsData, isLoading: sessionsLoading } = useApiQuery(
    ['pt-sessions'],
    () => listPtSessions(),
  );
  const { data: membersData, isLoading: membersLoading } = useApiQuery(
    ['members'],
    () => listMembers(),
  );

  const sessions = useMemo(() => (sessionsData?.data ?? []) as unknown as Record<string, unknown>[], [sessionsData]);
  const members = useMemo(() => membersData?.members ?? [], [membersData]);

  const memberNameOf = (rec: Record<string, unknown>): string =>
    (rec.member_name as string | undefined) ||
    ((rec.member as Record<string, unknown> | undefined)?.full_name as string | undefined) ||
    members.find((m) => m.id === String(rec.member_id ?? ''))?.full_name ||
    (isRtl ? 'عضو' : 'Member');

  const todaySessions = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => {
      const at = a.scheduled_at ? new Date(String(a.scheduled_at)).getTime() : 0;
      const bt = b.scheduled_at ? new Date(String(b.scheduled_at)).getTime() : 0;
      return at - bt;
    });
    return sorted.slice(0, 10).map((rec, idx) => ({
      id: String(rec.id ?? idx),
      client: memberNameOf(rec),
      time: rec.scheduled_at
        ? new Date(String(rec.scheduled_at)).toLocaleString(isRtl ? 'ar-EG' : 'en-US', {
            hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
          })
        : '—',
      detail: rec.session_number ? `${isRtl ? 'جلسة' : 'Session'} ${String(rec.session_number)}` : '—',
      completed: rec.status === 'completed',
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, members, isRtl]);

  const clients = useMemo(() => {
    const groups = new Map<string, { name: string; total: number; completed: number; plan: string }>();
    for (const rec of sessions) {
      const key = String(rec.member_id ?? rec.member_name ?? '');
      const g = groups.get(key) || {
        name: memberNameOf(rec),
        total: 0,
        completed: 0,
        plan: ((rec.package as Record<string, unknown> | undefined)?.name as string | undefined) || '',
      };
      g.total += 1;
      if (rec.status === 'completed') g.completed += 1;
      groups.set(key, g);
    }
    const rows = members.map((m) => {
      const g = groups.get(m.id);
      const total = g?.total ?? 0;
      const completed = g?.completed ?? 0;
      return {
        id: m.id,
        name: m.full_name,
        sessions: total,
        goal: g?.plan || m.plan_name || '—',
        progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    });
    // Include session members not present in the members list
    for (const [key, g] of groups) {
      if (!rows.some((r) => r.id === key)) {
        rows.push({
          id: key || g.name,
          name: g.name,
          sessions: g.total,
          goal: g.plan || '—',
          progress: g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0,
        });
      }
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, members]);

  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const attendance = sessions.length > 0 ? `${Math.round((completedCount / sessions.length) * 100)}%` : '—';
  const isLoading = sessionsLoading || membersLoading;

  return (
    <div className="min-h-screen bg-gray-50 pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 text-white">
        <h1 className="text-xl font-bold">{isRtl ? 'لوحة المدرب' : 'Trainer Dashboard'}</h1>
        <p className="text-white/70 text-sm mt-1">
          {isRtl ? `اليوم: ${new Date().toLocaleDateString('ar-EG')}` : `Today: ${new Date().toLocaleDateString('en-US')}`}
        </p>
      </div>

      <div className="px-4 -mt-6">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 grid grid-cols-3 gap-3 text-center">
          <div><p className="text-lg font-bold text-emerald-600">{todaySessions.length}</p><p className="text-xs text-gray-500">{isRtl ? 'حصص اليوم' : "Today's Sessions"}</p></div>
          <div><p className="text-lg font-bold text-emerald-600">{clients.length}</p><p className="text-xs text-gray-500">{isRtl ? 'عملاء نشطاء' : 'Active Clients'}</p></div>
          <div><p className="text-lg font-bold text-emerald-600">{attendance}</p><p className="text-xs text-gray-500">{isRtl ? 'حضور' : 'Attendance'}</p></div>
        </div>
      </div>

      <div className="flex gap-2 mx-4 mt-4 bg-gray-100 rounded-2xl p-1">
        <button onClick={() => setTab('today')}
          className={`flex-1 py-2 text-sm rounded-xl font-medium transition-colors ${tab === 'today' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          {isRtl ? 'اليوم' : 'Today'}
        </button>
        <button onClick={() => setTab('clients')}
          className={`flex-1 py-2 text-sm rounded-xl font-medium transition-colors ${tab === 'clients' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          {isRtl ? 'العملاء' : 'Clients'}
        </button>
      </div>

      {isLoading ? (
        <div className="px-4 mt-4">
          <PageLoader message={isRtl ? 'جاري التحميل...' : 'Loading...'} />
        </div>
      ) : tab === 'today' ? (
        <div className="px-4 mt-4 space-y-2">
          {todaySessions.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">{isRtl ? 'لا توجد جلسات' : 'No sessions found'}</p>
          )}
          {todaySessions.map((s) => (
            <div key={s.id} className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
              <div className={`w-1 h-12 rounded-full ${s.completed ? 'bg-emerald-500' : 'bg-yellow-400'}`} />
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">{s.client}</p>
                <p className="text-xs text-gray-500">{s.time} • {s.detail}</p>
              </div>
              <StatusBadge
                status={s.completed ? (isRtl ? 'مكتمل' : 'Completed') : (isRtl ? 'معلق' : 'Pending')}
                variant={s.completed ? 'success' : 'warning'}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 mt-4 space-y-2">
          {clients.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">{isRtl ? 'لا يوجد عملاء' : 'No clients found'}</p>
          )}
          {clients.map((c) => (
            <div key={c.id} className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-white text-xl">person</span>
                  </span>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.goal} • {c.sessions} {isRtl ? 'جلسة' : 'sessions'}</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-gray-400">arrow_forward_ios</span>
              </div>
              <div className="bg-gray-100 rounded-full h-2">
                <div className="bg-emerald-500 rounded-full h-2 transition-all" style={{ width: `${c.progress}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{c.progress}% {isRtl ? 'اكتمال' : 'complete'}</p>
            </div>
          ))}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2">
        <div className="flex justify-around">
          {[
            { icon: 'calendar_month', label: isRtl ? 'الجدول' : 'Schedule' },
            { icon: 'group', label: isRtl ? 'العملاء' : 'Clients' },
            { icon: 'bar_chart', label: isRtl ? 'التقارير' : 'Reports' },
            { icon: 'settings', label: isRtl ? 'الإعدادات' : 'Settings' },
          ].map((item, i) => (
            <button key={i} className="flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-gray-500">{item.icon}</span>
              <span className="text-[10px] text-gray-500">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

