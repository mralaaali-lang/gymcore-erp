export interface GymBranding {
  name: string;
  logoUrl: string;
  primaryColor: string;
}

export type UserRole = 'super-admin' | 'gym-admin' | 'trainer' | 'reception' | 'player';

// IMPORTANT: `owner` is a gym-scoped role (staff_users.gym_id is NOT NULL —
// an owner always belongs to exactly one gym). It must NEVER map to
// 'super-admin' here. True platform-wide super admins authenticate through
// a completely separate flow (POST /platform/auth/login against the
// platform_admins table) and never go through this ROLE_MAP at all — see
// the backend's server/src/middleware/platformAuth.ts.
//
// Previously `owner: 'super-admin'` meant any single gym's owner account
// landed on the Super Admin dashboard UI and (before the backend fix) could
// even reach platform-wide endpoints. Owners now correctly land on the
// gym-admin (gym manager) dashboard, scoped to their own gym.
export const ROLE_MAP: Record<string, UserRole> = {
  owner: 'gym-admin',
  manager: 'gym-admin',
  coach: 'trainer',
  receptionist: 'reception',
  member: 'player',
  'super-admin': 'super-admin',
};

export interface AppState {
  tenantId: string;
  branding: GymBranding;
  theme: 'light' | 'dark';
  language: 'ar' | 'en';
  role: UserRole;
  isZeroState: boolean;
  isSidebarOpen: boolean;
  isAuthenticated: boolean;
}

export type AppAction =
  | { type: 'UPDATE_BRANDING'; payload: Partial<GymBranding> }
  | { type: 'SET_LANGUAGE'; payload: 'ar' | 'en' }
  | { type: 'SWITCH_TENANT'; payload: { id: string; isNew: boolean } }
  | { type: 'SET_ROLE'; payload: UserRole }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'LOGIN'; payload: { role: UserRole; tenantId: string } }
  | { type: 'LOGOUT' };

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  logoUrl: string;
  status: 'active' | 'suspended';
  planId: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  maxMembers: number;
  featuresJson: Record<string, boolean>;
}

export interface SupportTicket {
  id: string;
  tenantId: string;
  subject: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in-progress' | 'resolved';
  createdAt: string;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  actionType: string;
  ipAddress: string;
  timestamp: string;
}

export interface Member {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone: string;
  status: 'active' | 'expired' | 'suspended';
  planId: string;
  joinDate: string;
}

export interface StaffMember {
  id: string;
  tenantId: string;
  name: string;
  role: 'trainer' | 'reception' | 'manager' | 'cleaner';
  email: string;
  phone: string;
  salary: number;
  status: 'active' | 'inactive';
}

export interface PTSession {
  id: string;
  memberId: string;
  memberName: string;
  trainerId: string;
  trainerName: string;
  totalSessions: number;
  completedSessions: number;
  totalAmount: number;
  paidAmount: number;
  status: 'active' | 'completed' | 'overdue';
}

export interface InventoryItem {
  id: string;
  tenantId: string;
  name: string;
  quantity: number;
  unit: string;
  minStock: number;
  category: string;
}

export interface AttendanceRecord {
  id: string;
  memberId: string;
  memberName: string;
  date: string;
  checkIn: string;
  checkOut: string | null;
  type: 'regular' | 'pt' | 'class';
}

export interface BroadcastMessage {
  id: string;
  title: string;
  content: string;
  targetRoles: UserRole[];
  createdAt: string;
  createdBy: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  memberId: string;
  memberName: string;
  amount: number;
  method: 'cash' | 'card' | 'bank' | 'wallet';
  date: string;
  status: 'completed' | 'pending' | 'failed';
  description: string;
}

export interface RouteConfig {
  path: string;
  element: React.ComponentType;
  roles: UserRole[];
}

export interface NavItem {
  label: string;
  icon: string;
  path: string;
  roles: UserRole[];
  section?: string;
  badge?: string | number;
  premium?: boolean;
  /** §36 — sidebar hides the item unless EVERY key is in the gym's effective
   *  features (gym_effective_features via /auth/me). Only keys that exist in
   *  the plan modules vocabulary are ever used here (products, attendance,
   *  daily_reports) — gating on unknown keys would mass-hide. */
  requiresFeatures?: string[];
}

export interface MetricCard {
  label: string;
  value: string | number;
  icon: string;
  trend?: { value: string; positive: boolean };
  color?: 'primary' | 'secondary' | 'error' | 'warning';
}
