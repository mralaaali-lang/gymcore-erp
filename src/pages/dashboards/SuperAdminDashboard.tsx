import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatDate, formatDateTime } from '../../utils/date';
import {
  getPlatformOverview,
  getEnforcementQueue,
  listPlatformAudit,
  listPlatformGyms,
  listBillingPlans,
  setPlatformGymActive,
  getOnboardingProgress,
} from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import { StatCard, Panel, Banner } from '../../components/dashboard';
import ContractsPanel from '../super-admin/contracts/ContractsPanel';
import ContractDetailModal from '../super-admin/contracts/ContractDetailModal';
import ContractFormModal from '../super-admin/contracts/ContractFormModal';
import { fmtMoney, cycleLabel, todayIso } from '../super-admin/contracts/contractsUtils';
import type { PlatformContract } from '../../services/api';
import {
  Buildings as Building2,
  FileText,
  Headset,
  MegaphoneSimple as Megaphone,
  Receipt,
  ActivityIcon as Activity,
  ShieldCheck,
  ClipboardText as ClipboardCheck,
  Plus,
  CheckCircle as CheckCircle2,
  Warning as AlertTriangle,
  CalendarCheck as CalendarClock,
  Cpu,
  Envelope as Mail,
  ArrowsClockwise as RefreshCw,
  ArrowSquareOut as ExternalLink,
  Prohibit as Ban
} from '@phosphor-icons/react';

// ════════════════════════════════════════════════════════════════════
// §40 — مركز إجراءات المنصة: كل رقم وكارت هنا من /platform/overview
// و/platform/enforcement و/platform/security/audit وcontracts APIs.
// لا قيم افتراضية، لا تكرار مع صفحات الأدمن الأخرى (قاعدة «لا أوهام»).
// ════════════════════════════════════════════════════════════════════

const ACTION_BADGE_CLASS: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-sky-100 text-sky-700',
  RENEW: 'bg-violet-100 text-violet-700',
  ISSUE: 'bg-amber-100 text-amber-700',
  MARK_PAID: 'bg-emerald-100 text-emerald-700',
  CANCEL: 'bg-red-100 text-red-700',
  DELETE: 'bg-red-100 text-red-700',
  REVOKE: 'bg-red-100 text-red-700',
  GRANT: 'bg-teal-100 text-teal-700',
  ACTIVATE: 'bg-emerald-100 text-emerald-700',
  DEACTIVATE: 'bg-gray-200 text-gray-600',
  LOGIN: 'bg-gray-100 text-gray-500',
  LOGOUT: 'bg-gray-100 text-gray-500',
};

const PRIORITY_CLASS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-500',
};

const RENEWAL_DOT = ['bg-emerald-500', 'bg-cyan-500', 'bg-violet-500', 'bg-amber-500', 'bg-sky-500', 'bg-rose-500', 'bg-teal-500', 'bg-indigo-500'];

export default function SuperAdminDashboard() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';
  const t = (en: string, ar: string) => (isRtl ? ar : en);

  // ── بيانات حية (§40) ──
  const { data: overviewRes, isLoading } = useApiQuery(['platform', 'overview'], getPlatformOverview, { staleTime: 30_000 });
  const { data: enforcementRes } = useApiQuery(['platform', 'enforcement'], getEnforcementQueue, { staleTime: 30_000 });
  const { data: auditRes } = useApiQuery(['platform', 'audit', 'recent'], () => listPlatformAudit({ limit: 8 }), { staleTime: 30_000 });
  const { data: gymsRes } = useApiQuery(['platform', 'gyms'], listPlatformGyms, { staleTime: 30_000 });
  const { data: plansRes } = useApiQuery(['platform', 'plans'], () => listBillingPlans(), { staleTime: 300_000 });
  const { data: onboardingRes } = useApiQuery(['onboarding-progress'], getOnboardingProgress, { staleTime: 60_000 });

  const ov = overviewRes?.data;
  const enforcement = enforcementRes?.data ?? [];
  const audits = auditRes?.data ?? [];

  // ── مودالات العقد ──
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingContract, setEditingContract] = useState<PlatformContract | undefined>(undefined);

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => setPlatformGymActive(id, is_active),
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'enforcement'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'gyms'] });
      showToast(
        vars.is_active ? t('Gym activated', 'تم تفعيل الصالة') : t('Gym suspended', 'تم إيقاف الصالة'),
        'success',
      );
    },
    onError: () => showToast(t('Operation failed', 'فشل التنفيذ'), 'error'),
  });

  const onboardingIncomplete = onboardingRes?.data && !onboardingRes.data.onboarding_complete;

  // ── MRR حسب العملة (كل سطر عملة حقيقية من platform_contracts) ──
  const mrrRows = ov?.billing.mrr_by_currency ?? [];
  const topMrr = mrrRows[0];
  const otherMrr = mrrRows.slice(1).map((r) => `${fmtMoney(r.mrr, r.currency)}`).join(' · ');

  const invoicesDue = (ov?.billing.pending_invoices ?? 0) + (ov?.billing.overdue_invoices ?? 0);

  return (
    <div className="bg-gray-50 min-h-screen -m-6 p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t('Platform Action Hub', 'مركز إجراءات المنصة')}
        subtitle={t('Live SaaS operations — contracts, renewals, enforcement, audit trail', 'عمليات الـ SaaS الحية — عقود وتجديدات وتنفيذ وسجل تدقيق')}
        icon="hub"
      />

      <div className="space-y-6">
        {/* ═══ شريط إعداد المنصة ═══ */}
        {onboardingIncomplete && (
          <Banner
            tone="emerald"
            title={t('Complete Platform Setup', 'إعداد المنصة')}
            description={t('Finish the onboarding wizard to configure your platform settings', 'أكمل معيار الإعداد لتخصيص إعدادات المنصة')}
            actions={
              <Link to="/super-admin/onboarding" className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-900 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-colors shadow-md">
                <Plus size={16} />
                {t('Continue Setup', 'استمرار الإعداد')}
              </Link>
            }
          />
        )}

        {/* ═══ KPIs — كلها من /platform/overview ═══ */}
        {isLoading || !ov ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-3xl p-5 animate-pulse shadow-sm">
                <div className="flex items-center gap-3 mb-4"><div className="w-11 h-11 rounded-2xl bg-gray-100" /><div className="h-4 w-28 bg-gray-100 rounded" /></div>
                <div className="h-10 w-24 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            <StatCard
              icon={Building2}
              label={t('Active Gyms', 'الصالات النشطة')}
              value={`${ov.gyms.active} / ${ov.gyms.total}`}
              trend={`${ov.gyms.on_trial} ${t('trial', 'تجربة')} · +${ov.gyms.new_this_month} ${t('new', 'جديدة')} · ${ov.gyms.suspended} ${t('suspended', 'موقوفة')}`}
              trendPositive={ov.gyms.suspended === 0}
              accent="emerald"
            />
            <StatCard
              icon={Receipt}
              label={topMrr ? `MRR (${topMrr.currency})` : 'MRR'}
              value={topMrr ? fmtMoney(topMrr.mrr) : '0.00'}
              trend={otherMrr ? `${otherMrr} · ${ov.billing.active_contracts} ${t('contracts', 'عقد')}` : `${ov.billing.active_contracts} ${t('active contracts', 'عقد سارٍ')}`}
              trendPositive
              accent="violet"
            />
            <StatCard
              icon={CalendarClock}
              label={t('Renewals ≤ 7 days', 'تجديدات خلال 7 أيام')}
              value={ov.billing.renewals_due_7d}
              trend={`${ov.billing.live_items} ${t('live items', 'بند حي')} · ${ov.billing.active_contracts} ${t('contracts', 'عقد')}`}
              trendPositive={ov.billing.renewals_due_7d === 0}
              accent={ov.billing.renewals_due_7d > 0 ? 'amber' : 'emerald'}
            />
            <StatCard
              icon={AlertTriangle}
              label={t('Invoices due', 'فواتير مستحقة')}
              value={invoicesDue}
              trend={`${ov.billing.pending_invoices} ${t('pending', 'معلّقة')} · ${ov.billing.overdue_invoices} ${t('overdue', 'متأخرة')}`}
              trendPositive={ov.billing.overdue_invoices === 0}
              accent={ov.billing.overdue_invoices > 0 ? 'rose' : 'emerald'}
            />
            <StatCard
              icon={Headset}
              label={t('Open Tickets', 'تذاكر مفتوحة')}
              value={ov.operations.open_tickets}
              trend={`${ov.operations.non_active_gyms} ${t('non-active gyms', 'صالة غير نشطة')}`}
              trendPositive={ov.operations.open_tickets <= 5}
              accent={ov.operations.open_tickets > 5 ? 'amber' : 'emerald'}
            />
          </div>
        )}

        {/* ═══ مركز الإجراءات — كروت روابط لكل عملية حقيقية ═══ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {[
            { to: '/super-admin/tenants/new', icon: Plus, la: 'إضافة صالة', en: 'Add gym', hint: 'Provision + seed', tone: 'bg-emerald-500 text-white' },
            { to: '/super-admin/billing', icon: FileText, la: 'العقود والفواتير', en: 'Contracts', hint: 'Billing engine', tone: 'bg-white border border-gray-200 text-gray-700' },
            { to: '/super-admin/support', icon: Headset, la: 'الدعم', en: 'Support', hint: `${ov?.operations.open_tickets ?? 0} ${isRtl ? 'مفتوحة' : 'open'}`, tone: 'bg-white border border-gray-200 text-gray-700' },
            { to: '/super-admin/broadcast', icon: Megaphone, la: 'بث رسالة', en: 'Broadcast', hint: 'All tenants', tone: 'bg-white border border-gray-200 text-gray-700' },
            { to: '/super-admin/security', icon: ShieldCheck, la: 'الأمان', en: 'Security', hint: 'Sessions + admins', tone: 'bg-white border border-gray-200 text-gray-700' },
            { to: '/super-admin/monitor', icon: Activity, la: 'المراقبة', en: 'Monitor', hint: 'System health', tone: 'bg-white border border-gray-200 text-gray-700' },
          ].map((a) => (
            <Link key={a.to} to={a.to} className={`${a.tone} rounded-2xl p-4 flex flex-col gap-2 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all shadow-sm`}>
              <a.icon size={18} className={a.tone.includes('bg-emerald-500') ? 'text-white' : 'text-emerald-600'} />
              <span className="text-sm font-bold">{isRtl ? a.la : a.en}</span>
              <span className={`text-[11px] ${a.tone.includes('bg-emerald-500') ? 'text-emerald-100' : 'text-gray-400'}`} dir="ltr">{a.hint}</span>
            </Link>
          ))}
        </div>

        {/* ═══ تدفقات الأحداث الحية ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Panel
            title={t('Renewals — next 14 days', 'التجديدات — 14 يوم القادمة')}
            subtitle={t('From active platform contracts', 'من عقود المنصة السارية')}
            icon={RefreshCw}
            accent="violet"
          >
            {(ov?.feeds.renewals_next_14d.length ?? 0) === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 size={30} className="mx-auto mb-3 text-emerald-400" />
                <p className="text-sm text-gray-500">{t('No renewals due in 14 days', 'لا تجديدات خلال 14 يوم')}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {ov!.feeds.renewals_next_14d.map((r, i) => {
                  const overdue = r.renewal_date < todayIso();
                  return (
                    <button key={r.id} onClick={() => setDetailId(r.id)} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-gray-100 hover:border-violet-200 hover:bg-violet-50/40 transition-all text-start">
                      <div className="text-xs font-bold text-gray-500 w-20 shrink-0 text-center" dir="ltr">{formatDate(r.renewal_date)}</div>
                      <div className={`w-1.5 h-9 rounded-full shrink-0 ${RENEWAL_DOT[i % RENEWAL_DOT.length]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.gym_name}</p>
                        <p className="text-xs text-gray-400 truncate" dir="ltr">{r.subdomain}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${overdue ? 'bg-red-100 text-red-700' : 'bg-violet-100 text-violet-700'}`} dir="ltr">
                        {fmtMoney(r.price, r.currency)} · {cycleLabel(r.cycle, isRtl)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            title={t('Open tickets', 'التذاكر المفتوحة')}
            subtitle={t('Latest across all gyms', 'الأحدث في كل الصالات')}
            icon={Mail}
            accent="amber"
            actions={
              <Link to="/super-admin/support" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">{t('All →', 'الكل ←')}</Link>
            }
          >
            {(ov?.feeds.open_tickets_recent.length ?? 0) === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 size={30} className="mx-auto mb-3 text-emerald-400" />
                <p className="text-sm text-gray-500">{t('No open tickets', 'لا تذاكر مفتوحة')}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {ov!.feeds.open_tickets_recent.map((tk) => (
                  <div key={tk.id} className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{tk.subject}</p>
                      <p className="text-xs text-gray-400 truncate" dir="ltr">
                        {tk.ticket_number} · {tk.gym_name || 'platform'} · {formatDateTime(tk.created_at)}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${PRIORITY_CLASS[tk.priority] || 'bg-gray-100 text-gray-500'}`}>
                      {tk.priority}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title={t('System actions', 'تفاعلات النظام')}
            subtitle={t('Automatic enforcement events', 'أحداث التنفيذ التلقائي')}
            icon={Cpu}
            accent="emerald"
          >
            {(ov?.feeds.last_system_actions.length ?? 0) === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 size={30} className="mx-auto mb-3 text-emerald-400" />
                <p className="text-sm text-gray-500">{t('No automatic actions yet', 'لا إجراءات تلقائية بعد')}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {ov!.feeds.last_system_actions.map((a, i) => (
                  <div key={`${a.gym_id}-${i}`} className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100">
                    <Cpu size={16} className="text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{a.gym_name}</p>
                      <p className="text-xs text-gray-400 truncate">{a.action_description}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0" dir="ltr">{formatDateTime(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ═══ طابور التنفيذ + سجل التدقيق ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Panel
            title={t('Enforcement queue', 'طابور التنفيذ')}
            subtitle={t('Suspended, expired, or inactive tenants', 'صالات موقوفة أو منتهية أو غير نشطة')}
            icon={Ban}
            accent="rose"
          >
            {enforcement.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 size={30} className="mx-auto mb-3 text-emerald-400" />
                <p className="text-sm text-gray-500">{t('Every tenant is active and paid', 'كل الصالات نشطة ومسددّة')}</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto">
                {enforcement.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${g.is_active ? 'bg-amber-500' : 'bg-red-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{g.name}</p>
                      <p className="text-xs text-gray-400 truncate" dir="ltr">
                        {g.plan_name || '—'} · {g.expired && g.subscription_expires_at ? `${t('expired', 'منتهية')} ${formatDate(g.subscription_expires_at)}` : g.subscription_status} · {g.member_count} {t('members', 'عضو')}
                      </p>
                      {g.last_system_note && <p className="text-[11px] text-gray-400 truncate">{g.last_system_note}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {g.contract_id && (
                        <button onClick={() => setDetailId(g.contract_id!)} className="p-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600 transition-colors" title={t('Open contract', 'العقد')}>
                          <FileText size={14} />
                        </button>
                      )}
                      <Link to={`/super-admin/tenants/${g.id}`} className="p-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors inline-flex" title={t('Gym file', 'الملف')}>
                        <ExternalLink size={14} />
                      </Link>
                      <button
                        onClick={() => toggleMut.mutate({ id: g.id, is_active: !g.is_active })}
                        disabled={toggleMut.isPending}
                        className={`p-1.5 rounded-xl border transition-colors ${g.is_active ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
                        title={g.is_active ? t('Suspend', 'إيقاف') : t('Activate', 'تفعيل')}
                      >
                        {g.is_active ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title={t('Platform audit trail', 'سجل تدقيق المنصة')}
            subtitle={t('Real writes to contracts, billing, and gyms', 'التعديلات الفعلية على العقود والفواتير والصالات')}
            icon={ClipboardCheck}
            accent="sky"
            actions={
              <Link to="/super-admin/audit" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">{t('Full log →', 'السجل الكامل ←')}</Link>
            }
          >
            {audits.length === 0 ? (
              <div className="py-8 text-center">
                <ClipboardCheck size={30} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500">{t('No platform actions recorded yet', 'لا تحركات مسجلة بعد')}</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto">
                {audits.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${ACTION_BADGE_CLASS[a.action_type] || 'bg-gray-100 text-gray-600'}`} dir="ltr">
                      {a.action_type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate" dir="ltr">
                        <b>{a.actor_email || t('System', 'النظام')}</b>
                        <span className="text-gray-400"> — {a.table_name}</span>
                      </p>
                    </div>
                    <span className="text-[11px] text-gray-400 shrink-0" dir="ltr">{formatDateTime(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ═══ العقود (مصدر الحقيقة) ═══ */}
        <ContractsPanel isRtl={isRtl} t={t} />
      </div>

      {/* مودالات العقد المشتركة (من التجديدات وطابور التنفيذ) */}
      {detailId && (
        <ContractDetailModal
          contractId={detailId}
          isRtl={isRtl}
          t={t}
          onClose={() => setDetailId(null)}
          onEdit={(c) => { setDetailId(null); setEditingContract(c); setFormMode('edit'); }}
        />
      )}
      {formMode && (
        <ContractFormModal
          mode={formMode}
          contract={editingContract}
          gyms={gymsRes?.data ?? []}
          plans={plansRes?.data ?? []}
          isRtl={isRtl}
          t={t}
          onClose={() => setFormMode(null)}
        />
      )}
    </div>
  );
}
