/**
 * Project-wide date/number formatting (§34هـ — owner directive 2026-10-13).
 *
 * Dates ALWAYS render as numeric ISO `YYYY-MM-DD` — never localized month
 * names (أكتوبر/Nov) and never Arabic-Indic digits (١٢٣), in either language.
 * Times render 24h numeric `HH:mm:ss`. Numbers use Western digits with
 * thousands separators (`en-US`).
 *
 * New UI must call these helpers instead of toLocaleDateString/toLocaleString
 * with an Arabic locale.
 */

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-07". Returns '-' for null/invalid. */
export function formatDate(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-11-07 14:35" (24h). Returns '-' for null/invalid. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '-';
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "14:35:08" (24h). Returns '-' for null/invalid. */
export function formatTime(value: string | number | Date | null | undefined, withSeconds = false): string {
  const d = toDate(value);
  if (!d) return '-';
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad(d.getSeconds())}` : base;
}

/** Whole days from today until `value` (negative = already past). null → null. */
export function daysUntil(value: string | number | Date | null | undefined): number | null {
  const d = toDate(value);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Western-digit grouped number ("1,234.5") regardless of browser locale. */
export function fmtNum(n: number | string | null | undefined, digits?: { min?: number; max?: number }): string {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return '0';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: digits?.min ?? 0,
    maximumFractionDigits: digits?.max ?? 2,
  });
}
