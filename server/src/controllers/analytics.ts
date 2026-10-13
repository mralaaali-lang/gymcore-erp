import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

export async function getRetentionRate(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const result = await query(`
      WITH monthly_active AS (
        SELECT
          DATE_TRUNC('month', start_date) AS month,
          COUNT(DISTINCT member_id) AS new_members
        FROM member_subscriptions
        WHERE gym_id = $1 AND start_date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', start_date)
      ),
      monthly_renewals AS (
        SELECT
          DATE_TRUNC('month', s.start_date) AS month,
          COUNT(DISTINCT s.member_id) AS renewals
        FROM member_subscriptions s
        WHERE s.gym_id = $1 AND s.start_date >= CURRENT_DATE - INTERVAL '12 months'
          AND EXISTS (
            SELECT 1 FROM member_subscriptions s2
            WHERE s2.member_id = s.member_id AND s2.gym_id = s.gym_id
              AND s2.end_date = s.start_date - INTERVAL '1 day'
          )
        GROUP BY DATE_TRUNC('month', s.start_date)
      )
      SELECT
        COALESCE(ma.month, mr.month) AS month,
        COALESCE(ma.new_members, 0) AS new_members,
        COALESCE(mr.renewals, 0) AS renewals,
        CASE WHEN COALESCE(ma.new_members, 0) > 0
          THEN ROUND((COALESCE(mr.renewals, 0)::decimal / ma.new_members) * 100, 1)
          ELSE 0
        END AS retention_rate
      FROM monthly_active ma
      FULL JOIN monthly_renewals mr ON ma.month = mr.month
      ORDER BY month DESC
      LIMIT 12
    `, [gym_id]);
    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Retention query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPeakHours(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const result = await query(`
      SELECT
        EXTRACT(HOUR FROM check_in_time) AS hour,
        COUNT(*) AS check_ins,
        COUNT(DISTINCT member_id) AS unique_members
      FROM attendance_logs
      WHERE gym_id = $1 AND check_in_time >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY EXTRACT(HOUR FROM check_in_time)
      ORDER BY hour
    `, [gym_id]);
    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Peak hours query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getRevenueForecast(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const result = await query(`
      SELECT
        COUNT(*) AS active_subscriptions,
        COALESCE(SUM(ms.price_paid), 0) AS monthly_recurring_revenue,
        COUNT(*) FILTER (WHERE ms.end_date <= CURRENT_DATE + INTERVAL '7 days') AS renewing_next_7d,
        COUNT(*) FILTER (WHERE ms.end_date <= CURRENT_DATE + INTERVAL '30 days') AS renewing_next_30d,
        COALESCE(SUM(ms.price_paid) FILTER (WHERE ms.end_date <= CURRENT_DATE + INTERVAL '30 days'), 0) AS forecast_revenue_30d
      FROM member_subscriptions ms
      WHERE ms.gym_id = $1 AND ms.status = 'active'
    `, [gym_id]);
    res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    logger.error('Revenue forecast query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getEnrollmentTrend(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    // Two series for the dashboard chart (§24): new signups by start month
    // vs ended subscriptions (expired/cancelled/suspended) by end month.
    const result = await query(`
      WITH new_by_month AS (
        SELECT DATE_TRUNC('month', start_date) AS month, COUNT(*) AS new_members
        FROM member_subscriptions
        WHERE gym_id = $1 AND start_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', start_date)
      ),
      ended_by_month AS (
        SELECT DATE_TRUNC('month', end_date) AS month, COUNT(*) AS cancellations
        FROM member_subscriptions
        WHERE gym_id = $1 AND status IN ('expired','cancelled','suspended')
          AND end_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', end_date)
      )
      SELECT
        COALESCE(n.month, e.month) AS month,
        COALESCE(n.new_members, 0) AS new_members,
        COALESCE(e.cancellations, 0) AS cancellations
      FROM new_by_month n
      FULL JOIN ended_by_month e ON n.month = e.month
      ORDER BY month
    `, [gym_id]);
    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Enrollment trend query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getRevenueBreakdown(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const memberships = await query(`
      SELECT COALESCE(SUM(price_paid), 0) AS total
      FROM member_subscriptions
      WHERE gym_id = $1 AND status = 'active'
    `, [gym_id]);
    const pos = await query(`
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM pos_orders
      WHERE gym_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
    `, [gym_id]);
    // §32: real PT revenue — each COMPLETED session earns its package's
    // per-session price (total_price / session_count). Replaces the fabricated
    // "COUNT(*) * 50" estimate that had no basis in pt_packages pricing.
    const pt = await query(`
      SELECT COALESCE(SUM(pkg.total_price / NULLIF(pkg.session_count, 0)), 0) AS total
      FROM pt_sessions ps
      JOIN pt_packages pkg ON pkg.id = ps.package_id
      WHERE ps.gym_id = $1 AND ps.status = 'completed'
        AND ps.completed_at >= CURRENT_DATE - INTERVAL '30 days'
    `, [gym_id]);
    const aging = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN due_date >= CURRENT_DATE THEN remaining_amount ELSE 0 END), 0) AS current,
        COALESCE(SUM(CASE WHEN due_date BETWEEN CURRENT_DATE - INTERVAL '30 days' AND CURRENT_DATE - INTERVAL '1 day' THEN remaining_amount ELSE 0 END), 0) AS aging_1_30,
        COALESCE(SUM(CASE WHEN due_date BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '31 days' THEN remaining_amount ELSE 0 END), 0) AS aging_31_60,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '60 days' THEN remaining_amount ELSE 0 END), 0) AS aging_60_plus
      FROM member_debts WHERE gym_id = $1 AND status = 'active'
    `, [gym_id]);
    res.status(200).json({
      data: {
        memberships: Number(memberships.rows[0]?.total || 0),
        pos: Number(pos.rows[0]?.total || 0),
        personal_training: Number(pt.rows[0]?.total || 0),
        aging_receivables: aging.rows[0] || { current: 0, aging_1_30: 0, aging_31_60: 0, aging_60_plus: 0 },
      },
    });
  } catch (error) {
    logger.error('Revenue breakdown query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// §34أ — business money metrics for the admin dashboard:
// MRR (active subs normalised to a 30-day month), ARPU (MRR / active
// members), monthly churn % (subs that ended this month / subs active at
// month start), and net growth (new active subs this month - churned).
// Every figure is derived from member_subscriptions only — no estimates.
export async function getBusinessMetrics(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const result = await query(`
      WITH mrr AS (
        SELECT
          COALESCE(SUM(price_paid * 30.0 / GREATEST((end_date - start_date + 1)::numeric, 1)), 0) AS mrr,
          COUNT(DISTINCT member_id) AS active_members
        FROM member_subscriptions
        WHERE gym_id = $1 AND status = 'active' AND deleted_at IS NULL
      ),
      churned AS (
        SELECT COUNT(*) AS n
        FROM member_subscriptions
        WHERE gym_id = $1 AND deleted_at IS NULL
          AND status IN ('cancelled', 'expired')
          AND end_date >= date_trunc('month', CURRENT_DATE)::date
          AND end_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
      ),
      base AS (
        SELECT COUNT(*) AS n
        FROM member_subscriptions
        WHERE gym_id = $1 AND deleted_at IS NULL
          AND start_date <= date_trunc('month', CURRENT_DATE)::date
          AND end_date >= date_trunc('month', CURRENT_DATE)::date
      ),
      new_subs AS (
        SELECT COUNT(*) AS n
        FROM member_subscriptions
        WHERE gym_id = $1 AND deleted_at IS NULL AND status = 'active'
          AND start_date >= date_trunc('month', CURRENT_DATE)::date
      )
      SELECT mrr.mrr, mrr.active_members,
             churned.n AS churned_this_month,
             base.n AS active_at_month_start,
             new_subs.n AS new_this_month
      FROM mrr, churned, base, new_subs
    `, [gym_id]);
    const r = result.rows[0] || {};
    const mrr = Number(r.mrr || 0);
    const activeMembers = Number(r.active_members || 0);
    const churnedN = Number(r.churned_this_month || 0);
    const baseN = Number(r.active_at_month_start || 0);
    const newN = Number(r.new_this_month || 0);
    res.status(200).json({
      data: {
        mrr: Math.round(mrr * 100) / 100,
        // null = honest "no base to divide by" (the UI renders '—')
        arpu: activeMembers > 0 ? Math.round((mrr / activeMembers) * 100) / 100 : null,
        churn_rate_pct: baseN > 0 ? Math.round((churnedN / baseN) * 1000) / 10 : null,
        churned_this_month: churnedN,
        active_at_month_start: baseN,
        new_this_month: newN,
        net_growth: newN - churnedN,
        active_members: activeMembers,
      },
    });
  } catch (error) {
    logger.error('Business metrics query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}
