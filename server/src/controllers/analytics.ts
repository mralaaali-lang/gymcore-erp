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
    const result = await query(`
      SELECT
        DATE_TRUNC('month', start_date) AS month,
        COUNT(*) AS new_members
      FROM member_subscriptions
      WHERE gym_id = $1 AND start_date >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', start_date)
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
    const pt = await query(`
      SELECT COALESCE(COUNT(DISTINCT s.id) * 50, 0) AS estimated
      FROM pt_sessions ps
      JOIN member_subscriptions s ON s.member_id = ps.member_id AND s.gym_id = ps.gym_id
      WHERE ps.gym_id = $1 AND ps.scheduled_at >= CURRENT_DATE - INTERVAL '30 days'
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
        personal_training: Number(pt.rows[0]?.estimated || 0),
        aging_receivables: aging.rows[0] || { current: 0, aging_1_30: 0, aging_31_60: 0, aging_60_plus: 0 },
      },
    });
  } catch (error) {
    logger.error('Revenue breakdown query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}
