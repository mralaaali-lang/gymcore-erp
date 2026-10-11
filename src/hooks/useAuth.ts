import { useApp } from '../context/GymBrandContext';
import type { UserRole } from '../types';

export function useAuth() {
  const { isAuthenticated, role, tenantId } = useApp();

  const hasRole = (allowedRoles: UserRole[]) => allowedRoles.includes(role);

  const canAccess = (requiredRoles: UserRole[]) => {
    if (!isAuthenticated) return false;
    return requiredRoles.includes(role);
  };

  return { isAuthenticated, role, tenantId, hasRole, canAccess };
}
