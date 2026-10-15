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
      // §41 — platform marketing (campaigns/referrals/loyalty) is real again:
      // /platform/marketing/* is proxied and guarded by authenticatePlatformAdmin.
      { label: i18n.t('nav.marketing'), icon: 'marketing', path: `${base}/marketing`, roles: ['super-admin'], section: i18n.t('nav.sectionCommunication') },

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
    // §35ث — the «الرئيسية» group is gone: the sidebar brand block already
    // links to /admin/dashboard, so the dashboard keeps its entrance and the
    // sidebar starts from the top with الأعضاء.
    return [
      // ── الأعضاء ──
      { label: i18n.t('sidebar.members'), icon: 'users', path: `${base}/members`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      { label: i18n.t('sidebar.subscriptions'), icon: 'subscriptions', path: `${base}/subscriptions`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      { label: i18n.t('sidebar.attendance'), icon: 'attendance', path: `${base}/attendance`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers'), badge: badges?.attendance, requiresFeatures: ['attendance'] },
      // الجدول stays — the owner's list didn't place it elsewhere and the
      // restructure is additive (no route loses its only sidebar entrance).
      { label: i18n.t('sidebar.schedule'), icon: 'schedule', path: `${base}/gym`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      // بوابة الأعضاء = the member-facing login (StaffMemberLoginPage also
      // signs members in) — a real page, not the manager-inaccessible /player.
      { label: i18n.t('sidebar.memberPortal'), icon: 'portal', path: '/team-login', roles: ['gym-admin'], section: i18n.t('sidebar.sectionMembers') },
      // ── المالية (مدفوعات·مصروفات·ديون·خزنة·شيفتات) ──
      // §43 — المدفوعات now opens its own screen (was the /admin/billing hub).
      { label: i18n.t('sidebar.payments'), icon: 'invoices', path: `${base}/payments`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance'), badge: badges?.payments },
      { label: i18n.t('sidebar.expenses'), icon: 'expenses', path: `${base}/expenses`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      // §45 — الديون now opens its own collection screen (was the billing tab).
      { label: i18n.t('sidebar.debts'), icon: 'debts', path: `${base}/debts`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      { label: i18n.t('sidebar.cashbox'), icon: 'cashbox', path: `${base}/cashbox`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      { label: i18n.t('sidebar.shiftSheets'), icon: 'statements', path: `${base}/cashbox/shifts`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionFinance') },
      // ── التقارير ──
      { label: i18n.t('sidebar.reports'), icon: 'reports', path: `${base}/reports`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionReports'), requiresFeatures: ['daily_reports'] },
      { label: i18n.t('sidebar.staffSales'), icon: 'sales', path: `${base}/reports/employee-sales`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionReports'), requiresFeatures: ['products'] },
      // التنبيهات = مركز الإنذار المبكر (/admin/notifications): 4 كروت
      // روابط لجداولها (انتهاء اليوم/قريبًا + ديون + مخزون) بنفس مصدر الشارة.
      { label: i18n.t('sidebar.alerts'), icon: 'alerts', path: `${base}/notifications`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionReports'), badge: badges?.alerts },
      { label: i18n.t('sidebar.announcements'), icon: 'announcements', path: `${base}/marketing?tab=Announcements`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionReports') },
      // ── التشغيل (kept whole per owner) ──
      { label: i18n.t('sidebar.store'), icon: 'products', path: `${base}/products`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps'), requiresFeatures: ['products'] },
      { label: i18n.t('sidebar.marketing'), icon: 'marketing', path: `${base}/marketing`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps') },
      { label: i18n.t('sidebar.crm'), icon: 'crm', path: `${base}/crm`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps') },
      // §34ح — growth page joined the sidebar after the members-page tab
      // strip (its only former entrance) was replaced by stat cards.
      { label: i18n.t('sidebar.growth'), icon: 'analytics', path: `${base}/analytics`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps') },
      { label: i18n.t('sidebar.website'), icon: 'website', path: `${base}/website`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionOps'), premium: true },
      // ── الإعدادات (شئون الموظفين أولًا·الباقات·المدربون·…) ──
      { label: i18n.t('sidebar.hr'), icon: 'users', path: `${base}/hr`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionSettings') },
      { label: i18n.t('sidebar.plans'), icon: 'package', path: `${base}/plans`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionSettings') },
      // المدربون = صفحة الكروت المستقلة (الحمل والتعاقد والحضور من الدفاتر الحية).
      { label: i18n.t('sidebar.coaches'), icon: 'coaches', path: `${base}/trainers`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionSettings') },
      { label: i18n.t('sidebar.trainerAttendance'), icon: 'attendance', path: `${base}/trainer-attendance`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionSettings') },
      { label: i18n.t('sidebar.privateTraining'), icon: 'coach', path: `${base}/private-training`, roles: ['gym-admin'], section: i18n.t('sidebar.sectionSettings') },
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
      // §41 — daily progress log backed by trainer_progress_logs (migration 069).
      { label: i18n.t('nav.dailyProgress'), icon: 'shifts', path: `${base}/progress`, roles: ['trainer'], section: i18n.t('nav.sectionTraining') },
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
      { label: i18n.t('nav.attendance'), icon: 'attendance', path: `${base}/attendance`, roles: ['reception'], section: i18n.t('nav.sectionMembers'), badge: badges?.attendance, requiresFeatures: ['attendance'] },
      { label: i18n.t('nav.products'), icon: 'products', path: `${base}/products`, roles: ['reception'], section: i18n.t('nav.sectionSales'), requiresFeatures: ['products'] },
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

/**
 * §35ث — full page headings (title + subtitle) moved OUT of the pages and
 * INTO the top bar. Keyed by the base route path; values mirror each page's
 * former PageHeader/DashboardPage wording. Unknown paths → null, and TopNav
 * falls back to the nav-label behavior of §35أ.
 */
export interface PageHeading {
  title: { ar: string; en: string };
  subtitle?: { ar: string; en: string };
}

export const PAGE_TITLES: Record<string, PageHeading> = {
  '/admin/dashboard': {
    title: { ar: 'لوحة القيادة', en: 'Dashboard' },
    subtitle: { ar: 'نظرة عامة على صالتك اليوم', en: 'Your gym at a glance today' },
  },
  '/admin/members': {
    title: { ar: 'إدارة المشتركين', en: 'Members' },
    subtitle: { ar: 'إدارة مشتركي الصالة الرياضية', en: 'Manage gym members' },
  },
  '/admin/subscriptions': {
    title: { ar: 'الاشتراكات', en: 'Subscriptions' },
    subtitle: { ar: 'كل اشتراكات الصالة — أرقام من قاعدة البيانات مباشرة', en: 'All gym subscriptions — real figures, straight from the DB' },
  },
  '/admin/attendance': {
    title: { ar: 'الحضور', en: 'Attendance' },
    subtitle: { ar: 'تسجيل دخول وخروج الأعضاء', en: 'Member check-ins and check-outs' },
  },
  '/admin/gym': {
    title: { ar: 'الصالة', en: 'Gym' },
    subtitle: { ar: 'الجدول الزمني والإدارة', en: 'Schedule and management' },
  },
  '/admin/billing': {
    title: { ar: 'الفواتير', en: 'Invoices' },
    // §43 — المدفوعات moved to its own /admin/payments screen.
    subtitle: { ar: 'نظرة عامة والاشتراكات المتكررة والمحاسبة', en: 'Overview, recurring revenue and accounting' },
  },
  '/admin/payments': {
    title: { ar: 'المدفوعات', en: 'Payments' },
    subtitle: { ar: 'كل مقبوضات الصالة — سجل وفلاتر وملخص على النطاق', en: 'Every gym receipt — log, filters and range summary' },
  },
  '/admin/expenses': {
    title: { ar: 'المصروفات', en: 'Expenses' },
    subtitle: { ar: 'تتبع مصروفات النادي', en: 'Track club expenses' },
  },
  '/admin/debts': {
    title: { ar: 'ديون الأعضاء', en: 'Member Debts' },
    subtitle: { ar: 'تحصيل الديون: تذكير واتساب ثم سداد كلي أو جزئي', en: 'Collection: WhatsApp reminder, then full or partial payment' },
  },
  '/admin/cashbox/shifts': {
    title: { ar: 'الشيفتات', en: 'Shifts' },
    subtitle: { ar: 'سجل الشيفتات وتقرير الإقفال', en: 'Shift log and closing report' },
  },
  '/admin/cashbox': {
    title: { ar: 'الخزينة', en: 'Cashbox' },
    subtitle: { ar: 'جلسات الخزينة اليومية', en: 'Daily cash sessions' },
  },
  '/admin/sales': {
    title: { ar: 'نقطة البيع', en: 'Point of Sale' },
    subtitle: { ar: 'المبيعات والمنتجات', en: 'Sales and products' },
  },
  '/admin/reports': {
    title: { ar: 'التقارير والإحصائيات', en: 'Reports & Statistics' },
    subtitle: { ar: 'لوحة مجمّعة — كل رقم مربوط بفترة الفلتر', en: 'Aggregated dashboard — every figure uses the date filter' },
  },
  '/admin/notifications': {
    title: { ar: 'مركز الإنذار المبكر', en: 'Alert Center' },
    subtitle: { ar: 'انتهاء اليوم وقريبًا والمستحقات والمخزون — view مجمّعة', en: 'Expiring, dues and low stock — aggregated view' },
  },
  '/admin/reports/members': {
    title: { ar: 'تقرير الأعضاء', en: 'Members report' },
    subtitle: { ar: 'قائمة الأعضاء وحالة الاشتراك', en: 'Member list and subscription status' },
  },
  '/admin/reports/financial': {
    title: { ar: 'التقرير المالي', en: 'Financial report' },
    subtitle: { ar: 'إجمالي/مصروف/صافي + طرق الدفع + أحدث الحركات', en: 'Totals, methods and latest movements' },
  },
  '/admin/reports/attendance': {
    title: { ar: 'تقرير الحضور', en: 'Attendance report' },
    subtitle: { ar: 'كروت وترند وذروة وساعات وسجل', en: 'Cards, trend, peaks, hours and log' },
  },
  '/admin/reports/subscriptions': {
    title: { ar: 'تقرير الاشتراكات', en: 'Subscriptions report' },
    subtitle: { ar: 'قائمة الاشتراكات وحالة الدفع', en: 'Subscription list and payment status' },
  },
  '/admin/reports/absent': {
    title: { ar: 'الأعضاء الغائبون', en: 'Absent members' },
    subtitle: { ar: 'قائمة إنقاذ مرتبة بالأخطر أولًا', en: 'Rescue list, most critical first' },
  },
  '/admin/reports/employee-sales': {
    title: { ar: 'مبيعات الموظفين', en: 'Employee sales' },
    subtitle: { ar: 'جديد/تجديد وقيمة ومحصّل وعمولة', en: 'New/renewal, value, collected and commission' },
  },
  '/admin/products': {
    title: { ar: 'المتجر', en: 'Store' },
    subtitle: { ar: 'المنتجات والمشتريات والموردون في مكان واحد', en: 'Products, purchases and suppliers in one place' },
  },
  '/admin/marketing': {
    title: { ar: 'التسويق', en: 'Marketing' },
    subtitle: { ar: 'أتمتة وإدارة الحملات التسويقية', en: 'Marketing campaign automation and management' },
  },
  '/super-admin/marketing': {
    title: { ar: 'تسويق المنصة', en: 'Platform Marketing' },
    subtitle: { ar: 'الحملات والإحالات وبرنامج الولاء عبر كل الصالات', en: 'Campaigns, referrals and loyalty across all gyms' },
  },
  '/trainer/progress': {
    title: { ar: 'التقدم اليومي', en: 'Daily Progress' },
    subtitle: { ar: 'سجل عملك اليومي: عملاء وجلسات ودقائق', en: 'Your daily log: clients, sessions and minutes' },
  },
  '/admin/crm': {
    title: { ar: 'إدارة العملاء المحتملين', en: 'Leads' },
    subtitle: { ar: 'تابع العملاء المحتملين عبر مراحل البيع', en: 'Track leads through the sales pipeline' },
  },
  '/admin/analytics': {
    title: { ar: 'التحليلات', en: 'Analytics' },
    subtitle: { ar: 'زيارات الأعضاء وإشغال الكلاسات والاحتفاظ — كلها من بيانات الصالة الفعلية', en: 'Member visits, class occupancy and retention — all from real gym data' },
  },
  '/admin/website': {
    title: { ar: 'بناء الموقع', en: 'Website Builder' },
    subtitle: { ar: 'إنشاء وتخصيص موقع الصالة الإلكتروني', en: 'Create and customize the gym website' },
  },
  '/admin/plans': {
    title: { ar: 'الباقات والعروض', en: 'Plans & Offers' },
    subtitle: { ar: 'مصدر واحد للباقات — يُستخدم في إضافة الأعضاء وفي حساب الإيراد المتكرر', en: 'One source of plans — used by member signup and recurring revenue' },
  },
  '/admin/plans/add': {
    title: { ar: 'إضافة باقة', en: 'New plan' },
    subtitle: { ar: 'هوية الباقة وقواعدها وأيام الحضور', en: 'Plan identity, rules and attendance days' },
  },
  '/admin/sports': {
    title: { ar: 'الرياضات', en: 'Sports' },
    subtitle: { ar: 'كتالوج رياضات الصالة — تصنيف الباقات والاشتراكات', en: 'Gym sports catalog — plans and subscriptions classification' },
  },
  '/admin/quick-session': {
    title: { ar: 'حصة سريعة', en: 'Quick session' },
    subtitle: { ar: 'بيع حصة لعضو أو عابر — بلا اشتراك', en: 'Sell a session to a member or walk-in — no subscription' },
  },
  '/admin/users': {
    title: { ar: 'الفريق', en: 'Team' },
    subtitle: { ar: 'الموظفون والدوام والموارد البشرية في مكان واحد', en: 'Staff, shifts and HR in one place' },
  },
  '/admin/trainers': {
    title: { ar: 'المدربون', en: 'Coaches' },
    subtitle: { ar: 'الحمل والتعاقد والحضور — كروت من الدفاتر الحية', en: 'Load, contracts and presence — live cards' },
  },
  '/admin/trainer-attendance': {
    title: { ar: 'حضور المدربين', en: 'Coach attendance' },
    subtitle: { ar: 'تسجيل يدوي وسجل يومي وتقرير شهري — بلا كاميرا', en: 'Manual log, daily record and monthly report — no camera' },
  },
  '/admin/trainer-attendance/add': {
    title: { ar: 'تسجيل حضور مدرب', en: 'Clock in a coach' },
    subtitle: { ar: 'ضغطة واحدة للحالة الشائعة وفورم للحالات الخاصة', en: 'One tap for the common case, a form for exceptions' },
  },
  '/admin/trainer-attendance/report': {
    title: { ar: 'تقرير حضور المدربين', en: 'Coach attendance report' },
    subtitle: { ar: 'ملخص شهري: أيام وساعات ونسب — المقام أيام العمل', en: 'Monthly summary: days, hours and rates — working-day base' },
  },
  '/admin/private-training': {
    title: { ar: 'البرايفت (التدريب الخاص)', en: 'Private training' },
    subtitle: { ar: 'حصص وفلوس معًا — منتج مستقل عن الباقات', en: 'Sessions and money together — independent of plans' },
  },
  '/admin/private-training/add': {
    title: { ar: 'تسجيل برايفت جديد', en: 'New private training' },
    subtitle: { ar: 'عضو + مدرب + حصص + دفع في حفظ واحد', en: 'Member + coach + sessions + payment in one save' },
  },
  '/admin/hr': {
    title: { ar: 'شئون الموظفين', en: 'HR' },
    subtitle: { ar: 'الموظفون والحضور والإجازات والرواتب والعقود', en: 'Staff, attendance, leaves, payroll and contracts' },
  },
  '/admin/hr/add': {
    title: { ar: 'إضافة موظف جديد', en: 'New staff' },
    subtitle: { ar: 'شخصية + وظيفية + راتب + أرصدة', en: 'Personal, job, salary and balances' },
  },
  '/admin/hr/attendance': {
    title: { ar: 'حضور وانصراف الموظفين', en: 'Staff attendance' },
    subtitle: { ar: 'تحضير يومي بـradio — أسرع من الفورم', en: 'Daily radio register — faster than forms' },
  },
  '/admin/hr/leaves': {
    title: { ar: 'إدارة الإجازات', en: 'Leaves' },
    subtitle: { ar: 'أرصدة شهرية متجددة وطلبات تُخصم عند الاعتماد', en: 'Renewing balances, deducted on approval' },
  },
  '/admin/hr/adjustments': {
    title: { ar: 'المكافآت والخصومات', en: 'Adjustments' },
    subtitle: { ar: 'مكافأة وخصم وسلفة تُقفل مع المسير', en: 'Bonuses, deductions and advances closed with payroll' },
  },
  '/admin/hr/payroll': {
    title: { ar: 'إدارة الرواتب', en: 'Payroll' },
    subtitle: { ar: 'مسودة ← معتمد ← مصروف بحركة خزنة', en: 'Draft, approved, paid with a cashbox entry' },
  },
  '/admin/hr/contracts': {
    title: { ar: 'العقود الوظيفية', en: 'Contracts' },
    subtitle: { ar: 'أرقام CON- متسلسلة تنتهي تلقائيًا', en: 'Sequential CON- numbers with auto-expiry' },
  },
  '/admin/settings': {
    title: { ar: 'الإعدادات', en: 'Settings' },
    subtitle: { ar: 'إدارة إعدادات الصالة', en: 'Manage gym settings' },
  },
  // §35ث — pages reused by the trainer/reception roles keep the same top-bar
  // heading treatment as their /admin twins.
  '/reception/members': {
    title: { ar: 'الأعضاء', en: 'Members' },
    subtitle: { ar: 'إدارة مشتركي الصالة الرياضية', en: 'Manage gym members' },
  },
  '/reception/attendance': {
    title: { ar: 'الحضور', en: 'Attendance' },
    subtitle: { ar: 'تسجيل دخول وخروج الأعضاء', en: 'Member check-ins and check-outs' },
  },
  '/reception/products': {
    title: { ar: 'المتجر', en: 'Store' },
    subtitle: { ar: 'المنتجات والمشتريات', en: 'Products and purchases' },
  },
  '/trainer/clients': {
    title: { ar: 'عملائي', en: 'My Clients' },
    subtitle: { ar: 'أعضاء المدرب المسندون', en: 'Members assigned to the coach' },
  },
  '/trainer/attendance': {
    title: { ar: 'الحضور', en: 'Attendance' },
    subtitle: { ar: 'تسجيل دخول وخروج الأعضاء', en: 'Member check-ins and check-outs' },
  },
};

/**
 * §35ث — longest-prefix lookup over PAGE_TITLES (query ignored, detail routes
 * like /admin/members/:id resolve to their base page). Returns language-
 * selected strings, or null when the path has no dedicated heading.
 */
export function resolvePageHeading(
  pathname: string,
  isRtl: boolean
): { title: string; subtitle?: string } | null {
  const clean = pathname.split('?')[0];
  let bestKey = '';
  for (const key of Object.keys(PAGE_TITLES)) {
    if (clean === key || clean.startsWith(key + '/')) {
      if (key.length > bestKey.length) bestKey = key;
    }
  }
  if (!bestKey) return null;
  const heading = PAGE_TITLES[bestKey];
  const pick = (v: { ar: string; en: string }) => (isRtl ? v.ar : v.en);
  return { title: pick(heading.title), subtitle: heading.subtitle ? pick(heading.subtitle) : undefined };
}
