// ── Super Admin Shared Utilities ──
// §40-M4: the dead SUPER_ADMIN_NAV array and its NavItem/phosphor imports were
// removed — the live super-admin sidebar is built solely from
// src/components/layout/navConfig.ts (buildNavItems), and every nav target
// there has a mounted route in src/routes/index.tsx backed by a real endpoint.
import { formatDate as isoFormatDate, formatDateTime as isoFormatDateTime } from '../../utils/date';

/**
 * Unified translation helper — returns Arabic string if `isRtl` is true, else English.
 */
export function tr(isRtl: boolean, en: string, ar: string): string {
  return isRtl ? ar : en;
}

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

// ── Date Formatting (§34هـ: thin wrappers over the shared ISO helpers;
// the isRtl parameter is kept for call-site compatibility but ignored —
// dates are numeric YYYY-MM-DD in both languages) ──
export function formatDate(dateStr: string | null | undefined, _isRtl?: boolean): string {
  return isoFormatDate(dateStr);
}

export function formatDateTime(dateStr: string | null | undefined, _isRtl?: boolean): string {
  return isoFormatDateTime(dateStr);
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

