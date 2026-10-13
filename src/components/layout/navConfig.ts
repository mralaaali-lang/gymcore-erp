import type { NavItem, UserRole } from '../../types';
import i18n from '../../i18n';
import type { NavBadges } from '../../services/api';

// §35أ — nav config extracted from AppLayout so TopNav can resolve the
// per-route page title from the same single source of truth (no drift).
//
// Gym-manager IA (owner's spec 2026-10-13, additive — nothing was dropped):
//   الرئيسية → الأعضاء → المالية (+ مبيعات kept) → التقارير → التشغيل (kept
//   whole) → الإعدادات. Items whose pages don't exist yet (البطولات، حضور
//   المدربين، البرايفت، الرسائل، شئون الموظفين، هوية النظام، تحديث قاعدة
//   البيانات) stay OUT of the sidebar until each gets a real migration +
//   endpoint + page — no placeholder links (zero-dead-buttons rule).

export const ROLE_BASE: Record<UserRole, string> = {
  'super-admin': '/super-admin',
  'gym-admin': '/admin',
  'trainer': '/trainer',
  'reception': '/reception',
  'player': '/player',
};

export function buildNavItems(base: string, role: UserRole, badges?: NavBadges): NavItem[] {
  if (role === 'super-admin') {
    // Information architecture (2026-10-11): 5 sections ordered by SaaS ops
    // workflow — competitor platform-console pattern (Stripe/Twilio style):
    // Home → Tenants & Revenue → Communication → System → Platform account.
    return [
      { label: i18n.t('nav.dashboard'), icon: 'dashboard', path: `${base}/dashboard`, roles: ['super-admin'], section: i18n.t('nav.sectionMain') },

      { label: i18n.t('nav.tenants'), icon: 'users', path: `${base}/tenants`, roles: ['super-admin'], section: i18n.t('nav.sectionTenants') },
      { label: i18n.t('nav.billing'), icon: 'finance', path: `${base}/billing`, roles: ['super-admin'], section: i18n.t('nav.sectionTenants') },
      { label: i18n.t('nav.reports'), icon: 'reports', path: `${base}/reports`, roles: ['super-admin'], section: i18n.t('nav.sectionTenants') },

      { label: i18n.t('nav.broadcast'), icon: 'messages', path: `${base}/broadcast`, roles: ['super-admin'], section: i18n.t('nav.sectionCommunication') },
      { label: i18n.t('nav.notifications'), icon: 'notifications', path: `${base}/notifications`, roles: ['super-admin'], section: i18n.t('nav.sectionCommunication') },
      { label: i18n.t('nav.sms'), icon: 'invoices', path: `${base}/sms`, roles: ['super-admin'], section: i18n.t('nav.sectionCommunication') },
      { label: i18n.t('nav.support'), icon: 'messages', path: `${base}/support`, roles: ['super-admin'], section: i18n.t('nav.sectionCommunication') },

      { label: i18n.t('nav.monitor'), icon: 'database', path: `${base}/monitor`, roles: ['super-admin'], section: i18n.t('nav.sectionSystem') },
      { label: i18n.t('nav.security'), icon: 'shield', path: `${base}/security`, roles: ['super-admin'], section: i18n.t('nav.sectionSystem') },
      { label: i18n.t('nav.audit'), icon: 'reports', path: `${base}/audit`, roles: ['super-admin'], section: i18n.t('nav.sectionSystem') },
      { label: i18n.t('nav.ota'), icon: 'database', path: `${base}/ota`, roles: ['super-admin'], section: i18n.t('nav.sectionSystem') },

      { label: i18n.t('nav.admins'), icon: 'shield', path: `${base}/admins`, roles: ['super-admin'], section: i18n.t('nav.sectionPlatform') },
      { label: i18n.t('nav.branding'), icon: 'branding', path: `${base}/branding`, roles: ['super-admin'], section: i18n.t('nav.sectionPlatform'), premium: true },
      { label: i18n.t('nav.developer'), icon: 'code', path: `${base}/developer`, roles: ['super-admin'], section: i18n.t('nav.sectionPlatform'), premium: true, badge: 'API' },
      { label: i18n.t('nav.settings'), icon: 'settings', path: `${base}/settings`, roles: ['super-admin'], section: i18n.t('nav.sectionPlatform') },
    ];
  }

  if (role === 'gym-admin') {
    return [
      { label: i18n.t('sidebar.dashboard'), icon: 'dashboard', path: `${base}/dashboard`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionHome') },
      // ── الأعضاء ──
      { label: i18n.t('sidebar.members'), icon: 'users', path: `${base}/members`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      { label: i18n.t('sidebar.subscriptions'), icon: 'subscriptions', path: `${base}/subscriptions`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      { label: i18n.t('sidebar.attendance'), icon: 'attendance', path: `${base}/attendance`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers'), badge: badges?.attendance },
      // الجدول stays — the owner's list didn't place it elsewhere and the
      // restructure is additive (no route loses its only sidebar entrance).
      { label: i18n.t('sidebar.schedule'), icon: 'schedule', path: `${base}/gym`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      // بوابة الأعضاء = the member-facing login (StaffMemberLoginPage also
      // signs members in) — a real page, not the manager-inaccessible /player.
      { label: i18n.t('sidebar.memberPortal'), icon: 'portal', path: '/team-login', roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      // ── المالية (مدفوعات·مصروفات·ديون·خزنة·شيتات + مبيعات kept per owner) ──
      { label: i18n.t('sidebar.payments'), icon: 'invoices', path: `${base}/billing`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance'), badge: badges?.payments },
      { label: i18n.t('sidebar.expenses'), icon: 'expenses', path: `${base}/expenses`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      { label: i18n.t('sidebar.debts'), icon: 'debts', path: `${base}/billing?tab=Debts`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      { label: i18n.t('sidebar.cashbox'), icon: 'cashbox', path: `${base}/cashbox`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      { label: i18n.t('sidebar.shiftSheets'), icon: 'statements', path: `${base}/cashbox/shifts`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      { label: i18n.t('sidebar.sales'), icon: 'sales', path: `${base}/sales`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      // ── التقارير ──
      { label: i18n.t('sidebar.reports'), icon: 'reports', path: `${base}/reports`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionReports') },
      { label: i18n.t('sidebar.staffSales'), icon: 'sales', path: `${base}/sales?tab=Report`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionReports') },
      // التنبيهات = the real ending-soon view (subscriptions prefiltered via
      // ?status=ending_soon, same link the dashboard action card uses).
      { label: i18n.t('sidebar.alerts'), icon: 'alerts', path: `${base}/subscriptions?status=ending_soon`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionReports'), badge: badges?.alerts },
      { label: i18n.t('sidebar.announcements'), icon: 'announcements', path: `${base}/marketing?tab=Announcements`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionReports') },
      // ── التشغيل (kept whole per owner) ──
      { label: i18n.t('sidebar.store'), icon: 'products', path: `${base}/products`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps') },
      { label: i18n.t('sidebar.marketing'), icon: 'marketing', path: `${base}/marketing`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps') },
      { label: i18n.t('sidebar.crm'), icon: 'crm', path: `${base}/crm`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps') },
      // §34ح — growth page joined the sidebar after the members-page tab
      // strip (its only former entrance) was replaced by stat cards.
      { label: i18n.t('sidebar.growth'), icon: 'analytics', path: `${base}/analytics`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps') },
      { label: i18n.t('sidebar.website'), icon: 'website', path: `${base}/website`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps'), premium: true },
      // ── الإعدادات (الباقات·المدربون·المستخدمون·الإعدادات) ──
      { label: i18n.t('sidebar.plans'), icon: 'package', path: `${base}/plans`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionSettings') },
      // المدربون = the real coach-filtered staff view inside the Team hub.
      { label: i18n.t('sidebar.coaches'), icon: 'coaches', path: `${base}/users?tab=staff&role=coach`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionSettings') },
      { label: i18n.t('sidebar.users'), icon: 'team', path: `${base}/users`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionSettings') },
      { label: i18n.t('sidebar.settings'), icon: 'settings', path: `${base}/settings`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionSettings') },
    ];
  }

  if (role === 'trainer') {
    // Coach workspace IA: home → clients → training programs → settings.
    // No ai-coach entry: /trainer/ai-coach was a placeholder alias of the
    // manager analytics page, not coach content.
    return [
      { label: i18n.t('nav.dashboard'), icon: 'dashboard', path: `${base}/dashboard`, roles: ['trainer'], section: i18n.t('nav.sectionMain') },
      { label: i18n.t('nav.clients'), icon: 'users', path: `${base}/clients`, roles: ['trainer'], section: i18n.t('nav.sectionMembers') },
      { label: i18n.t('nav.attendance'), icon: 'attendance', path: `${base}/attendance`, roles: ['trainer'], section: i18n.t('nav.sectionMembers') },
      { label: i18n.t('nav.training'), icon: 'package', path: `${base}/training`, roles: ['trainer'], section: i18n.t('nav.sectionTraining') },
      { label: i18n.t('nav.sessions'), icon: 'shifts', path: `${base}/training/sessions`, roles: ['trainer'], section: i18n.t('nav.sectionTraining') },
      { label: i18n.t('nav.pt'), icon: 'coach', path: `${base}/training/pt`, roles: ['trainer'], section: i18n.t('nav.sectionTraining') },
      { label: i18n.t('nav.clientProgress'), icon: 'reports', path: `${base}/training/clients`, roles: ['trainer'], section: i18n.t('nav.sectionTraining') },
      { label: i18n.t('nav.trainerApp'), icon: 'leaderboard', path: `${base}/training/mobile`, roles: ['trainer'], section: i18n.t('nav.sectionTraining') },
      { label: i18n.t('nav.settings'), icon: 'settings', path: `${base}/settings`, roles: ['trainer'], section: i18n.t('nav.sectionSettings') },
    ];
  }

  if (role === 'reception') {
    // Front-desk IA: home → members & attendance → store → settings.
    // No duplicate check-in entry: /reception/checkin rendered the same
    // AttendanceRecords page as /reception/attendance (now a redirect).
    // No shifts entry: staff shifts live in the manager-only Team hub;
    // /reception/shifts now redirects to the reception dashboard — a real
    // my-shifts page for staff is a later milestone.
    return [
      { label: i18n.t('nav.dashboard'), icon: 'dashboard', path: `${base}/dashboard`, roles: ['reception'], section: i18n.t('nav.sectionMain') },
      { label: i18n.t('nav.members'), icon: 'users', path: `${base}/members`, roles: ['reception'], section: i18n.t('nav.sectionMembers') },
      { label: i18n.t('nav.attendance'), icon: 'attendance', path: `${base}/attendance`, roles: ['reception'], section: i18n.t('nav.sectionMembers'), badge: badges?.attendance },
      { label: i18n.t('nav.products'), icon: 'products', path: `${base}/products`, roles: ['reception'], section: i18n.t('nav.sectionSales') },
      { label: i18n.t('nav.settings'), icon: 'settings', path: `${base}/settings`, roles: ['reception'], section: i18n.t('nav.sectionSettings') },
    ];
  }

  // Player portal IA: my home → my profile → my progress.
  // pass/loyalty/tips rendered the same mock page as the dashboard (redirects now).
  return [
    { label: i18n.t('nav.dashboard'), icon: 'dashboard', path: `${base}/dashboard`, roles: ['player'], section: i18n.t('nav.sectionMain') },
    { label: i18n.t('nav.profile'), icon: 'account', path: `${base}/profile`, roles: ['player'], section: i18n.t('nav.sectionMain') },
    { label: i18n.t('nav.myProgress'), icon: 'reports', path: `${base}/progress`, roles: ['player'], section: i18n.t('nav.sectionMain') },
  ];
}

/**
 * §35أ — resolve the current page's display title from the same nav config:
 * longest nav path that prefixes the pathname wins (query ignored), so
 * /admin/members/:id still titles as «أعضاء». Unknown paths → null.
 */
export function resolvePageTitle(items: NavItem[], pathname: string): { label: string; section?: string } | null {
  let best: NavItem | null = null;
  for (const item of items) {
    const path = item.path.split('?')[0];
    if (path === '/team-login') continue; // external-ish portal link, never a title source
    if (pathname === path || pathname.startsWith(path + '/')) {
      if (!best || path.length > best.path.split('?')[0].length) best = item;
    }
  }
  return best ? { label: best.label, section: best.section } : null;
}
