import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  getTrainerProgressToday, getTrainerProgressHistory, saveTrainerProgress, deleteTrainerProgress,
} from '../../services/api';
import type { TrainerProgressLog } from '../../services/api';
import { formatDate } from '../../utils/date';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Users, CalendarDots, Timer, Trash, Pencil, FloppyDisk } from '@phosphor-icons/react';

// §41 — trainer daily progress log. Real CRUD on trainer_progress_logs
// (migration 069) via /api/trainer-progress/* — one row per trainer per day;
// saving the same date twice upserts it server-side.
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface LogForm {
  log_date: string;
  client_count: string;
  session_count: string;
  duration_minutes: string;
  notes: string;
}

const emptyForm = (): LogForm => ({ log_date: todayIso(), client_count: '', session_count: '', duration_minutes: '', notes: '' });

export default function TrainerProgress() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';

  const [form, setForm] = useState<LogForm>(emptyForm);

  const todayQuery = useApiQuery(['trainer-progress', 'today'], () => getTrainerProgressToday());
  const historyQuery = useApiQuery(['trainer-progress', 'history'], () => getTrainerProgressHistory(30), { staleTime: 5 * 60_000 });
  const history: TrainerProgressLog[] = useMemo(() => historyQuery.data?.data ?? [], [historyQuery.data]);

  // Prefill the form when today's log loads (or re-loads after a save).
  useEffect(() => {
    const t = todayQuery.data?.data;
    if (t) {
      setForm({
        log_date: t.log_date.slice(0, 10),
        client_count: String(t.client_count ?? 0),
        session_count: String(t.session_count ?? 0),
        duration_minutes: String(t.duration_minutes ?? 0),
        notes: t.notes ?? '',
      });
    }
  }, [todayQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (f: LogForm) => saveTrainerProgress({
      log_date: f.log_date,
      client_count: parseInt(f.client_count, 10) || 0,
      session_count: parseInt(f.session_count, 10) || 0,
      duration_minutes: parseInt(f.duration_minutes, 10) || 0,
      notes: f.notes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainer-progress'] });
      showToast(isRtl ? 'تم حفظ السجل' : 'Log saved', 'success');
    },
    onError: () => showToast(isRtl ? 'فشل الحفظ' : 'Failed to save', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTrainerProgress(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainer-progress'] });
      showToast(isRtl ? 'تم حذف السجل' : 'Log deleted', 'success');
    },
    onError: () => showToast(isRtl ? 'فشل الحذف' : 'Failed to delete', 'error'),
  });

  const totals = useMemo(() => ({
    clients: history.reduce((s, l) => s + (l.client_count || 0), 0),
    sessions: history.reduce((s, l) => s + (l.session_count || 0), 0),
    minutes: history.reduce((s, l) => s + (l.duration_minutes || 0), 0),
  }), [history]);

  const editingToday = form.log_date === todayIso();

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'التقدم اليومي' : 'Daily Progress'}
        subtitle={isRtl ? 'سجل عملاءك وجلساتك ودقائقك يومًا بيوم' : 'Log your clients, sessions and minutes day by day'}
        icon="tracking_updates"
      />

      {/* 30-day totals — honest aggregates over the loaded history window */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: isRtl ? 'عملاء (30 يومًا)' : 'Clients (30 days)', value: totals.clients, icon: Users, color: 'text-blue-700 bg-blue-50' },
          { label: isRtl ? 'جلسات (30 يومًا)' : 'Sessions (30 days)', value: totals.sessions, icon: CalendarDots, color: 'text-emerald-700 bg-emerald-50' },
          { label: isRtl ? 'دقائق (30 يومًا)' : 'Minutes (30 days)', value: totals.minutes.toLocaleString('en-US'), icon: Timer, color: 'text-amber-700 bg-amber-50' },
        ].map((c) => (
          <div key={c.label} className={`rounded-2xl border p-4 ${c.color}`}>
            <c.icon size={20} />
            <p className="text-2xl font-bold mt-2">{c.value}</p>
            <p className="text-sm mt-1 opacity-80">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Log form — centered card; saving an existing date upserts it */}
      <Card>
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <FloppyDisk size={18} className="text-primary" />
          {editingToday
            ? (isRtl ? 'سجل اليوم' : "Today's Log")
            : (isRtl ? `سجل يوم ${formatDate(form.log_date)}` : `Log for ${formatDate(form.log_date)}`)}
        </h3>
        <form
          onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{isRtl ? 'التاريخ' : 'Date'}</label>
            <input type="date" value={form.log_date} max={todayIso()}
              onChange={(e) => setForm(f => ({ ...f, log_date: e.target.value }))}
              className="w-full min-h-[48px] px-3 py-2 text-base border border-gray-200 rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{isRtl ? 'عدد العملاء' : 'Clients'}</label>
            <input type="number" min={0} value={form.client_count} placeholder="0"
              onChange={(e) => setForm(f => ({ ...f, client_count: e.target.value }))}
              className="w-full min-h-[48px] px-3 py-2 text-base border border-gray-200 rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{isRtl ? 'عدد الجلسات' : 'Sessions'}</label>
            <input type="number" min={0} value={form.session_count} placeholder="0"
              onChange={(e) => setForm(f => ({ ...f, session_count: e.target.value }))}
              className="w-full min-h-[48px] px-3 py-2 text-base border border-gray-200 rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{isRtl ? 'المدة (دقائق)' : 'Minutes'}</label>
            <input type="number" min={0} value={form.duration_minutes} placeholder="0"
              onChange={(e) => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
              className="w-full min-h-[48px] px-3 py-2 text-base border border-gray-200 rounded-xl" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{isRtl ? 'ملاحظات' : 'Notes'}</label>
            <input type="text" value={form.notes}
              placeholder={isRtl ? 'ملاحظات سريعة عن اليوم' : 'Quick notes about the day'}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full min-h-[48px] px-3 py-2 text-base border border-gray-200 rounded-xl" />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="primary" disabled={saveMutation.isPending} className="w-full min-h-[48px] justify-center">
              {saveMutation.isPending
                ? <span className="material-symbols-outlined animate-spin">progress_activity</span>
                : <FloppyDisk size={18} />}
              {isRtl ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </form>
      </Card>

      {/* History — last 30 logs */}
      <Card>
        <h3 className="font-bold text-gray-900 mb-4">{isRtl ? 'آخر 30 يومًا' : 'Last 30 days'}</h3>
        {historyQuery.isLoading ? (
          <PageLoader message={isRtl ? 'جاري التحميل...' : 'Loading...'} />
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            {isRtl ? 'لا توجد سجلات بعد — ابدأ بسجل اليوم' : 'No logs yet — start with today'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'التاريخ' : 'Date'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'عملاء' : 'Clients'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'جلسات' : 'Sessions'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'دقائق' : 'Minutes'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'ملاحظات' : 'Notes'}</th>
                  <th className="text-right p-4 text-xs font-semibold text-gray-500">{isRtl ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm font-medium text-gray-900">{formatDate(l.log_date)}</td>
                    <td className="p-4 text-sm text-gray-700">{l.client_count}</td>
                    <td className="p-4 text-sm text-gray-700">{l.session_count}</td>
                    <td className="p-4 text-sm text-gray-700">{l.duration_minutes}</td>
                    <td className="p-4 text-sm text-gray-500 max-w-[240px] truncate">{l.notes || '—'}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <button type="button"
                          title={isRtl ? 'تعديل' : 'Edit'}
                          onClick={() => setForm({
                            log_date: l.log_date.slice(0, 10),
                            client_count: String(l.client_count ?? 0),
                            session_count: String(l.session_count ?? 0),
                            duration_minutes: String(l.duration_minutes ?? 0),
                            notes: l.notes ?? '',
                          })}
                          className="p-2.5 min-h-[44px] min-w-[44px] text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Pencil size={16} />
                        </button>
                        <button type="button"
                          title={isRtl ? 'حذف' : 'Delete'}
                          onClick={() => { if (window.confirm(isRtl ? 'حذف سجل هذا اليوم؟' : 'Delete this day?')) deleteMutation.mutate(l.id); }}
                          disabled={deleteMutation.isPending}
                          className="p-2.5 min-h-[44px] min-w-[44px] text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
