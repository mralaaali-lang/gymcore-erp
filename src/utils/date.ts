/**
 * Shared date formatting for list/table views (§34د).
 * Raw ISO strings must never reach the UI — everything renders localized
 * (ar-EG when the app language is Arabic, en-US otherwise).
 */

/** e.g. "١١ أكتوبر ٢٠٢٦" / "Oct 11, 2026". Returns '-' for null/invalid. */
export function formatDate(iso: string | null | undefined, rtl: boolean): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(rtl ? 'ar-EG' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Whole days from today until `iso` (negative = already past). null → null. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}
