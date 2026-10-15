import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AdminLoginPage from '../pages/auth/AdminLoginPage';
import StaffMemberLoginPage from '../pages/auth/StaffMemberLoginPage';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '../pages/auth/ResetPasswordPage';
import PageTransition from '../components/ui/PageTransition';
import { useApp } from '../context/GymBrandContext';
import type { UserRole } from '../types';

function lazyLoad(
  importFn: () => Promise<{ default: React.ComponentType }>,
  allowedRoles: UserRole[]
) {
  const LazyComponent = React.lazy(importFn);
  return (
    <ProtectedRoute roles={allowedRoles}>
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><span className="material-symbols-outlined animate-spin">sync</span></div>}>
        <PageTransition><LazyComponent /></PageTransition>
      </React.Suspense>
    </ProtectedRoute>
  );
}

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><span className="material-symbols-outlined animate-spin">sync</span></div>}>
      {children}
    </React.Suspense>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public */}
        {/* /login: Super Admin + Gym Manager only. /team-login: Trainer, Reception & Member. */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<SuspenseWrapper><AdminLoginPage /></SuspenseWrapper>} />
        <Route path="/team-login" element={<SuspenseWrapper><StaffMemberLoginPage /></SuspenseWrapper>} />
        <Route path="/forgot-password" element={<SuspenseWrapper><ForgotPasswordPage /></SuspenseWrapper>} />
        <Route path="/reset-password" element={<SuspenseWrapper><ResetPasswordPage /></SuspenseWrapper>} />

        {/* ============================================
            SUPER ADMIN DASHBOARD  (/super-admin/*)
        ============================================ */}
        <Route path="/super-admin/dashboard" element={lazyLoad(() => import('../pages/shared/DashboardRouter'), ['super-admin'])} />
        <Route path="/super-admin/tenants" element={lazyLoad(() => import('../pages/super-admin/TenantDirectory'), ['super-admin'])} />
        <Route path="/super-admin/tenants/new" element={lazyLoad(() => import('../pages/super-admin/CreateGymWizard'), ['super-admin'])} />
        <Route path="/super-admin/tenants/:id/edit" element={lazyLoad(() => import('../pages/super-admin/CreateGymWizard'), ['super-admin'])} />
        <Route path="/super-admin/tenants/:id" element={lazyLoad(() => import('../pages/super-admin/TenantDirectory'), ['super-admin'])} />
        <Route path="/super-admin/tenants/:id/handover" element={lazyLoad(() => import('../pages/super-admin/GymHandover'), ['super-admin'])} />
        <Route path="/super-admin/billing" element={lazyLoad(() => import('../pages/super-admin/BillingEngine'), ['super-admin'])} />
        <Route path="/super-admin/reports" element={lazyLoad(() => import('../pages/super-admin/PlatformReports'), ['super-admin'])} />
        <Route path="/super-admin/settings" element={lazyLoad(() => import('../pages/super-admin/SystemSettings'), ['super-admin'])} />
        <Route path="/super-admin/support" element={lazyLoad(() => import('../pages/super-admin/SupportTickets'), ['super-admin'])} />
        <Route path="/super-admin/admins" element={lazyLoad(() => import('../pages/super-admin/PlatformAdmins'), ['super-admin'])} />
        <Route path="/super-admin/onboarding" element={lazyLoad(() => import('../pages/super-admin/OnboardingWizard'), ['super-admin'])} />
        <Route path="/super-admin/broadcast" element={lazyLoad(() => import('../pages/super-admin/BroadcastEngine'), ['super-admin'])} />
        <Route path="/super-admin/notifications" element={lazyLoad(() => import('../pages/super-admin/NotificationsEngine'), ['super-admin'])} />
        <Route path="/super-admin/audit" element={lazyLoad(() => import('../pages/super-admin/AuditLogs'), ['super-admin'])} />
        <Route path="/super-admin/sms" element={lazyLoad(() => import('../pages/super-admin/SmsGateway'), ['super-admin'])} />
        <Route path="/super-admin/monitor" element={lazyLoad(() => import('../pages/super-admin/SystemMonitor'), ['super-admin'])} />
        <Route path="/super-admin/security" element={lazyLoad(() => import('../pages/super-admin/SecurityCenter'), ['super-admin'])} />
        <Route path="/super-admin/ota" element={lazyLoad(() => import('../pages/super-admin/OtaUpdateManager'), ['super-admin'])} />
        <Route path="/super-admin/branding" element={lazyLoad(() => import('../pages/super-admin/BrandingTab'), ['super-admin'])} />
        <Route path="/super-admin/developer" element={lazyLoad(() => import('../pages/super-admin/DeveloperPortal'), ['super-admin'])} />
        {/* §41 — platform marketing restored: real /platform/marketing/* endpoints */}
        <Route path="/super-admin/marketing" element={lazyLoad(() => import('../pages/super-admin/PlatformMarketing'), ['super-admin'])} />

        {/* ============================================
            GYM MANAGER DASHBOARD  (/admin/*)
            IA mirrors the product tree: members lifecycle →
            money → operations → growth → team & settings.
            Legacy alias paths redirect to their canonical route.
        ============================================ */}
        <Route path="/admin/dashboard" element={lazyLoad(() => import('../pages/shared/DashboardRouter'), ['gym-admin'])} />
        <Route path="/admin/members" element={lazyLoad(() => import('../pages/gym-admin/MembersPage'), ['gym-admin'])} />
        <Route path="/admin/members/add" element={lazyLoad(() => import('../pages/gym-admin/MemberRegistrationForm'), ['gym-admin'])} />
        <Route path="/admin/members/:id" element={lazyLoad(() => import('../pages/gym-admin/MemberProfileView'), ['gym-admin'])} />
        {/* §34ي — /admin/subscriptions أصبح دفتر اشتراكات الأعضاء؛ صفحة
            الباقات والعروض (§33ب) انتقلت إلى /admin/plans. */}
        <Route path="/admin/subscriptions" element={lazyLoad(() => import('../pages/gym-admin/SubscriptionsPage'), ['gym-admin'])} />
        <Route path="/admin/plans/add" element={lazyLoad(() => import('../pages/gym-admin/plans/AddPlanPage'), ['gym-admin'])} />
        <Route path="/admin/sports" element={lazyLoad(() => import('../pages/gym-admin/SportsPage'), ['gym-admin'])} />
        <Route path="/admin/quick-session" element={lazyLoad(() => import('../pages/gym-admin/QuickSessionPage'), ['gym-admin', 'reception'])} />
        <Route path="/admin/plans" element={lazyLoad(() => import('../pages/gym-admin/SubscriptionManagement'), ['gym-admin'])} />
        <Route path="/admin/attendance" element={lazyLoad(() => import('../pages/gym-admin/AttendanceRecords'), ['gym-admin'])} />
        {/* Store hub — merged products/purchases/suppliers pages into one tabbed page (§23). */}
        <Route path="/admin/products" element={lazyLoad(() => import('../pages/gym-admin/store/StorePage'), ['gym-admin'])} />
        <Route path="/admin/inventory" element={<Navigate to="/admin/products" replace />} />
        <Route path="/admin/billing" element={lazyLoad(() => import('../pages/gym-admin/BillingOverview'), ['gym-admin'])} />
        <Route path="/admin/marketing" element={lazyLoad(() => import('../pages/gym-admin/MarketingAutomation'), ['gym-admin'])} />
        <Route path="/admin/website" element={lazyLoad(() => import('../pages/gym-admin/WebsiteGenerator'), ['gym-admin'])} />
        <Route path="/admin/gym" element={lazyLoad(() => import('../pages/gym-admin/GymCalendar'), ['gym-admin'])} />
        <Route path="/admin/shifts" element={<Navigate to="/admin/users?tab=shifts" replace />} />
        <Route path="/admin/reports" element={lazyLoad(() => import('../pages/gym-admin/FinancialReports'), ['gym-admin'])} />
        <Route path="/admin/reports/members" element={lazyLoad(() => import('../pages/gym-admin/MembersReport'), ['gym-admin'])} />
        <Route path="/admin/reports/financial" element={lazyLoad(() => import('../pages/gym-admin/FinancialReport'), ['gym-admin'])} />
        <Route path="/admin/reports/attendance" element={lazyLoad(() => import('../pages/gym-admin/AttendanceReport'), ['gym-admin'])} />
        <Route path="/admin/reports/subscriptions" element={lazyLoad(() => import('../pages/gym-admin/SubscriptionsReport'), ['gym-admin'])} />
        <Route path="/admin/reports/absent" element={lazyLoad(() => import('../pages/gym-admin/AbsentMembers'), ['gym-admin'])} />
        <Route path="/admin/reports/employee-sales" element={lazyLoad(() => import('../pages/gym-admin/EmployeeSales'), ['gym-admin'])} />
        <Route path="/admin/reports/subscriptions" element={lazyLoad(() => import('../pages/gym-admin/SubscriptionsReport'), ['gym-admin'])} />
        <Route path="/admin/analytics" element={lazyLoad(() => import('../pages/gym-admin/BranchAnalytics'), ['gym-admin'])} />
        <Route path="/admin/hr" element={<Navigate to="/admin/users?tab=hr" replace />} />
        <Route path="/admin/crm" element={lazyLoad(() => import('../pages/gym-admin/CrmPage'), ['gym-admin'])} />
        <Route path="/admin/customer360/:id" element={lazyLoad(() => import('../pages/gym-admin/Customer360Page'), ['gym-admin'])} />
        <Route path="/admin/settings" element={lazyLoad(() => import('../pages/settings/SettingsPage'), ['gym-admin'])} />
        {/* Settings hub — backup/migration pages merged as tabs (§27). */}
        <Route path="/admin/settings/migration" element={<Navigate to="/admin/settings?tab=migration" replace />} />
        <Route path="/admin/backup" element={<Navigate to="/admin/settings?tab=backup" replace />} />
        {/* مركز الإنذار المبكر — view تجميعية read-only (ديون + مخزون + انتهاء)، بلا إضافة/تعديل */}
        <Route path="/admin/notifications" element={lazyLoad(() => import('../pages/gym-admin/AlertsCenterPage'), ['gym-admin'])} />
        {/* Sales, Purchases, Suppliers, Expenses, Debts, Cashbox */}
        <Route path="/admin/sales" element={lazyLoad(() => import('../pages/gym-admin/SalesPage'), ['gym-admin'])} />
        <Route path="/admin/purchases" element={<Navigate to="/admin/products?tab=purchases" replace />} />
        <Route path="/admin/suppliers" element={<Navigate to="/admin/products?tab=suppliers" replace />} />
        <Route path="/admin/expenses" element={lazyLoad(() => import('../pages/gym-admin/ExpensesPage'), ['gym-admin'])} />
        <Route path="/admin/cashbox" element={lazyLoad(() => import('../pages/gym-admin/CashboxPage'), ['gym-admin'])} />
        <Route path="/admin/cashbox/shifts" element={lazyLoad(() => import('../pages/gym-admin/CashboxShiftsPage'), ['gym-admin'])} />
        {/* §45 — DebtsPage is its own collection screen again (was the billing tab). */}
        <Route path="/admin/debts" element={lazyLoad(() => import('../pages/gym-admin/DebtsPage'), ['gym-admin'])} />
        {/* Marketing hub — AnnouncementsPage merged as the "Announcements" tab (§26). */}
        <Route path="/admin/announcements" element={<Navigate to="/admin/marketing?tab=Announcements" replace />} />
        {/* Team hub — merged trainers/shifts/hr/users pages into one tabbed page (§22). */}
        {/* المدربون — صفحة كروت مستقلة (الحمل/الحضور/التعاقد من الدفاتر الحية) */}
        <Route path="/admin/trainers" element={lazyLoad(() => import('../pages/gym-admin/TrainersPage'), ['gym-admin'])} />
        <Route path="/admin/trainer-attendance" element={lazyLoad(() => import('../pages/gym-admin/TrainerAttendancePage'), ['gym-admin'])} />
        <Route path="/admin/trainer-attendance/add" element={lazyLoad(() => import('../pages/gym-admin/TrainerCheckInPage'), ['gym-admin'])} />
        <Route path="/admin/trainer-attendance/report" element={lazyLoad(() => import('../pages/gym-admin/CoachAttendanceReportPage'), ['gym-admin'])} />
        <Route path="/admin/private-training" element={lazyLoad(() => import('../pages/gym-admin/PrivateTrainingPage'), ['gym-admin'])} />
        <Route path="/admin/private-training/add" element={lazyLoad(() => import('../pages/gym-admin/AddPrivatePage'), ['gym-admin'])} />
        <Route path="/admin/hr" element={lazyLoad(() => import('../pages/gym-admin/HrMainPage'), ['gym-admin'])} />
        <Route path="/admin/hr/add" element={lazyLoad(() => import('../pages/gym-admin/AddEmployeePage'), ['gym-admin'])} />
        <Route path="/admin/hr/attendance" element={lazyLoad(() => import('../pages/gym-admin/HrAttendancePage'), ['gym-admin'])} />
        <Route path="/admin/hr/leaves" element={lazyLoad(() => import('../pages/gym-admin/LeavesPage'), ['gym-admin'])} />
        <Route path="/admin/hr/adjustments" element={lazyLoad(() => import('../pages/gym-admin/AdjustmentsPage'), ['gym-admin'])} />
        <Route path="/admin/hr/payroll" element={lazyLoad(() => import('../pages/gym-admin/PayrollPage'), ['gym-admin'])} />
        <Route path="/admin/hr/contracts" element={lazyLoad(() => import('../pages/gym-admin/ContractsPage'), ['gym-admin'])} />
        <Route path="/admin/users" element={lazyLoad(() => import('../pages/gym-admin/team/TeamPage'), ['gym-admin'])} />
        {/* Legacy aliases — one canonical URL per page */}
        {/* §43 — payments got their own full screen (attendance pattern);
            the old /admin/payments → /admin/reports redirect is retired. */}
        <Route path="/admin/payments" element={lazyLoad(() => import('../pages/gym-admin/PaymentsPage'), ['gym-admin'])} />
        <Route path="/admin/retention" element={<Navigate to="/admin/crm" replace />} />
        <Route path="/admin/ai-coach" element={<Navigate to="/admin/analytics" replace />} />
        <Route path="/admin/leaderboard" element={<Navigate to="/admin/analytics" replace />} />
        <Route path="/admin/branding" element={<Navigate to="/admin/settings" replace />} />

        {/* ============================================
            TRAINER DASHBOARD  (/trainer/*)
        ============================================ */}
        <Route path="/trainer/dashboard" element={lazyLoad(() => import('../pages/shared/DashboardRouter'), ['trainer'])} />
        <Route path="/trainer/clients" element={lazyLoad(() => import('../pages/gym-admin/MemberList'), ['trainer'])} />
        <Route path="/trainer/clients/:id" element={lazyLoad(() => import('../pages/gym-admin/MemberProfile'), ['trainer'])} />
        <Route path="/trainer/attendance" element={lazyLoad(() => import('../pages/gym-admin/AttendanceRecords'), ['trainer'])} />
        <Route path="/trainer/training" element={lazyLoad(() => import('../pages/trainer/TrainerDashboard'), ['trainer'])} />
        <Route path="/trainer/training/sessions" element={lazyLoad(() => import('../pages/trainer/SessionManagement'), ['trainer'])} />
        <Route path="/trainer/training/pt" element={lazyLoad(() => import('../pages/trainer/PersonalTraining'), ['trainer'])} />
        <Route path="/trainer/training/clients" element={lazyLoad(() => import('../pages/trainer/ClientProgress'), ['trainer'])} />
        {/* §41 — trainer daily progress log (trainer_progress_logs, migration 069) */}
        <Route path="/trainer/progress" element={lazyLoad(() => import('../pages/trainer/TrainerProgress'), ['trainer'])} />
        <Route path="/trainer/training/mobile" element={lazyLoad(() => import('../pages/trainer/TrainerMobileDashboard'), ['trainer'])} />
        {/* Legacy alias — ai-coach was a placeholder alias of the manager
            analytics page, not coach content */}
        <Route path="/trainer/ai-coach" element={<Navigate to="/trainer/dashboard" replace />} />
        <Route path="/trainer/settings" element={lazyLoad(() => import('../pages/super-admin/SystemSettings'), ['trainer'])} />

        {/* ============================================
            RECEPTION DASHBOARD  (/reception/*)
        ============================================ */}
        <Route path="/reception/dashboard" element={lazyLoad(() => import('../pages/shared/DashboardRouter'), ['reception'])} />
        {/* Legacy alias — checkin rendered the same AttendanceRecords page */}
        <Route path="/reception/checkin" element={<Navigate to="/reception/attendance" replace />} />
        <Route path="/reception/members" element={lazyLoad(() => import('../pages/gym-admin/MemberList'), ['reception'])} />
        <Route path="/reception/attendance" element={lazyLoad(() => import('../pages/gym-admin/AttendanceRecords'), ['reception'])} />
        {/* Store hub rendered for reception with the tab bar hidden —
            purchases/suppliers tabs are manager-only (§23). */}
        <Route path="/reception/products" element={lazyLoad(() => import('../pages/gym-admin/store/StorePage'), ['reception'])} />
        {/* StaffManagement merged into the manager-only Team hub; reception has
            no staff-shifts access (manager-only endpoints → was 403 noise). */}
        <Route path="/reception/shifts" element={<Navigate to="/reception/dashboard" replace />} />
        <Route path="/reception/settings" element={lazyLoad(() => import('../pages/super-admin/SystemSettings'), ['reception'])} />

        {/* ============================================
            PLAYER PORTAL  (/player/*)
            Dashboard = shared DashboardRouter (real API data).
            Legacy mock sub-pages (pass/loyalty/tips) redirect —
            their content lived on the same mock page.
        ============================================ */}
        <Route path="/player/dashboard" element={lazyLoad(() => import('../pages/shared/DashboardRouter'), ['player'])} />
        <Route path="/player/pass" element={<Navigate to="/player/dashboard" replace />} />
        <Route path="/player/profile" element={lazyLoad(() => import('../pages/player/AthleteDashboard'), ['player'])} />
        <Route path="/player/progress" element={lazyLoad(() => import('../pages/player/AthleteProgress'), ['player'])} />
        <Route path="/player/loyalty" element={<Navigate to="/player/dashboard" replace />} />
        <Route path="/player/tips" element={<Navigate to="/player/dashboard" replace />} />

        {/* Fallback */}

        {/* Legacy flat routes — redirect to role-prefixed equivalents */}
        <Route path="/dashboard" element={<RoleRedirect to="/dashboard" />} />
        <Route path="/members" element={<RoleRedirect to="/members" />} />
        <Route path="/members/add" element={<RoleRedirect to="/members/add" />} />
        <Route path="/members/:id" element={<RoleRedirect to="/members" />} />
        <Route path="/attendance" element={<RoleRedirect to="/attendance" />} />
        <Route path="/billing" element={<RoleRedirect to="/billing" />} />
        <Route path="/reports" element={<RoleRedirect to="/reports" />} />
        <Route path="/settings" element={<RoleRedirect to="/settings" />} />
        <Route path="/training/*" element={<RoleRedirect to="/training" />} />
        <Route path="/profile" element={<RoleRedirect to="/profile" />} />
        <Route path="/progress" element={<RoleRedirect to="/progress" />} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/** Redirects to the role-prefixed equivalent path */
function RoleRedirect({ to }: { to: string }) {
  const { role } = useApp();
  const base = role === 'super-admin' ? '/super-admin'
    : role === 'gym-admin' ? '/admin'
    : role === 'trainer' ? '/trainer'
    : role === 'reception' ? '/reception'
    : '/player';
  return <Navigate to={`${base}${to}`} replace />;
}
