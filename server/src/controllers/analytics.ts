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
    // §34ث (UTC): hours were extracted in the DB session timezone, so a 6 PM
    // Cairo check-in plotted as 16:00 and the "30 days" cut was UTC-midnight.
    // Bucket both by the GYM's configured timezone (gyms.timezone, default Cairo).
    const result = await query(`
      SELECT
        EXTRACT(HOUR FROM a.check_in_time AT TIME ZONE COALESCE(g.timezone, 'Africa/Cairo')) AS hour,
        COUNT(*) AS check_ins,
        COUNT(DISTINCT a.member_id) AS unique_members
      FROM attendance_logs a
      JOIN gyms g ON g.id = a.gym_id
      WHERE a.gym_id = $1 AND a.deleted_at IS NULL
        AND a.check_in_time >= ((CURRENT_TIMESTAMP AT TIME ZONE COALESCE(g.timezone, 'Africa/Cairo'))::date - 30)::timestamp
                                 AT TIME ZONE COALESCE(g.timezone, 'Africa/Cairo')
      GROUP BY EXTRACT(HOUR FROM a.check_in_time AT TIME ZONE COALESCE(g.timezone, 'Africa/Cairo'))
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

// §34ب — engagement metrics for the analytics page:
// visit rate (attendance_logs check-ins per active member, last 30 days —
// the unique daily index means one check-in per member per day) and class
// occupancy (confirmed class_bookings vs fitness_classes.capacity, last 30
// days + upcoming). Nulls are honest "no base" (no members / no classes).
export async function getEngagement(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const visits = await query(`
      SELECT
        COUNT(*) AS checkins_30d,
        COUNT(DISTINCT a.member_id) AS visiting_members_30d,
        (SELECT COUNT(DISTINCT member_id) FROM member_subscriptions
          WHERE gym_id = $1 AND status = 'active' AND deleted_at IS NULL) AS active_members
      FROM attendance_logs a
      WHERE a.gym_id = $1 AND a.deleted_at IS NULL
        AND a.check_in_time >= CURRENT_DATE - INTERVAL '30 days'
    `, [gym_id]);
    const classes = await query(`
      SELECT fc.id, fc.title, fc.start_time, fc.capacity,
             COUNT(cb.id)::int AS booked
      FROM fitness_classes fc
      LEFT JOIN class_bookings cb ON cb.class_id = fc.id AND cb.status = 'confirmed'
      WHERE fc.gym_id = $1 AND NOT fc.is_cancelled
        AND fc.start_time >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      GROUP BY fc.id
      ORDER BY fc.start_time DESC
      LIMIT 50
    `, [gym_id]);
    const v = visits.rows[0] || {};
    const checkins = Number(v.checkins_30d || 0);
    const activeMembers = Number(v.active_members || 0);
    const items = classes.rows.map((c) => ({
      id: c.id,
      title: c.title,
      start_time: c.start_time,
      capacity: Number(c.capacity),
      booked: Number(c.booked),
      occupancy_pct: c.capacity > 0 ? Math.round((Number(c.booked) / Number(c.capacity)) * 1000) / 10 : null,
    }));
    const withCap = items.filter((i) => i.occupancy_pct != null);
    res.status(200).json({
      data: {
        visits: {
          checkins_30d: checkins,
          visiting_members_30d: Number(v.visiting_members_30d || 0),
          active_members: activeMembers,
          // avg visits per active member over the last 30 days (null = no base)
          avg_per_member: activeMembers > 0 ? Math.round((checkins / activeMembers) * 10) / 10 : null,
        },
        classes: {
          count: items.length,
          avg_occupancy_pct: withCap.length > 0
            ? Math.round((withCap.reduce((s, i) => s + (i.occupancy_pct as number), 0) / withCap.length) * 10) / 10
            : null,
          items,
        },
      },
    });
  } catch (error) {
    logger.error('Engagement query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// §34ت — Marketing funnel on real contracts. gym_leads.status is the CURRENT state
// (no status-history table exists), so stages count "reached at least this step"
// along the lifecycle new → contacted → trial_booked → converted, and `lost`
// is reported separately rather than silently inflating the funnel.
// Series: daily new leads (source-filterable) + new members over the last 90 days.
export async function getMarketingFunnel(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const source = typeof req.query.source === 'string' && req.query.source && req.query.source !== 'all'
    ? req.query.source
    : null;
  try {
    const byStatus = await query(`
      SELECT status, COUNT(*)::int AS count
      FROM gym_leads
      WHERE gym_id = $1 AND ($2::text IS NULL OR source = $2)
      GROUP BY status
    `, [gym_id, source]);
    const m: Record<string, number> = {};
    for (const r of byStatus.rows) m[r.status] = Number(r.count);
    const total = Object.values(m).reduce((a, b) => a + b, 0);
    const lost = m.lost || 0;
    const converted = m.converted || 0;
    const reachedInterest = (m.contacted || 0) + (m.trial_booked || 0) + converted;
    const reachedDecision = (m.trial_booked || 0) + converted;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : null);

    const bySource = await query(`
      SELECT COALESCE(NULLIF(source, ''), 'unknown') AS source,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'converted')::int AS converted
      FROM gym_leads
      WHERE gym_id = $1
      GROUP BY 1
      ORDER BY total DESC
    `, [gym_id]);

    const series = await query(`
      WITH days AS (
        SELECT generate_series(CURRENT_DATE - 89, CURRENT_DATE, INTERVAL '1 day')::date AS d
      ),
      leads AS (
        SELECT created_at::date AS d, COUNT(*)::int AS c
        FROM gym_leads
        WHERE gym_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '89 days'
          AND ($2::text IS NULL OR source = $2)
        GROUP BY d
      ),
      signups AS (
        SELECT created_at::date AS d, COUNT(*)::int AS c
        FROM members
        WHERE gym_id = $1 AND deleted_at IS NULL
          AND created_at >= CURRENT_DATE - INTERVAL '89 days'
        GROUP BY d
      )
      SELECT to_char(days.d, 'YYYY-MM-DD') AS date,
             COALESCE(l.c, 0) AS leads,
             COALESCE(s.c, 0) AS signups
      FROM days
      LEFT JOIN leads l ON l.d = days.d
      LEFT JOIN signups s ON s.d = days.d
      ORDER BY days.d
    `, [gym_id, source]);

    res.status(200).json({
      data: {
        funnel: {
          total_leads: total,
          lost,
          conversion_pct: pct(converted),
          stages: [
            { key: 'leads', count: total, pct: pct(total) },
            { key: 'interest', count: reachedInterest, pct: pct(reachedInterest) },
            { key: 'decision', count: reachedDecision, pct: pct(reachedDecision) },
            { key: 'converted', count: converted, pct: pct(converted) },
          ],
        },
        by_source: bySource.rows,
        series: series.rows,
      },
    });
  } catch (error) {
    logger.error('Marketing funnel query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// §40-M5 — Real staff-scoped referrals for the gym marketing page.
// marketing_referrals carries referrer_gym_id (migration 045), so a gym only
// ever sees its own referral rows; names resolve against members/member_profiles.
// This replaces the frontend's bare '/marketing/referrals' call, which pointed at
// a path nginx never proxies (the page received index.html as "JSON").
export async function getGymReferrals(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const result = await query(`
      SELECT r.id, r.referral_code, r.reward_amount, r.reward_status, r.status, r.created_at,
             ref_m.full_name  AS referrer_name,
             mem.full_name    AS referred_name
      FROM marketing_referrals r
      LEFT JOIN members ref_m ON ref_m.id = r.referrer_member_id
      LEFT JOIN members mem   ON mem.id = r.referred_member_id
      WHERE r.referrer_gym_id = $1
      ORDER BY r.created_at DESC
      LIMIT 100
    `, [gym_id]);
    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Gym referrals query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}
