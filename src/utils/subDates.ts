import { formatDate } from './date';

/** "2026-10-13" — local today in the project's ISO format (§34هـ). */
export function todayIso(): string {
  return formatDate(new Date());
}

/** Add whole days to a YYYY-MM-DD date (noon-pinned to dodge DST drift).
 *  Accepts ISO timestamps too (pg DATE columns serialize as `…T00:00:00.000Z`). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}
