import { Request, Response } from 'express';
import { query } from '../config/database';
import { closeStaleSessions } from './attendance';
import logger from '../config/logger';

// Manager dashboard "needs your action" feeds (§24). All read-only, all
// tenant-scoped via req.staff.gym_id + RLS, all requireRole('manager').
// days query param is clamped to sane bounds instead of validated by Zod to
// keep these one-off dashboard widgets light.

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * GET /api/dashboard/expiring-soon?days=7
 * Active subscriptions ending within N days (already-late ones included),
 * oldest expiry first — the #1 renewal-revenue task for a gym owner.
 */
export const getExpiringSoon = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const days = clampInt(req.query.days, 7, 1, 60);
  try {
    const result = await query(
      `SELECT ms.member_id, m.full_name AS member_name, ms.end_date,
              (ms.end_date - CURRENT_DATE) AS days_left, ms.price_paid
       FROM member_subscriptions ms
       JOIN members m ON m.id = ms.member_id
       WHERE ms.gym_id = $1 AND ms.status = 'active' AND ms.deleted_at IS NULL
         AND m.deleted_at IS NULL
         AND ms.end_date <= CURRENT_DATE + ($2 || ' days')::interval
       ORDER BY ms.end_date ASC
       LIMIT 20`,
      [gym_id, days]
    );
    res.json({ data: result.rows, total: result.rows.length, days });
  } catch (error) {
    logger.error('expiring-soon query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/dashboard/inactive-members?days=14
 * Members on active subscriptions with no check-in for N+ days — churn risk
 * the owner should call before the subscription quietly expires.
 */
export const getInactiveMembers = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const days = clampInt(req.query.days, 14, 3, 90);
  try {
    const result = await query(
      `SELECT ms.member_id, m.full_name AS member_name,
              last.last_check_in,
              CURRENT_DATE - DATE(COALESCE(last.last_check_in, ms.start_date)) AS days_since
       FROM member_subscriptions ms
       JOIN members m ON m.id = ms.member_id
       LEFT JOIN LATERAL (
         SELECT MAX(al.check_in_time) AS last_check_in
         FROM attendance_logs al
         WHERE al.gym_id = ms.gym_id AND al.member_id = ms.member_id AND al.deleted_at IS NULL
       ) last ON TRUE
       WHERE ms.gym_id = $1 AND ms.status = 'active' AND ms.deleted_at IS NULL
         AND m.deleted_at IS NULL
         AND COALESCE(last.last_check_in, ms.start_date::timestamptz)
             < CURRENT_DATE - ($2 || ' days')::interval
       ORDER BY days_since DESC
       LIMIT 20`,
      [gym_id, days]
    );
    res.json({ data: result.rows, total: result.rows.length, days });
  } catch (error) {
    logger.error('inactive-members query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/dashboard/overdue-debts
 * Active member debts past their due date — replaces the dashboard's static
 * empty card (the real list lived only behind the platform 403 report).
 */
export const getOverdueDebts = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  try {
    const result = await query(
      `SELECT d.id, d.member_id, m.full_name AS member_name,
              d.remaining_amount, d.due_date,
              (CURRENT_DATE - d.due_date) AS days_overdue
       FROM member_debts d
       JOIN members m ON m.id = d.member_id
       WHERE d.gym_id = $1 AND d.status = 'active'
         AND m.deleted_at IS NULL
         AND d.due_date < CURRENT_DATE
       ORDER BY days_overdue DESC
       LIMIT 20`,
      [gym_id]
    );
    const sum = await query(
      `SELECT COALESCE(SUM(remaining_amount), 0) AS total_overdue
       FROM member_debts
       WHERE gym_id = $1 AND status = 'active' AND due_date < CURRENT_DATE`,
      [gym_id]
    );
    res.json({ data: result.rows, total_amount: Number(sum.rows[0].total_overdue) });
  } catch (error) {
    logger.error('overdue-debts query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/nav/badges
 * §35أ — the four live sidebar badges in one cheap read-only call, all
 * tenant-scoped and all backed by real data (no invented numbers):
 *  - attendance: members physically present right now (open sessions, after
 *    the §34ح lazy-close so forgotten check-outs never inflate it)
 *  - payments:  active member debts still owed (member_debts.status='active')
 *  - alerts:    active subscriptions expiring within 7 days (same predicate
 *    as /dashboard/expiring-soon?days=7, just counted instead of listed)
 *  - messages:  unread platform notifications addressed to this staff role
 *    (or 'all'), same audience rule as /api/notifications
 * Polled lightly by the frontend layout; a failing badge degrades to 0 for
 * that key rather than dropping the whole response.
 */
export const getNavBadges = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const role = req.staff?.role;
  const counts = { attendance: 0, payments: 0, alerts: 0, messages: 0 };
  const badge = async (key: keyof typeof counts, sql: string, params: unknown[]): Promise<void> => {
    try {
      const r = await query(sql, params);
      counts[key] = Number(r.rows[0]?.count ?? 0);
    } catch (error) {
      logger.error(`nav-badge ${key} query failed`, { error: (error as Error).message });
    }
  };
  try {
    await closeStaleSessions(gym_id);
  } catch (error) {
    logger.error('nav-badges stale-session close failed', { error: (error as Error).message });
  }
  await Promise.all([
    badge('attendance',
      `SELECT COUNT(*)::int AS count FROM attendance_logs
       WHERE gym_id = $1 AND check_out_time IS NULL AND deleted_at IS NULL`,
      [gym_id]),
    badge('payments',
      `SELECT COUNT(*)::int AS count FROM member_debts
       WHERE gym_id = $1 AND status = 'active'`,
      [gym_id]),
    badge('alerts',
      `SELECT COUNT(*)::int AS count FROM member_subscriptions ms
       JOIN members m ON m.id = ms.member_id
       WHERE ms.gym_id = $1 AND ms.status = 'active' AND ms.deleted_at IS NULL
         AND m.deleted_at IS NULL
         AND ms.end_date <= CURRENT_DATE + INTERVAL '7 days'`,
      [gym_id]),
    badge('messages',
      `SELECT COUNT(*)::int AS count FROM platform_notifications
       WHERE gym_id = $1 AND read_at IS NULL
         AND (recipient_role = $2 OR recipient_role = 'all')`,
      [gym_id, role]),
  ]);
  res.json({ data: counts });
};
