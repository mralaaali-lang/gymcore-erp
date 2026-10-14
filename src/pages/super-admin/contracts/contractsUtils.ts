import type { ContractCycle } from '../../../services/api';

/** §40 — أدوات مشتركة لعقود المنصة: تنسيق أرقام/عملات وألوان الحالات. */

export function fmtMoney(v: string | number | null | undefined, currency?: string | null): string {
  const n = Number(v ?? 0);
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${s} ${currency}` : s;
}

/** رسالة الخطأ الحقيقية من الـAPI (لا رسومات وهمية). */
export function apiError(error: unknown): string {
  const e = error as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error || 'Request failed.';
}

export const CYCLE_LABEL: Record<ContractCycle, { en: string; ar: string }> = {
  monthly: { en: 'Monthly', ar: 'شهري' },
  yearly: { en: 'Yearly', ar: 'سنوي' },
};

export function cycleLabel(cycle: string | null | undefined, isRtl: boolean): string {
  const c = CYCLE_LABEL[cycle as ContractCycle];
  if (!c) return '—';
  return isRtl ? c.ar : c.en;
}

export const CONTRACT_STATUS_CLASS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-200 text-gray-500',
};

export const INVOICE_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  paid: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-200 text-gray-500',
};

export function invoiceStatusLabel(status: string, isRtl: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    pending: { en: 'Pending', ar: 'معلّقة' },
    overdue: { en: 'Overdue', ar: 'متأخرة' },
    paid: { en: 'Paid', ar: 'مدفوعة' },
    cancelled: { en: 'Cancelled', ar: 'ملغاة' },
  };
  const m = map[status] || { en: status, ar: status };
  return isRtl ? m.ar : m.en;
}

/** تاريخ اليوم بصيغة YYYY-MM-DD (الأرقام غربية دائمًا). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const FIELD_CLASS =
  'bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2.5 w-full focus:ring-2 focus:ring-emerald-500/30 outline-none';
export const LABEL_CLASS = 'block text-xs font-semibold text-gray-500 mb-1.5';
export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-emerald-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed';
export const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:border-emerald-300 hover:text-emerald-600 transition-all disabled:opacity-50';
export const BTN_DANGER =
  'inline-flex items-center justify-center gap-1.5 bg-red-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed';
