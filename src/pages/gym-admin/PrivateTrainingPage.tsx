import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X, Barbell as Dumbbell, Ticket } from '@phosphor-icons/react';
import Modal from '../../components/shared/Modal';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney } from '../../utils/currency';
import { formatDate, fmtNum } from '../../utils/date';
import {
  listPtEnrollments, consumePtSession, cancelPtEnrollment, ptReport,
  type PtEnrollmentRow,
} from '../../services/api';
import { DashboardPage, PrimaryAction, StatCard, Panel, EmptyState } from '../../components/dashboard';
import PageLoader from '../../components/shared/PageLoader';
import StatusBadge from '../../components/ui/StatusBadge';

// ====================================================================
// البرايفت (/admin/private-training) — منتج مستقل: رصيد الحصص مستهلك/كلي
// ظاهر في نفس صف الفلوس دائمًا. التبويبات أقسام ب derived_status (نشط/
// مكتمل/ملغي) لا فلترًا إضافيًا. مديونية البرايفت منفصلة (kind='pt')
// بنفس شاشة الديون عبر ?kind=pt.
// ====================================================================

const TABS = [
  { key: 'active', ar: 'النشط', en: 'Active' },
  { key: 'completed', ar: 'المكتمل', en: 'Completed' },
  { key: 'cancelled', ar: 'الملغي', en: 'Cancelled' },
  { key: 'all', ar: 'الكل', en: 'All' },
] as const;

export default function PrivateTrainingPage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);
  const [tab, setTab] = useState<string>('active');
  const [showReport, setShowReport] = useState(false);

  const { data, isLoading, isError } = useApiQuery(
    ['pt-enrollments', tab],
    () => listPtEnrollments(tab),
    { staleTime: 30_000 },
  );
  const rows = data?.data ?? [];
  const stats = data?.stats;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pt-enrollments'] });
    queryClient.invalidateQueries({ queryKey: ['debts-screen'] });
  };

  const consume = useMutation({
    mutationFn: (r: PtEnrollmentRow) => consumePtSession(r.id),
    onSuccess: (res) => {
      invalidate();
      const d = res.data;
      showToast(
        rtl ? `تم تسجيل حصة — المستهلك ${fmtNum(d.sessions_used)}/${fmtNum(d.total_sessions)}${d.status === 'completed' ? ' (اكتمل)' : ''}` : 'Session consumed',
        'success',
      );
    },
    onError: (e) => showToast(
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'لا حصص متاحة' : 'Nothing consumable'),
      'error',
    ),
  });

  const cancel = useMutation({
    mutationFn: (r: PtEnrollmentRow) => cancelPtEnrollment(r.id),
    onSuccess: () => { invalidate(); showToast(rtl ? 'تم إلغاء البرايفت' : 'Cancelled', 'success'); },
    onError: (e) => showToast(
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'فشل الإلغاء' : 'Cancel failed'),
      'error',
    ),
  });

  const statusBadge = (s: string) => s === 'active'
    ? <StatusBadge status={rtl ? 'نشط' : 'Active'} variant="success" />
    : s === 'completed'
      ? <StatusBadge status={rtl ? 'مكتمل' : 'Completed'} variant="neutral" />
      : <StatusBadge status={rtl ? 'ملغي' : 'Cancelled'} variant="error" />;

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        actions={
          <PrimaryAction onClick={() => navigate('/admin/private-training/add')}>
            <Plus size={16} />
            {rtl ? 'تسجيل برايفت جديد' : 'New private'}
          </PrimaryAction>
        }
      >
        {/* ── الكروت الأربعة ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={Dumbbell} label={rtl ? 'برايفت نشط' : 'Active PT'} value={fmtNum(stats?.active_count ?? 0)} accent="emerald" />
          <StatCard icon={Check} label={rtl ? 'إجمالي المدفوعات' : 'Total paid'} value={money(stats?.total_paid ?? 0)} accent="sky" onClick={() => navigate('/admin/payments')} />
          <StatCard icon={X} label={rtl ? 'إجمالي المديونية' : 'Total dues'} value={money(stats?.total_debt ?? 0)} accent="rose" onClick={() => navigate('/admin/debts?kind=pt')} />
          <StatCard icon={Ticket} label={rtl ? 'إجمالي الحصص' : 'Total sessions'} value={fmtNum(stats?.total_sessions ?? 0)} accent="amber" />
        </div>

        {/* ── التبويبات + اللينكات الفرعية ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1.5 bg-white border border-gray-100 rounded-2xl p-1 shadow-sm">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                  tab === t.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {rtl ? t.ar : t.en}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <button type="button" onClick={() => setShowReport(true)} className="text-emerald-600 hover:text-emerald-700 hover:underline">
              {rtl ? 'تقارير البرايفت' : 'PT reports'}
            </button>
            <span className="text-gray-300">|</span>
            <Link to="/admin/debts?kind=pt" className="text-emerald-600 hover:text-emerald-700 hover:underline">
              {rtl ? 'مديونية البرايفت' : 'PT dues'}
            </Link>
          </div>
        </div>

        {/* ── الجدول ── */}
        <Panel title={`${rtl ? 'البرايفت' : 'Private training'} (${fmtNum(rows.length)})`}>
          {isLoading ? (
            <PageLoader variant="skeleton" rows={5} />
          ) : isError ? (
            <p className="text-sm text-red-500 text-center py-8">{rtl ? 'فشل التحميل' : 'Failed to load'}</p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              accent="gray"
              title={rtl ? 'لا برايفت هنا' : 'Nothing here'}
              description={rtl ? 'سجّل أول برايفت من الزر أعلاه.' : 'Record the first one above.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">#</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'العضو' : 'Member'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المدرب' : 'Coach'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحصص' : 'Sessions'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المبلغ' : 'Total'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المدفوع' : 'Paid'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المتبقي' : 'Rest'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'البداية' : 'From'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'النهاية' : 'To'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'إجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const canConsume = r.derived_status === 'active' && r.sessions_used < r.total_sessions;
                    return (
                      <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-3 text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-3">
                          <span className="block font-medium whitespace-nowrap">{r.member_name || '—'}</span>
                          {r.member_phone && <span className="block text-xs text-gray-500" dir="ltr">{r.member_phone}</span>}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{r.coach_name || '—'}</td>
                        <td className="px-3 py-3 whitespace-nowrap font-bold">
                          <span className="text-emerald-600">{fmtNum(r.sessions_used)}</span>
                          <span className="text-gray-400">/{fmtNum(r.total_sessions)}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{money(r.total_amount)}</td>
                        <td className="px-3 py-3 font-semibold text-emerald-600 whitespace-nowrap">{money(r.paid_amount)}</td>
                        <td className={`px-3 py-3 whitespace-nowrap ${r.remaining > 0 ? 'font-bold text-red-600' : 'text-gray-300'}`}>
                          {r.remaining > 0 ? money(r.remaining) : '—'}
                        </td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.start_date)}</td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.end_date)}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col items-start gap-1">
                            {statusBadge(r.derived_status)}
                            {r.derived_status === 'active' && (
                              <button
                                type="button"
                                onClick={() => { if (confirm(rtl ? 'إلغاء هذا البرايفت؟' : 'Cancel this enrollment?')) cancel.mutate(r); }}
                                className="text-[11px] text-gray-400 hover:text-red-600 font-semibold"
                              >
                                {rtl ? 'إلغاء' : 'Cancel'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => consume.mutate(r)}
                            disabled={!canConsume || consume.isPending}
                            title={canConsume
                              ? (rtl ? 'تسجيل حصة مستهلكة' : 'Log a consumed session')
                              : (rtl ? 'لا حصص متاحة' : 'Nothing consumable')}
                            className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {rtl ? '+ حصة' : '+ Session'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </DashboardPage>

      {/* تقارير البرايفت الشهرية */}
      {showReport && <PtReportModal rtl={rtl} onClose={() => setShowReport(false)} money={money} />}
    </div>
  );
}

function PtReportModal({ rtl, onClose, money }: { rtl: boolean; onClose: () => void; money: (v: unknown) => string }) {
  const { data, isLoading } = useApiQuery(['pt-enrollments', 'report'], ptReport, { staleTime: 60_000 });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      dir={rtl ? 'rtl' : 'ltr'}
      title={rtl ? 'تقارير البرايفت' : 'PT reports'}
    >
      {isLoading ? (
        <PageLoader variant="skeleton" rows={4} />
      ) : (
        <table className="w-full text-sm text-gray-900">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{rtl ? 'الشهر' : 'Month'}</th>
              <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{rtl ? 'تسجيلات' : 'Sales'}</th>
              <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{rtl ? 'محصّل' : 'In'}</th>
              <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500">{rtl ? 'مستحق' : 'Due'}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.data ?? []).map((r) => (
              <tr key={r.month} className="border-t border-gray-100">
                <td className="px-4 py-2.5 tabular-nums" dir="ltr">{r.month}</td>
                <td className="px-4 py-2.5 tabular-nums">{fmtNum(r.enrollments)}</td>
                <td className="px-4 py-2.5 tabular-nums text-emerald-600 font-semibold">{money(r.collected)}</td>
                <td className="px-4 py-2.5 tabular-nums text-red-600 font-semibold">{money(r.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
