// ====================================================================
// Client Progress (/trainer/training/clients) — §32: rebuilt on real data.
//
// Previously 100% mock: fabricated member dropdown, static "18 sessions /
// 82 kg / 15% fat / 94% attendance" cards, invented session history and a
// "Save Note" button that only cleared the textarea. Everything now comes
// from real endpoints: member search via GET /api/customer360/search,
// sessions via GET /api/training/sessions?member_id=, and gym-visit stats
// via GET /api/customer360/:id (attendance_logs aggregates). Body
// measurements (weight/body-fat) were dropped entirely — no table stores
// them; faking them would violate the no-mocks rule. Trainer notes are
// read from pt_sessions.notes written by the real complete-session flow.
// ====================================================================
import { useMemo, useState } from 'react';
import { formatDate } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { searchMembers, listPtSessions, getCustomer360 } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import FilterBar from '../../components/shared/FilterBar';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';

interface ClientOption {
  id: string;
  full_name: string;
}

interface SessionRow {
  id: string;
  package_name: string;
  session_number: number;
  scheduled_at: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
}

const fmtDate = (iso: string | null, _isRtl?: boolean) =>
  iso ? formatDate(iso) : '—';

export default function ClientProgress() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [client, setClient] = useState<ClientOption | null>(null);

  const { data: resultsData } = useApiQuery(
    ['client-progress', 'search', search],
    () => searchMembers(search),
    // server requires >=2 chars to search (400 otherwise) — mirror it here.
    { enabled: search.trim().length >= 2, staleTime: 30_000 },
  );
  const results = (resultsData?.data ?? []) as ClientOption[];

  const { data: sessionsData, isLoading: sessionsLoading } = useApiQuery(
    ['client-progress', 'sessions', client?.id ?? ''],
    () => listPtSessions({ member_id: client!.id }),
    { enabled: !!client, staleTime: 30_000 },
  );
  const sessions = useMemo(
    () => ((sessionsData?.data ?? []) as unknown) as SessionRow[],
    [sessionsData],
  );

  const { data: c360Data } = useApiQuery(
    ['client-progress', '360', client?.id ?? ''],
    () => getCustomer360(client!.id),
    { enabled: !!client, staleTime: 30_000 },
  );
  const c360 = c360Data?.data;
  const stats = c360?.stats;

  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const completionRate = sessions.length > 0 ? Math.round((completedCount / sessions.length) * 100) : 0;
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) =>
      (b.completed_at || b.scheduled_at || '').localeCompare(a.completed_at || a.scheduled_at || '')),
    [sessions],
  );
  const noted = sortedSessions.filter((s) => s.notes && s.notes.trim());

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'تقدم الأعضاء' : 'Client Progress'}
        icon="trending_up"
      />

      <Card>
        <div className="relative">
          <FilterBar
            search={search}
            onSearchChange={(v) => { setSearch(v); setShowDropdown(true); }}
            searchPlaceholder={isRtl ? 'ابحث عن عضو باسمه أو هاتفه...' : 'Search member by name or phone...'}
            extraActions={
              client ? (
                <div className="flex items-center gap-2 px-4 py-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-medium">
                    {client.full_name.trim().charAt(0)}
                  </div>
                  <span className="text-sm font-medium text-gray-900">{client.full_name}</span>
                </div>
              ) : undefined
            }
          />
          {showDropdown && search.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl border border-gray-100 shadow-sm z-10 overflow-hidden">
              {results.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">{isRtl ? 'لا نتائج مطابقة.' : 'No matches.'}</p>
              ) : (
                results.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setClient(m); setSearch(''); setShowDropdown(false); }}
                    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-right"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-sm font-medium">
                      {m.full_name.trim().charAt(0)}
                    </div>
                    <span className="text-sm text-gray-900">{m.full_name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </Card>

      {!client ? (
        <Card>
          <p className="text-sm text-gray-500 py-10 text-center">
            {isRtl ? 'ابحث عن عضو لعرض جلسات التقدم الفعلية الخاصة به.' : 'Search a member to see their real progress sessions.'}
          </p>
        </Card>
      ) : sessionsLoading ? (
        <Card>
          <p className="text-sm text-gray-500 py-10 text-center">{isRtl ? 'جارٍ التحميل…' : 'Loading…'}</p>
        </Card>
      ) : sessions.length === 0 && !stats ? (
        <Card>
          <p className="text-sm text-gray-500 py-10 text-center">
            {isRtl ? 'لا توجد جلسات PT أو زيارات مسجلة لهذا العضو بعد.' : 'This member has no PT sessions or gym visits recorded yet.'}
          </p>
        </Card>
      ) : (
        <>
          <StatsGrid
            columns={4}
            stats={[
              { key: 'done', label: isRtl ? 'الجلسات المنفذة' : 'Completed Sessions', value: String(completedCount), icon: 'check_circle', color: 'primary' as const },
              { key: 'rate', label: isRtl ? 'نسبة إنجاز الجلسات' : 'Session Completion', value: `${completionRate}%`, icon: 'trending_up', trend: { value: `${completedCount}/${sessions.length}`, positive: true }, color: 'primary' as const },
              { key: 'visits', label: isRtl ? 'إجمالي زيارات الصالة' : 'Total Gym Visits', value: String(stats?.total_checkins ?? 0), icon: 'fitness_center', color: 'secondary' as const },
              { key: 'last', label: isRtl ? 'آخر زيارة' : 'Last Visit', value: fmtDate(stats?.last_checkin ?? null, isRtl), icon: 'schedule', color: 'secondary' as const },
            ]}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {isRtl ? 'سجل الجلسات' : 'Session History'}
              </h2>
              {sortedSessions.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">{isRtl ? 'لا جلسات PT بعد.' : 'No PT sessions yet.'}</p>
              ) : (
                <div className="space-y-4">
                  {sortedSessions.slice(0, 20).map((s) => (
                    <div key={s.id} className="relative pr-6 pb-4 border-r-2 border-emerald-500/30 last:pb-0 last:border-transparent">
                      <div className="absolute right-0 top-0 -translate-x-1/2 w-3 h-3 rounded-full bg-emerald-500" />
                      <div className="mr-2">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs text-emerald-600">{fmtDate(s.completed_at || s.scheduled_at, isRtl)}</span>
                          <StatusBadge
                            status={s.status === 'completed' ? (isRtl ? 'مكتملة' : 'Completed') : (isRtl ? 'مجدولة' : 'Scheduled')}
                            variant={s.status === 'completed' ? 'success' : 'warning'}
                          />
                        </div>
                        <p className="text-sm font-medium text-gray-900">{s.package_name} — {isRtl ? 'جلسة' : 'session'} {s.session_number}</p>
                        {s.notes && <p className="text-sm text-gray-500 mt-1">{s.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {isRtl ? 'ملاحظات الجلسات' : 'Session Notes'}
              </h2>
              {noted.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">
                  {isRtl ? 'لا ملاحظات بعد — تُكتب الملاحظات عند إنهاء الجلسات.' : 'No notes yet — notes are written when sessions are completed.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {noted.map((s) => (
                    <div key={s.id} className="p-4 rounded-2xl bg-gray-50">
                      <p className="text-xs text-emerald-600">{fmtDate(s.completed_at, isRtl)} — {s.package_name} #{s.session_number}</p>
                      <p className="text-sm text-gray-900 mt-1">{s.notes}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
