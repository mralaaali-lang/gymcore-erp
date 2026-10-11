import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/GymBrandContext';
import type { UserRole } from '../types';
import AppLayout from '../components/layout/AppLayout';

interface ProtectedRouteProps {
  roles: UserRole[];
  children: React.ReactNode;
}

const ROLE_DASHBOARD: Record<UserRole, string> = {
  'super-admin': '/super-admin/dashboard',
  'gym-admin': '/admin/dashboard',
  'trainer': '/trainer/dashboard',
  'reception': '/reception/dashboard',
  'player': '/player/dashboard',
};

// Trainer/reception/member routes use the Team login screen; super-admin
// and gym-admin routes use the Admin login screen (see routes/index.tsx).
const TEAM_AREA_PREFIXES = ['/trainer', '/reception', '/player'];

export default function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const { isAuthenticated, role } = useApp();
  const location = useLocation();

  if (!isAuthenticated) {
    const isTeamArea = TEAM_AREA_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
    return <Navigate to={isTeamArea ? '/team-login' : '/login'} replace />;
  }

  if (!roles.includes(role)) {
    const fallback = ROLE_DASHBOARD[role] || '/login';
    return <Navigate to={fallback} replace />;
  }

  // NOTE: super-admin lands directly on the dashboard. The platform
  // onboarding wizard stays reachable via the dashboard banner link
  // (/super-admin/onboarding) but is never forced. Gym roles have their
  // own setup checklist on the gym dashboard.
  const isOnboardingRoute = location.pathname === '/super-admin/onboarding';

  // Onboarding page renders without AppLayout (full-screen wizard)
  if (isOnboardingRoute) {
    return <>{children}</>;
  }

  return <AppLayout>{children}</AppLayout>;
}
