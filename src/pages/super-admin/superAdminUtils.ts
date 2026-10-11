// ── Super Admin Shared Utilities ──
import {
  Buildings, CreditCard, ChartBar, Bell, Shield, Monitor, Gear,
  Code, Headset, Users, Megaphone, Rocket,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

/**
 * Unified translation helper — returns Arabic string if `isRtl` is true, else English.
 */
export function tr(isRtl: boolean, en: string, ar: string): string {
  return isRtl ? ar : en;
}

/**
 * Shortcut for `tr(true, en, ar)` / `tr(false, en, ar)`.
 */
export const t = (en: string, ar: string, isRtl: boolean) => (isRtl ? ar : en);

// ── Sidebar Navigation ──
export interface NavItem {
  key: string;
  labelEn: string;
  labelAr: string;
  icon: Icon;
  path: string;
  badge?: number;
}

export const SUPER_ADMIN_NAV: NavItem[] = [
  { key: 'dashboard', labelEn: 'Dashboard', labelAr: 'لوحة التحكم', icon: ChartBar, path: '/super-admin/dashboard' },
  { key: 'tenants', labelEn: 'Tenants', labelAr: 'الصالات', icon: Buildings, path: '/super-admin/tenants' },
  { key: 'billing', labelEn: 'Billing', labelAr: 'الفواتير', icon: CreditCard, path: '/super-admin/billing' },
  { key: 'reports', labelEn: 'Reports & AI', labelAr: 'التقارير والذكاء الاصطناعي', icon: ChartBar, path: '/super-admin/reports' },
  { key: 'notifications', labelEn: 'Notifications', labelAr: 'الإشعارات', icon: Bell, path: '/super-admin/notifications' },
  { key: 'security', labelEn: 'Security', labelAr: 'الأمان', icon: Shield, path: '/super-admin/security' },
  { key: 'system', labelEn: 'System', labelAr: 'النظام', icon: Monitor, path: '/super-admin/monitor' },
  { key: 'marketing', labelEn: 'Marketing', labelAr: 'التسويق', icon: Megaphone, path: '/super-admin/marketing' },
  { key: 'support', labelEn: 'Support', labelAr: 'الدعم', icon: Headset, path: '/super-admin/support' },
  { key: 'admins', labelEn: 'Admins', labelAr: 'المشرفين', icon: Users, path: '/super-admin/admins' },
  { key: 'developer', labelEn: 'Developer', labelAr: 'المطورين', icon: Code, path: '/super-admin/developer' },
  { key: 'settings', labelEn: 'Settings', labelAr: 'الإعدادات', icon: Gear, path: '/super-admin/settings' },
  { key: 'onboarding', labelEn: 'Onboarding', labelAr: 'الإعداد', icon: Rocket, path: '/super-admin/onboarding' },
];

// ── Tenant / Plan Helpers ──
export const PLAN_BADGE: Record<string, string> = {
  basic: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  professional: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  premium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  enterprise: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

// Plan labels follow the billing page vocabulary (billing_plans):
// الانطلاق / الاحترافية / الشركات — 'professional' kept as legacy alias of premium.
export const PLAN_LABELS: Record<string, Record<string, string>> = {
  basic: { ar: 'الانطلاق', en: 'Starter' },
  premium: { ar: 'الاحترافية', en: 'Professional' },
  professional: { ar: 'الاحترافية', en: 'Professional' },
  enterprise: { ar: 'الشركات', en: 'Enterprise' },
};

export function planLabel(tier: string, isRtl: boolean): string {
  return PLAN_LABELS[tier]?.[isRtl ? 'ar' : 'en'] || tier;
}

// ── Status Helpers ──
export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

export const STATUS_LABELS: Record<string, Record<string, string>> = {
  active: { ar: 'نشط', en: 'Active' },
  suspended: { ar: 'موقوف', en: 'Suspended' },
  expired: { ar: 'منتهي', en: 'Expired' },
  pending: { ar: 'معلق', en: 'Pending' },
};

export function statusLabel(status: string, isRtl: boolean): string {
  return STATUS_LABELS[status]?.[isRtl ? 'ar' : 'en'] || status;
}

// ── Date Formatting ──
export function formatDate(dateStr: string | null | undefined, isRtl: boolean): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | null | undefined, isRtl: boolean): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString(isRtl ? 'ar-EG' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function daysRemaining(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}

// ── Currency Formatting ──
export function formatCurrency(amount: number, currency = 'EGP'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

