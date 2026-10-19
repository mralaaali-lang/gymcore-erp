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

// Receptionist/coach routes use the staff portal (/team-login) and member
// routes the member portal (/player-login); super-admin and gym-admin routes
// use the admin console (see routes/index.tsx).
const TEAM_AREA_PREFIXES = ['/trainer', '/reception'];
const PLAYER_AREA_PREFIXES = ['/player'];

export default function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const { isAuthenticated, role } = useApp();
  const location = useLocation();

  if (!isAuthenticated) {
    const isPlayerArea = PLAYER_AREA_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
    const isTeamArea = TEAM_AREA_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
    const destination = isPlayerArea ? '/player-login' : isTeamArea ? '/team-login' : '/login';
    return <Navigate to={destination} replace />;
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
