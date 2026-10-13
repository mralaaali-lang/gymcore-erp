import { useMemo } from 'react';
import { useApp } from '../../context/GymBrandContext';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import TrialBanner from './TrialBanner';
import type { NavItem, UserRole } from '../../types';
import i18n from '../../i18n';

const ROLE_BASE: Record<UserRole, string> = {
  'super-admin': '/super-admin',
  'gym-admin': '/admin',
  'trainer': '/trainer',
  'reception': '/reception',
  'player': '/player',
};

function buildNavItems(base: string, role: UserRole): NavItem[] {
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
    // Gym workspace IA — mirrors the product tree one-to-one:
    // members lifecycle → money → operations → growth → team & settings.
    // Every path must be a real route (no dead links); trainers/shifts/hr
    // were merged into the TeamPage tabs (§22). Remaining secondary pages
    // (purchases, suppliers, debts, announcements, analytics, backup,
    // migration) stay routed and get merged into these pages later.
    return [
      { label: i18n.t('sidebar.dashboard'), icon: 'dashboard', path: `${base}/dashboard`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionHome') },
      // ── الأعضاء ──
      { label: i18n.t('sidebar.members'), icon: 'users', path: `${base}/members`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      { label: i18n.t('sidebar.subscriptions'), icon: 'subscriptions', path: `${base}/subscriptions`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      { label: i18n.t('sidebar.plans'), icon: 'package', path: `${base}/plans`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      { label: i18n.t('sidebar.attendance'), icon: 'attendance', path: `${base}/attendance`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      { label: i18n.t('sidebar.schedule'), icon: 'schedule', path: `${base}/gym`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      // ── المالية ──
      { label: i18n.t('sidebar.invoices'), icon: 'invoices', path: `${base}/billing`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      { label: i18n.t('sidebar.sales'), icon: 'sales', path: `${base}/sales`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      { label: i18n.t('sidebar.expenses'), icon: 'expenses', path: `${base}/expenses`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      { label: i18n.t('sidebar.cashbox'), icon: 'cashbox', path: `${base}/cashbox`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      { label: i18n.t('sidebar.reports'), icon: 'reports', path: `${base}/reports`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      // ── التشغيل ──
      { label: i18n.t('sidebar.store'), icon: 'products', path: `${base}/products`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps') },
      { label: i18n.t('sidebar.marketing'), icon: 'marketing', path: `${base}/marketing`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps') },
      { label: i18n.t('sidebar.crm'), icon: 'crm', path: `${base}/crm`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps') },
      // §34ح — growth page joined the sidebar after the members-page tab
      // strip (its only former entrance) was replaced by stat cards.
      { label: i18n.t('sidebar.growth'), icon: 'analytics', path: `${base}/analytics`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps') },
      { label: i18n.t('sidebar.website'), icon: 'website', path: `${base}/website`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps'), premium: true },
      // ── الفريق والإعدادات ──
      { label: i18n.t('sidebar.team'), icon: 'team', path: `${base}/users`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionTeam') },
      { label: i18n.t('sidebar.settings'), icon: 'settings', path: `${base}/settings`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionTeam') },
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
      { label: i18n.t('nav.attendance'), icon: 'attendance', path: `${base}/attendance`, roles: ['reception'], section: i18n.t('nav.sectionMembers') },
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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, language } = useApp();
  const navItems = useMemo(() => buildNavItems(ROLE_BASE[role], role), [role, language]);

  return (
    // dir changes based on language:
    // - Arabic (RTL) → sidebar appears on the RIGHT side
    // - English (LTR) → sidebar appears on the LEFT side
    <div className="flex min-h-screen bg-background text-on-background font-body-md antialiased" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <Sidebar items={navItems} />
      <div className="flex-1 flex flex-col min-h-screen relative w-full overflow-x-hidden" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        {/* Trial/upgrade banner is a gym-level concept — never on platform ops screens */}
        {role !== 'super-admin' && <TrialBanner />}
        <TopNav />
        <main className="flex-1 p-margin-mobile md:p-margin-desktop bg-surface-container-low pb-24 md:pb-margin-desktop">
          <div className="max-w-container-max mx-auto space-y-stack-lg">
            {children}
          </div>
        </main>
        <BottomNav items={navItems.filter((i) => !i.premium).slice(0, 4)} />
      </div>
    </div>
  );
}
