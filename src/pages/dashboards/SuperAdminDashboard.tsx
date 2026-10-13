import { useState, useMemo, useCallback, Fragment } from 'react';
import { formatDate, formatDateTime } from '../../utils/date';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  listPlatformGyms,
  setPlatformGymActive,
  updateGymSubscription,
  getOnboardingProgress,
  getSystemStatus,
  listTickets,
  getOverduePayments,
  type PlatformGym,
} from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Search,
  Crown,
  Star,
  Rocket,
  Clock,
  Ban,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CalendarDays,
  Plus,
  Megaphone,
  Receipt,
  Headset,
  Activity,
  HeartPulse,
} from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import { StatCard, Panel, Banner } from '../../components/dashboard';

const EVENT_DOT_COLORS = ['bg-emerald-500', 'bg-cyan-500', 'bg-violet-500', 'bg-amber-500', 'bg-sky-500', 'bg-rose-500'];

// ── Helpers ──

function fmtTime(iso: string, _lang?: string): string {
  try {
    return formatDateTime(iso);
  } catch { return iso; }
}

function fmtEGP(n: number): string {
  return `${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

// Gym subscription lifecycle relative to the 14-day grace policy (auto-suspend after grace).
const GRACE_DAYS = 14;

type AttentionKind = 'expired' | 'suspended' | 'expiring' | 'overdue';
interface AttentionItem {
  key: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  href: string;
}

const KIND_STYLE: Record<AttentionKind, { dot: string; badge: string; le: string; la: string }> = {
  expired:   { dot: 'bg-red-500',   badge: 'bg-red-100 text-red-700',   le: 'Expired',   la: 'منتهي' },
  overdue:   { dot: 'bg-red-500',   badge: 'bg-red-100 text-red-700',   le: 'Overdue',   la: 'متأخر سداد' },
  suspended: { dot: 'bg-gray-400',  badge: 'bg-gray-100 text-gray-600', le: 'Suspended', la: 'موقوفة' },
  expiring:  { dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700', le: 'Expiring', la: 'قريب الانتهاء' },
};

// ── Main Dashboard — platform (SaaS) operations only.
// Gym business metrics (member activity, gym revenue) belong to the gym-manager dashboard. ──

export default function SuperAdminDashboard() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';
  const t = useCallback((en: string, ar: string) => (isRtl ? ar : en), [isRtl]);

  // ── Data (all real platform endpoints) ──

  const { data: gymsRes, isLoading, isError } = useApiQuery(['platform', 'gyms'], listPlatformGyms, { staleTime: 30_000 });
  const { data: systemRes } = useApiQuery(['platform', 'system', 'status'], getSystemStatus, { staleTime: 60_000 });
  const { data: ticketsRes } = useApiQuery(['platform', 'tickets'], () => listTickets({ limit: 100 }), { staleTime: 60_000 });
  const { data: overdueRes } = useApiQuery(['platform', 'overdue'], () => getOverduePayments(60), { staleTime: 60_000 });

  const gyms: PlatformGym[] = gymsRes?.data ?? [];
  const tickets = ticketsRes?.data ?? [];
  const overdueInvoices = overdueRes?.data?.invoices ?? [];

  // ── Tenant status breakdown ──
  const now = Date.now();
  const activeGyms = gyms.filter((g) => g.is_active).length;
  const suspendedGyms = gyms.filter((g) => !g.is_active).length;

  const daysLeftOf = (g: PlatformGym): number | null => {
    if (!g.subscription_expires_at) return null;
    return Math.ceil((new Date(g.subscription_expires_at).getTime() - now) / 86400000);
  };

  const expiredGyms = useMemo(() => gyms.filter((g) => g.is_active && (daysLeftOf(g) ?? Infinity) < 0), [gyms]);
  const expiringGyms = useMemo(
    () => gyms
      .filter((g) => {
        const d = daysLeftOf(g);
        return g.is_active && d !== null && d >= 0 && d <= GRACE_DAYS;
      })
      .sort((a, b) => (daysLeftOf(a) ?? 0) - (daysLeftOf(b) ?? 0)),
    [gyms],
  );

  const openTickets = tickets.filter((tk) => tk.status === 'open');
  const inProgressTickets = tickets.filter((tk) => tk.status === 'in_progress');

  const apiMetric = systemRes?.data?.metrics?.find((m) => m.icon === 'speed');
  const dbPool = systemRes?.data?.database?.pool_total ?? 0;
  const dbPoolActive = systemRes?.data?.database?.pool_active ?? 0;
  const failedLogins = systemRes?.data?.database?.failed_logins_24h ?? 0;
  const serverUptime = systemRes?.data?.server?.uptime;

  // ── Needs-attention list (expired → overdue → suspended → expiring) ──
  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    for (const g of expiredGyms) {
      const d = daysLeftOf(g) ?? 0;
      items.push({
        key: `expired-${g.id}`,
        kind: 'expired',
        title: g.name,
        detail: t(`Subscription expired ${Math.abs(d)} days ago — inside grace window`, `انتهى الاشتراك منذ ${Math.abs(d)} يوم — داخل مهلة السماح`),
        href: `/super-admin/tenants/${g.id}`,
      });
    }
    for (const inv of overdueInvoices.slice(0, 6)) {
      items.push({
        key: `overdue-${inv.invoice_number ?? inv.gym_name}-${inv.days_overdue}`,
        kind: 'overdue',
        title: inv.gym_name,
        detail: t(`Invoice ${inv.invoice_number} — ${fmtEGP(inv.amount)} overdue ${inv.days_overdue} days`, `فاتورة ${inv.invoice_number} — ${fmtEGP(inv.amount)} متأخرة ${inv.days_overdue} يوم`),
        href: '/super-admin/billing',
      });
    }
    for (const g of gyms.filter((x) => !x.is_active)) {
      items.push({
        key: `suspended-${g.id}`,
        kind: 'suspended',
        title: g.name,
        detail: t('Suspended — staff login blocked until payment', 'موقوفة — دخول الموظفين مقفول لحد السداد'),
        href: `/super-admin/tenants/${g.id}`,
      });
    }
    for (const g of expiringGyms) {
      const d = daysLeftOf(g) ?? 0;
      items.push({
        key: `expiring-${g.id}`,
        kind: 'expiring',
        title: g.name,
        detail: t(`${d} days until renewal (grace ${GRACE_DAYS} days)`, `${d} يوم لحد التجديد (مهلة السماح ${GRACE_DAYS} يوم)`),
        href: `/super-admin/tenants/${g.id}`,
      });
    }
    return items.slice(0, 9);
  }, [expiredGyms, overdueInvoices, gyms, expiringGyms, t]);

  // ── Renewal calendar ──
  const allUpcoming = useMemo(() => {
    return gyms
      .filter((g) => g.subscription_expires_at && new Date(g.subscription_expires_at).getTime() >= now - 86400000)
      .map((g) => ({ ...g, daysLeft: daysLeftOf(g) ?? 0 }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [gyms]);

  const [monthOffset, setMonthOffset] = useState(0);
  const viewedDate = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + monthOffset, 1);
  }, [monthOffset]);
  const calYear = viewedDate.getFullYear();
  const calMonth = viewedDate.getMonth();
  const monthLabel = formatDate(viewedDate);
  const expiringDays = useMemo(() => {
    const set = new Set<number>();
    for (const g of allUpcoming) {
      if (!g.subscription_expires_at) continue;
      const d = new Date(g.subscription_expires_at);
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) set.add(d.getDate());
    }
    return set;
  }, [allUpcoming, calYear, calMonth]);
  const today = new Date();
  const isViewingCurrentMonth = calYear === today.getFullYear() && calMonth === today.getMonth();
  const calFirstDay = new Date(calYear, calMonth, 1).getDay();
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells: (number | null)[] = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < (calFirstDay === 0 ? 6 : calFirstDay - 1); i++) cells.push(null);
    for (let d = 1; d <= calDaysInMonth; d++) cells.push(d);
    return cells;
  }, [calFirstDay, calDaysInMonth]);

  // ── State ──

  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState('all');

  // ── Mutations ──

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => setPlatformGymActive(id, is_active),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['platform', 'gyms'] }); showToast(t('Gym status updated', 'تم تحديث حالة الصالة'), 'success'); },
    onError: () => showToast(t('Failed to update gym', 'فشل تحديث حالة الصالة'), 'error'),
  });

  const subMut = useMutation({
    mutationFn: ({ id, plan_tier }: { id: string; plan_tier: string }) => updateGymSubscription(id, { plan_tier }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['platform', 'gyms'] }); showToast(t('Plan updated', 'تم تحديث الباقة'), 'success'); },
    onError: () => showToast(t('Failed to update plan', 'فشل تحديث الباقة'), 'error'),
  });

  // ── Filters ──

  const filteredGyms = useMemo(() => {
    let r = [...gyms];
    if (searchTerm) { const q = searchTerm.toLowerCase(); r = r.filter((g) => g.name.toLowerCase().includes(q) || g.subdomain.toLowerCase().includes(q)); }
    if (planFilter !== 'all') r = r.filter((g) => g.plan_tier === planFilter);
    return r;
  }, [gyms, searchTerm, planFilter]);

  // Plan labels use the platform billing vocabulary (billing_plans table).
  const planBadge = (tier: string) => {
    const map: Record<string, { cls: string; icon: any; la: string; le: string }> = {
      basic: { cls: 'text-sky-600 border-sky-200 bg-sky-50', icon: Rocket, le: 'Starter', la: 'الانطلاق' },
      premium: { cls: 'text-emerald-600 border-emerald-200 bg-emerald-50', icon: Star, le: 'Professional', la: 'الاحترافية' },
      enterprise: { cls: 'text-purple-600 border-purple-200 bg-purple-50', icon: Crown, le: 'Enterprise', la: 'الشركات' },
    };
    const p = map[tier] || map.basic;
    const Icon = p.icon;
    return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold ${p.cls}`}><Icon size={12} />{isRtl ? p.la : p.le}</span>;
  };

  const handleUpgrade = (id: string, curr: string) => { const tiers = ['basic', 'premium', 'enterprise']; const idx = tiers.indexOf(curr); if (idx < 2) subMut.mutate({ id, plan_tier: tiers[idx + 1] }); };
  const handleDowngrade = (id: string, curr: string) => { const tiers = ['basic', 'premium', 'enterprise']; const idx = tiers.indexOf(curr); if (idx > 0) subMut.mutate({ id, plan_tier: tiers[idx - 1] }); };

  // ── Onboarding Check ──

  const { data: onboardingData } = useQuery({
    queryKey: ['onboarding-progress'],
    queryFn: getOnboardingProgress,
    retry: false,
    staleTime: 60000,
  });
  const onboardingIncomplete = onboardingData?.data && !onboardingData.data.onboarding_complete;

  return (
    <div className="bg-gray-50 min-h-screen -m-6 p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t('Platform Operations', 'مركز إدارة المنصة')}
        subtitle={t('SaaS control center — tenants, subscriptions, platform health', 'مركز إدارة الـ SaaS — الصالات والاشتراكات وصحة المنصة')}
        icon="hub"
      />

      <div className="space-y-6">
      {/* ═══ ONBOARDING BANNER ═══ */}
      {onboardingIncomplete && (
        <Banner
          tone="emerald"
          title={t('Complete Platform Setup', 'إعداد المنصة')}
          description={t('Finish the onboarding wizard to configure your platform settings', 'أكمل معيار الإعداد لتخصيص إعدادات المنصة')}
          actions={
            <Link
              to="/super-admin/onboarding"
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-900 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-colors shadow-md"
            >
              <Rocket size={16} />
              {t('Continue Setup', 'استمرار الإعداد')}
            </Link>
          }
        />
      )}

      {/* ═══ QUICK ACTIONS ═══ */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/super-admin/tenants/new" className="inline-flex items-center gap-1.5 bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-emerald-600 active:scale-[0.98] transition-all shadow-sm shadow-emerald-500/20">
            <Plus size={15} />{t('Add gym', 'إضافة صالة')}
          </Link>
          <Link to="/super-admin/broadcast" className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:border-emerald-300 hover:text-emerald-600 transition-all">
            <Megaphone size={15} />{t('Broadcast', 'بث رسالة')}
          </Link>
          <Link to="/super-admin/billing" className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:border-emerald-300 hover:text-emerald-600 transition-all">
            <Receipt size={15} />{t('Create invoice', 'إنشاء فاتورة')}
          </Link>
        </div>
      </div>

      {/* ═══ KPI METRICS (SaaS operations) ═══ */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-3xl p-5 animate-pulse shadow-sm">
              <div className="flex items-center gap-3 mb-4"><div className="w-11 h-11 rounded-2xl bg-gray-100" /><div className="h-4 w-28 bg-gray-100 rounded" /></div>
              <div className="h-10 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={Building2} label={t('Active Gyms', 'الصالات النشطة')} value={`${activeGyms} / ${gyms.length}`} trend={suspendedGyms > 0 ? `${suspendedGyms} ${t('suspended', 'موقوفة')}` : t('All operational', 'كلها شغالة')} trendPositive={suspendedGyms === 0} accent="emerald" />
          <StatCard icon={CalendarDays} label={t(`Renewals ≤ ${GRACE_DAYS} days`, `تجديدات خلال ${GRACE_DAYS} يوم`)} value={expiringGyms.length} trend={expiredGyms.length > 0 ? `${expiredGyms.length} ${t('expired in grace', 'منتهية داخل المهلة')}` : t('No expired', 'لا منتهية')} trendPositive={expiredGyms.length === 0} accent={expiredGyms.length > 0 ? 'amber' : 'emerald'} />
          <StatCard icon={Headset} label={t('Open Tickets', 'تذاكر مفتوحة')} value={openTickets.length} trend={inProgressTickets.length > 0 ? `${inProgressTickets.length} ${t('in progress', 'قيد المعالجة')}` : t('Nothing in progress', 'لا يوجد قيد المعالجة')} trendPositive accent={openTickets.length > 5 ? 'amber' : 'emerald'} />
          <StatCard icon={Activity} label={t('API Response', 'استجابة API')} value={apiMetric?.value ?? '—'} trend={serverUptime ? `${t('Uptime', 'التشغيل')}: ${serverUptime}` : undefined} trendPositive accent="amber" />
        </div>
      )}

      {/* ═══ NEEDS ATTENTION + PLATFORM HEALTH ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel
          title={t('Gyms Needing Attention', 'صالات محتاجة انتباه')}
          subtitle={t('Expired, overdue, suspended, or near renewal', 'منتهية أو متأخرة سداد أو موقوفة أو قريبة التجديد')}
          icon={AlertTriangle}
          accent="amber"
          className="lg:col-span-2"
        >
          {attentionItems.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-400" />
              <p className="text-sm text-gray-500">{t('All tenants are healthy', 'كل الصالات سليمة')}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {attentionItems.map((item) => {
                const st = KIND_STYLE[item.kind];
                return (
                  <Link key={item.key} to={item.href} className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/40 transition-all">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
                      <p className="text-xs text-gray-400 truncate">{item.detail}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${st.badge}`}>
                      {isRtl ? st.la : st.le}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title={t('Platform Health', 'صحة المنصة')}
          subtitle={t('Live system indicators', 'مؤشرات النظام الحية')}
          icon={HeartPulse}
          accent="emerald"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50">
              <span className="text-sm text-gray-600">{t('API Response', 'استجابة API')}</span>
              <span className={`text-sm font-bold ${apiMetric && apiMetric.value && parseFloat(apiMetric.value) > 200 ? 'text-amber-600' : 'text-emerald-600'}`} dir="ltr">
                {apiMetric?.value ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50">
              <span className="text-sm text-gray-600">{t('DB Connection Pool', 'اتصالات قاعدة البيانات')}</span>
              <span className="text-sm font-bold text-gray-900" dir="ltr">{dbPoolActive}/{dbPool}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50">
              <span className="text-sm text-gray-600">{t('Failed logins (24h)', 'دخول فاشل (24 ساعة)')}</span>
              <span className={`text-sm font-bold ${failedLogins > 0 ? 'text-amber-600' : 'text-emerald-600'}`} dir="ltr">{failedLogins}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50">
              <span className="text-sm text-gray-600">{t('Server Uptime', 'وقت تشغيل الخادم')}</span>
              <span className="text-sm font-bold text-gray-900" dir="ltr">{serverUptime ?? '—'}</span>
            </div>
            <Link to="/super-admin/monitor" className="block text-center text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors pt-1">
              {t('Open System Monitor →', 'فتح مراقبة النظام ←')}
            </Link>
          </div>
        </Panel>
      </div>

      {/* ═══ TENANT TABLE ═══ */}
      <section className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-5 md:p-6 border-b border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50">
                <Building2 size={20} strokeWidth={1.75} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t('Tenants & Subscriptions', 'الصالات والاشتراكات')}</h2>
                <p className="text-sm text-gray-500">{t('Suspend, activate, and manage plans', 'إيقاف وتفعيل وإدارة الباقات')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('Search gyms...', 'بحث في الصالات...')} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2 pr-9 w-48 focus:ring-2 focus:ring-emerald-500/30 outline-none placeholder-gray-400" />
              </div>
              <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500/30 outline-none">
                <option value="all">{t('All Plans', 'جميع الباقات')}</option>
                <option value="basic">{t('Starter', 'الانطلاق')}</option>
                <option value="premium">{t('Professional', 'الاحترافية')}</option>
                <option value="enterprise">{t('Enterprise', 'الشركات')}</option>
              </select>
            </div>
          </div>
        </div>

        {isError ? (
          <div className="p-8 text-center"><AlertTriangle size={32} className="mx-auto mb-3 text-red-400" /><p className="text-gray-700 font-medium">{t('Failed to load gym data', 'فشل تحميل بيانات الصالات')}</p><p className="text-sm text-gray-400 mt-1">{t('Check server connection', 'تحقق من الاتصال بالخادم')}</p></div>
        ) : filteredGyms.length === 0 ? (
          <div className="p-8 text-center"><Building2 size={32} className="mx-auto mb-3 text-gray-300" /><p className="text-gray-700 font-medium">{searchTerm ? t('No gyms match your search', 'لا توجد صالات تطابق البحث') : t('No gyms registered yet', 'لا توجد صالات مسجلة بعد')}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600">{t('Gym', 'الصالة')}</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600">{t('Plan', 'الباقة')}</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600">{t('Status', 'الحالة')}</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600">{t('Renewal', 'التجديد')}</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600">{t('Actions', 'الإجراءات')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredGyms.map((gym) => {
                  const dLeft = daysLeftOf(gym);
                  return (
                    <Fragment key={gym.id}>
                      <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white font-bold text-sm">{gym.name.charAt(0)}</div>
                            <div><p className="font-semibold text-gray-900">{gym.name}</p><p className="text-xs text-gray-400" dir="ltr">{gym.subdomain}</p></div>
                          </div>
                        </td>
                        <td className="px-5 py-4">{planBadge(gym.plan_tier)}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${gym.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${gym.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            {gym.is_active ? t('Active', 'نشط') : t('Suspended', 'موقوف')}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {gym.subscription_expires_at ? (
                            <div className="flex flex-col">
                              <span className="text-gray-600">{fmtTime(gym.subscription_expires_at, language)}</span>
                              {dLeft !== null && (
                                <span className={`text-[10px] font-semibold ${dLeft < 0 ? 'text-red-500' : dLeft <= GRACE_DAYS ? 'text-amber-600' : 'text-gray-400'}`}>
                                  {dLeft < 0
                                    ? t(`expired ${Math.abs(dLeft)}d ago`, `منتهي منذ ${Math.abs(dLeft)} يوم`)
                                    : t(`${dLeft}d left`, `${dLeft} يوم متبقي`)}
                                </span>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => toggleMut.mutate({ id: gym.id, is_active: !gym.is_active })} className={`p-1.5 rounded-xl border transition-colors ${gym.is_active ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`} title={gym.is_active ? t('Suspend', 'إيقاف') : t('Activate', 'تفعيل')}>
                              {gym.is_active ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                            </button>
                            <button onClick={() => handleUpgrade(gym.id, gym.plan_tier)} disabled={gym.plan_tier === 'enterprise'} className="p-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={t('Upgrade Plan', 'ترقية الباقة')}>
                              <ChevronUp size={14} />
                            </button>
                            <button onClick={() => handleDowngrade(gym.id, gym.plan_tier)} disabled={gym.plan_tier === 'basic'} className="p-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={t('Downgrade Plan', 'خفض الباقة')}>
                              <ChevronDown size={14} />
                            </button>
                            <Link to={`/super-admin/tenants/${gym.id}`} className="p-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors inline-flex" title={t('View Details', 'عرض التفاصيل')}>
                              <ExternalLink size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>{filteredGyms.length} / {gyms.length} {t('gyms', 'صالة')}</span>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['platform', 'gyms'] })} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors">
            <RefreshCw size={12} />{t('Refresh', 'تحديث')}
          </button>
        </div>
      </section>

      {/* ═══ CALENDAR & RENEWAL EVENTS ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel
          title={monthLabel}
          icon={CalendarDays}
          accent="emerald"
          className="lg:col-span-1"
          actions={
            <div className="flex items-center gap-1 text-gray-400">
              <button onClick={() => setMonthOffset((o) => o - 1)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors"><ChevronUp size={14} className="rotate-90" /></button>
              <button onClick={() => setMonthOffset((o) => o + 1)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors"><ChevronDown size={14} className="rotate-90" /></button>
            </div>
          }
        >
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400 mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="font-semibold">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {calCells.map((day, i) => {
              if (day === null) return <div key={`x-${i}`} />;
              const isToday = isViewingCurrentMonth && day === today.getDate();
              const hasExpiry = expiringDays.has(day);
              return (
                <div key={day} className={`aspect-square flex flex-col items-center justify-center rounded-full font-medium transition-colors ${isToday ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30' : 'text-gray-600 hover:bg-gray-100 cursor-pointer'}`}>
                  {day}
                  {hasExpiry && !isToday && <span className="w-1 h-1 rounded-full bg-amber-500 mt-0.5" />}
                  {hasExpiry && isToday && <span className="w-1 h-1 rounded-full bg-white mt-0.5" />}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{t('Today', 'اليوم')}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />{t('Renewals', 'التجديدات')}</span>
          </div>
        </Panel>

        <Panel title={t('Upcoming Renewals', 'التجديدات القادمة')} subtitle={t('Subscription renewal schedule', 'جدول تجديدات اشتراكات الصالات')} icon={Clock} accent="emerald" className="lg:col-span-2">
          <div className="space-y-3">
            {allUpcoming.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-400" />
                <p className="text-sm text-gray-500">{t('No upcoming renewals', 'لا توجد تجديدات قادمة')}</p>
              </div>
            ) : allUpcoming.slice(0, 6).map((g, i) => (
              <div key={g.id} className="flex items-center gap-4 p-3 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/40 transition-all">
                <div className="text-xs font-bold text-gray-500 w-12 text-center" dir="ltr">
                  {g.subscription_expires_at ? formatDate(g.subscription_expires_at) : '—'}
                </div>
                <div className={`w-1.5 h-10 rounded-full ${EVENT_DOT_COLORS[i % EVENT_DOT_COLORS.length]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{g.name} — {t('Subscription Renewal', 'تجديد الاشتراك')}</p>
                  <p className="text-xs text-gray-400" dir="ltr">{g.subdomain}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${g.daysLeft <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                  {g.daysLeft} {t('days left', 'أيام متبقية')}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ═══ SUPPORT SUMMARY ═══ */}
      <Panel
        title={t('Support Summary', 'ملخص الدعم')}
        subtitle={t('Open and in-progress tickets across all gyms', 'التذاكر المفتوحة وقيد المعالجة في كل الصالات')}
        icon={Headset}
        accent="emerald"
        actions={
          <Link to="/super-admin/support" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
            {t('View all tickets →', 'عرض كل التذاكر ←')}
          </Link>
        }
      >
        {openTickets.length === 0 && inProgressTickets.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-400" />
            <p className="text-sm text-gray-500">{t('No open tickets', 'لا توجد تذاكر مفتوحة')}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {[...openTickets, ...inProgressTickets].slice(0, 5).map((tk) => (
              <div key={tk.id} className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/40 transition-all">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{tk.subject}</p>
                  <p className="text-xs text-gray-400 truncate">{tk.gym_name} · {fmtTime(tk.created_at, language)}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  tk.priority === 'high' ? 'bg-red-100 text-red-700' : tk.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {tk.priority === 'high' ? t('High', 'عالية') : tk.priority === 'medium' ? t('Medium', 'متوسطة') : t('Low', 'منخفضة')}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${tk.status === 'open' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                  {tk.status === 'open' ? t('Open', 'مفتوحة') : t('In Progress', 'قيد المعالجة')}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      </div>
    </div>
  );
}
