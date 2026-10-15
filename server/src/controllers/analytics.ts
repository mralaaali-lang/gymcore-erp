import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';
import { closeStaleSessions } from './attendance';

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
// ever sees its own referral rows; names resolve against members
// (member_profiles was dropped by migration 044).
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

// ====================================================================
// GET /api/reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
// Aggregated gym-admin reports dashboard. EVERY figure (cards, charts,
// top-5) is scoped to the same gym-local date range. Default: first of
// this month → today.
//
// Unpaid dues here are remaining_amount of debts CREATED inside the
// filter window — not the gym's total outstanding book (member_debts
// remaining where status=active). Those two numbers will disagree on
// purpose when older debts still sit on the books.
// ====================================================================
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getReportsOverview(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const tzRow = await query(
      `SELECT COALESCE(timezone, 'Africa/Cairo') AS tz,
              to_char((CURRENT_TIMESTAMP AT TIME ZONE COALESCE(timezone, 'Africa/Cairo'))::date, 'YYYY-MM-DD') AS today,
              to_char(date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(timezone, 'Africa/Cairo'))::timestamp)::date, 'YYYY-MM-DD') AS month_start
       FROM gyms WHERE id = $1`,
      [gym_id],
    );
    const tz: string = tzRow.rows[0]?.tz || 'Africa/Cairo';
    const today: string = ISO_DATE.test(String(tzRow.rows[0]?.today || ''))
      ? String(tzRow.rows[0].today)
      : new Date().toISOString().slice(0, 10);
    const monthStart: string = ISO_DATE.test(String(tzRow.rows[0]?.month_start || ''))
      ? String(tzRow.rows[0].month_start)
      : `${today.slice(0, 8)}01`;

    let from = ISO_DATE.test(String(req.query.from || '')) ? String(req.query.from) : monthStart;
    let to = ISO_DATE.test(String(req.query.to || '')) ? String(req.query.to) : today;
    if (from > to) {
      const swap = from;
      from = to;
      to = swap;
    }
    // Cap at 366 days so generate_series cannot balloon.
    if (addDaysIso(from, 366) < to) to = addDaysIso(from, 366);

    const rangeStart = `( $2::date )::timestamp AT TIME ZONE $3`;
    const rangeEnd = `( $4::date + 1 )::timestamp AT TIME ZONE $3`;

    const [
      members, subs, attendance, unpaid, outstanding, money, daily, packs, top,
    ] = await Promise.all([
      query(
        `SELECT
           COUNT(DISTINCT m.id) FILTER (
             WHERE ms.status = 'active' AND m.is_blacklisted = false
               AND ms.start_date <= $4::date AND ms.end_date >= $2::date
           )::int AS active_members,
           COUNT(DISTINCT m.id) FILTER (
             WHERE m.created_at >= ${rangeStart} AND m.created_at < ${rangeEnd}
           )::int AS new_members
         FROM members m
         LEFT JOIN member_subscriptions ms
           ON ms.member_id = m.id AND ms.gym_id = m.gym_id AND ms.deleted_at IS NULL
         WHERE m.gym_id = $1 AND m.deleted_at IS NULL`,
        [gym_id, from, tz, to],
      ),
      query(
        `SELECT COUNT(*)::int AS active_subscriptions
         FROM member_subscriptions
         WHERE gym_id = $1 AND deleted_at IS NULL AND status = 'active'
           AND start_date <= $3::date AND end_date >= $2::date`,
        [gym_id, from, to],
      ),
      query(
        `SELECT COUNT(*)::int AS total
         FROM attendance_logs a
         WHERE a.gym_id = $1 AND a.deleted_at IS NULL
           AND a.check_in_time >= ${rangeStart} AND a.check_in_time < ${rangeEnd}`,
        [gym_id, from, tz, to],
      ),
      // Period unpaid = remaining of debts *created* in the window.
      query(
        `SELECT COALESCE(SUM(remaining_amount), 0) AS total
         FROM member_debts
         WHERE gym_id = $1 AND status = 'active'
           AND created_at >= ${rangeStart} AND created_at < ${rangeEnd}`,
        [gym_id, from, tz, to],
      ),
      query(
        `SELECT COALESCE(SUM(remaining_amount), 0) AS total
         FROM member_debts WHERE gym_id = $1 AND status = 'active'`,
        [gym_id],
      ),
      query(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE type = 'payment'), 0) AS revenue,
           COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS expenses
         FROM financial_transactions
         WHERE gym_id = $1
           AND created_at >= ${rangeStart} AND created_at < ${rangeEnd}`,
        [gym_id, from, tz, to],
      ),
      query(
        `WITH days AS (
           SELECT generate_series($2::date, $4::date, INTERVAL '1 day')::date AS d
         ),
         rev AS (
           SELECT (ft.created_at AT TIME ZONE $3)::date AS d,
                  SUM(ft.amount) AS amount
           FROM financial_transactions ft
           WHERE ft.gym_id = $1 AND ft.type = 'payment'
             AND ft.created_at >= ${rangeStart} AND ft.created_at < ${rangeEnd}
           GROUP BY 1
         )
         SELECT to_char(days.d, 'YYYY-MM-DD') AS date,
                COALESCE(rev.amount, 0) AS amount
         FROM days
         LEFT JOIN rev ON rev.d = days.d
         ORDER BY days.d`,
        [gym_id, from, tz, to],
      ),
      query(
        `SELECT
           CASE
             WHEN o.duration_days <= 7 THEN 'session'
             WHEN o.duration_days <= 45 THEN 'monthly'
             WHEN o.duration_days >= 300 THEN 'yearly'
             ELSE 'other'
           END AS bucket,
           COUNT(*)::int AS count
         FROM member_subscriptions ms
         JOIN membership_offers o ON o.id = ms.offer_id
         WHERE ms.gym_id = $1 AND ms.deleted_at IS NULL
           AND ms.status <> 'cancelled'
           AND ms.start_date <= $3::date AND ms.end_date >= $2::date
         GROUP BY 1`,
        [gym_id, from, to],
      ),
      query(
        `SELECT m.id AS member_id, m.full_name, m.card_code,
                COUNT(*)::int AS visits
         FROM attendance_logs a
         JOIN members m ON m.id = a.member_id
         WHERE a.gym_id = $1 AND a.deleted_at IS NULL AND m.deleted_at IS NULL
           AND a.check_in_time >= ${rangeStart} AND a.check_in_time < ${rangeEnd}
         GROUP BY m.id, m.full_name, m.card_code
         ORDER BY visits DESC, m.full_name ASC
         LIMIT 5`,
        [gym_id, from, tz, to],
      ),
    ]);

    const days = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
    const attendanceTotal = Number(attendance.rows[0]?.total || 0);
    const revenue = Number(money.rows[0]?.revenue || 0);
    const expenses = Number(money.rows[0]?.expenses || 0);

    res.status(200).json({
      data: {
        from,
        to,
        timezone: tz,
        days,
        kpis: {
          active_members: Number(members.rows[0]?.active_members || 0),
          new_members: Number(members.rows[0]?.new_members || 0),
          active_subscriptions: Number(subs.rows[0]?.active_subscriptions || 0),
          attendance_total: attendanceTotal,
          attendance_daily_avg: days > 0 ? Math.round((attendanceTotal / days) * 10) / 10 : 0,
          unpaid_period: Number(unpaid.rows[0]?.total || 0),
          outstanding_total: Number(outstanding.rows[0]?.total || 0),
          revenue,
          expenses,
          net_profit: Math.round((revenue - expenses) * 100) / 100,
        },
        daily_revenue: daily.rows.map((r) => ({ date: r.date, amount: Number(r.amount || 0) })),
        packages: packs.rows.map((r) => ({ key: r.bucket as string, count: Number(r.count || 0) })),
        top_attendance: top.rows.map((r) => ({
          member_id: r.member_id,
          full_name: r.full_name,
          card_code: r.card_code,
          visits: Number(r.visits || 0),
        })),
      },
    });
  } catch (error) {
    logger.error('Reports overview query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// === تقرير الأعضاء: قائمة + تجميعات بفلاتر صارمة ===
// Returns rows (code/name/phone/gender/subs/visits/end/status) for the
// /admin/reports/members screen. Validation is mandatory: unknown filter
// values are rejected (400), never silently ignored.
// - status: active = has active sub | suspended = latest sub suspended |
//   blacklisted = is_blacklisted (expired/others only under «all»)
// - subscription: active = has ANY active sub | none = no active sub
// - subs_count: non-deleted, non-cancelled subscriptions (the honest history)
// - visits: all-time attendance logs (no date scope on this screen)
// - active_end_date: latest ACTIVE sub end (null when none)
export async function getMembersReport(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const statusQ = String(req.query.status || 'all');
  const genderQ = String(req.query.gender || 'all');
  const subsQ = String(req.query.subscription || 'all');
  const rawLimit = parseInt(req.query.limit as string, 10) || 10;
  const limit = [10, 50, 100, 300].includes(rawLimit) ? rawLimit : 10;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const offset = (page - 1) * limit;
  // ترتيب بقائمة بيضاء (نفس نمط جدول المشتركين): الاسم/الانتهاء/الحضور/الاشتراكات.
  const SORTS: Record<string, string> = {
    member_name: 'm.full_name',
    active_end_date: 'active_end_date',
    visits: 'visits',
    subs_count: 'subs_count',
  };
  const rawSort = String(req.query.sort || 'member_name');
  const sortKey = Object.keys(SORTS).includes(rawSort) ? rawSort : 'member_name';
  const dir = String(req.query.order) === 'desc' ? 'DESC' : 'ASC';
  if (!['all', 'active', 'suspended', 'blacklisted'].includes(statusQ)) {
    res.status(400).json({ error: 'Invalid status filter.' });
    return;
  }
  if (!['all', 'male', 'female'].includes(genderQ)) {
    res.status(400).json({ error: 'Invalid gender filter.' });
    return;
  }
  if (!['all', 'active', 'none'].includes(subsQ)) {
    res.status(400).json({ error: 'Invalid subscription filter.' });
    return;
  }
  try {
    const hasActive = `EXISTS (SELECT 1 FROM member_subscriptions ms
      WHERE ms.member_id = m.id AND ms.gym_id = m.gym_id AND ms.deleted_at IS NULL
        AND ms.status = 'active' AND ms.end_date >= CURRENT_DATE)`;
    const latestStatus = `(SELECT ms.status FROM member_subscriptions ms
      WHERE ms.member_id = m.id AND ms.gym_id = m.gym_id AND ms.deleted_at IS NULL
      ORDER BY ms.created_at DESC LIMIT 1)`;
    const clauses = ['m.gym_id = $1', 'm.deleted_at IS NULL'];
    const params: unknown[] = [gym_id];
    if (statusQ === 'blacklisted') clauses.push('m.is_blacklisted = true');
    else if (statusQ === 'active') clauses.push(`${hasActive}`);
    else if (statusQ === 'suspended') clauses.push(`${latestStatus} = 'suspended'`);
    if (genderQ !== 'all') { params.push(genderQ); clauses.push(`m.gender = $${params.length}`); }
    if (subsQ === 'active') clauses.push(`${hasActive}`);
    else if (subsQ === 'none') clauses.push(`NOT (${hasActive})`);
    const where = clauses.join(' AND ');

    const rows = await query(
      `SELECT m.id, m.full_name, m.card_code,
              decrypt_sensitive(m.phone_encrypted) AS phone_number,
              m.gender,
              (SELECT COUNT(*)::int FROM member_subscriptions ms
                WHERE ms.member_id = m.id AND ms.gym_id = m.gym_id
                  AND ms.deleted_at IS NULL AND ms.status <> 'cancelled') AS subs_count,
              (SELECT COUNT(*)::int FROM attendance_logs al
                WHERE al.member_id = m.id AND al.gym_id = m.gym_id AND al.deleted_at IS NULL) AS visits,
              (SELECT ms.end_date FROM member_subscriptions ms
                WHERE ms.member_id = m.id AND ms.gym_id = m.gym_id AND ms.deleted_at IS NULL
                  AND ms.status = 'active' AND ms.end_date >= CURRENT_DATE
                ORDER BY ms.end_date DESC LIMIT 1) AS active_end_date,
              m.is_blacklisted
       FROM members m
       WHERE ${where}
       ORDER BY ${SORTS[sortKey]} ${dir} NULLS LAST, m.full_name ASC
       LIMIT ${limit} OFFSET ${offset}`,
      params);
    const totalRes = await query(
      `SELECT COUNT(*)::int AS total FROM members m WHERE ${where}`,
      params);
    const agg = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE m.gender = 'male')::int AS males,
              COUNT(*) FILTER (WHERE m.gender = 'female')::int AS females,
              COUNT(*) FILTER (WHERE ${hasActive})::int AS with_active
       FROM members m
       WHERE ${where}`,
      params);
    const a = agg.rows[0] || {};
    const total = Number(totalRes.rows[0]?.total || 0);
    res.json({
      data: rows.rows,
      pagination: {
        page, limit, total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
      stats: {
        total: Number(a.total || 0),
        males: Number(a.males || 0),
        females: Number(a.females || 0),
        with_active: Number(a.with_active || 0),
      },
    });
  } catch (error) {
    logger.error('Members report query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// === تقرير الحضور: 4 طبقات (كروت → ترند يومي → أيام الذروة → توزيع ساعات → السجل) ===
// كله من attendance_logs بنفس نطاق الفلتر وبعملة الصالة الزمنية. السجل مدعوم
// بترقيم وترتيب (نفس إعدادات جدول المشتركين): الوقت/العضو، 10/50/100/300.
export async function getAttendanceReport(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const tzRow = await query(
      `SELECT COALESCE(timezone, 'Africa/Cairo') AS tz FROM gyms WHERE id = $1`,
      [gym_id],
    );
    const tz: string = tzRow.rows[0]?.tz || 'Africa/Cairo';
    const today: string = new Date().toISOString().slice(0, 10);
    let from = ISO_DATE.test(String(req.query.from || '')) ? String(req.query.from) : `${today.slice(0, 8)}01`;
    let to = ISO_DATE.test(String(req.query.to || '')) ? String(req.query.to) : today;
    if (from > to) { const s = from; from = to; to = s; }
    if (addDaysIso(from, 366) < to) to = addDaysIso(from, 366);

    const rangeStart = `( $2::date )::timestamp AT TIME ZONE $3`;
    const rangeEnd = `( $4::date + 1 )::timestamp AT TIME ZONE $3`;
    const logWhere = `a.gym_id = $1 AND a.deleted_at IS NULL
      AND a.check_in_time >= ${rangeStart} AND a.check_in_time < ${rangeEnd}`;

    // إغلاق كسول أولًا حتى لا يُضخّم «متواجدون الآن» بجلسات منسية.
    await closeStaleSessions(gym_id);

    const rawLimit = parseInt(req.query.limit as string, 10) || 10;
    const limit = [10, 50, 100, 300].includes(rawLimit) ? rawLimit : 10;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const offset = (page - 1) * limit;
    const rawSort = String(req.query.sort || 'time');
    const sortKey = ['time', 'member'].includes(rawSort) ? rawSort : 'time';
    const dir = String(req.query.order) === 'asc' ? 'ASC' : 'DESC';
    const orderBy = sortKey === 'member'
      ? `m.full_name ${dir}, a.check_in_time DESC`
      : `a.check_in_time ${dir}`;

    const [kpis, daily, hours, totalRes, rows] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS total,
                COUNT(DISTINCT a.member_id)::int AS unique_members
         FROM attendance_logs a
         WHERE ${logWhere}`,
        [gym_id, from, tz, to],
      ),
      query(
        `WITH days AS (
           SELECT generate_series($2::date, $4::date, INTERVAL '1 day')::date AS d
         ),
         grp AS (
           SELECT (a.check_in_time AT TIME ZONE $3)::date AS d,
                  COUNT(*)::int AS count
           FROM attendance_logs a
           WHERE ${logWhere}
           GROUP BY 1
         )
         SELECT to_char(days.d, 'YYYY-MM-DD') AS date,
                COALESCE(grp.count, 0) AS count
         FROM days LEFT JOIN grp ON grp.d = days.d
         ORDER BY days.d`,
        [gym_id, from, tz, to],
      ),
      query(
        `SELECT EXTRACT(HOUR FROM a.check_in_time AT TIME ZONE $3)::int AS hour,
                COUNT(*)::int AS count
         FROM attendance_logs a
         WHERE ${logWhere}
         GROUP BY 1
         ORDER BY 1`,
        [gym_id, from, tz, to],
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM attendance_logs a WHERE ${logWhere}`,
        [gym_id, from, tz, to],
      ),
      query(
        `SELECT a.check_in_time, a.check_out_time, m.full_name, m.card_code,
                CASE WHEN a.check_out_time IS NOT NULL
                     THEN EXTRACT(EPOCH FROM (a.check_out_time - a.check_in_time)) / 60
                     ELSE NULL END AS duration_min
         FROM attendance_logs a
         JOIN members m ON m.id = a.member_id
         WHERE ${logWhere}
         ORDER BY ${orderBy}
         LIMIT ${limit} OFFSET ${offset}`,
        [gym_id, from, tz, to],
      ),
    ]);
    const present = await query(
      `SELECT COUNT(*)::int AS count FROM attendance_logs
       WHERE gym_id = $1 AND check_out_time IS NULL AND deleted_at IS NULL`,
      [gym_id],
    );
    const days = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
    const total = Number(kpis.rows[0]?.total || 0);
    res.json({
      data: {
        from, to, timezone: tz, days,
        kpis: {
          total,
          unique_members: Number(kpis.rows[0]?.unique_members || 0),
          daily_avg: days > 0 ? Math.round((total / days) * 10) / 10 : 0,
          present_now: Number(present.rows[0]?.count || 0),
        },
        daily: daily.rows.map((r) => ({ date: r.date, count: Number(r.count || 0) })),
        hours: hours.rows.map((r) => ({ hour: Number(r.hour), count: Number(r.count || 0) })),
        log: {
          rows: rows.rows.map((r) => ({
            check_in_time: r.check_in_time,
            check_out_time: r.check_out_time,
            full_name: r.full_name,
            card_code: r.card_code,
            duration_min: r.duration_min == null ? null : Math.round(Number(r.duration_min)),
          })),
          pagination: {
            page, limit,
            total: Number(totalRes.rows[0]?.total || 0),
            total_pages: Math.max(1, Math.ceil(Number(totalRes.rows[0]?.total || 0) / limit)),
          },
        },
      },
    });
  } catch (error) {
    logger.error('Attendance report query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// === تقرير الاشتراكات: قائمة + تجميعات بفلاتر صارمة ===
// نفس تعريفات صفحة الاشتراكات (active/ending_soon/expired/suspended) +
// فلتر «التاريخ حسب» (تسجيل/بداية/انتهاء) يحدد العمود الذي يقع عليه النطاق.
// توحيد منطق الدفع مع الديون: المتبقي = ديون الاشتراكات المفتوحة المرتبطة
// بهذه الصفوف (member_debts.status='active') لا فرق السعر لحظيًا —
// الدفعات اللاحقة تُنقص الدين لا price_paid، فالدين هو الحقيقة الحية.
export async function getSubscriptionsReport(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const statusQ = String(req.query.status || 'all');
  const offerQ = String(req.query.offer_id || '');
  const dateFieldQ = String(req.query.date_field || 'start');
  const fromQ = String(req.query.from || '');
  const toQ = String(req.query.to || '');
  const rawLimit = parseInt(req.query.limit as string, 10) || 10;
  const limit = [10, 50, 100, 300].includes(rawLimit) ? rawLimit : 10;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const offset = (page - 1) * limit;
  if (!['all', 'active', 'ending_soon', 'expired', 'suspended'].includes(statusQ)) {
    res.status(400).json({ error: 'Invalid status filter.' });
    return;
  }
  if (offerQ && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offerQ)) {
    res.status(400).json({ error: 'Invalid offer id.' });
    return;
  }
  if (!['registered', 'start', 'end'].includes(dateFieldQ)) {
    res.status(400).json({ error: 'Invalid date field.' });
    return;
  }
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromQ) ? fromQ : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toQ) ? toQ : null;
  try {
    const tzRow = await query(
      `SELECT COALESCE(timezone, 'Africa/Cairo') AS tz FROM gyms WHERE id = $1`,
      [gym_id],
    );
    const tz: string = tzRow.rows[0]?.tz || 'Africa/Cairo';

    const clauses = ['s.gym_id = $1', 's.deleted_at IS NULL'];
    const params: unknown[] = [gym_id];
    let dateCol: string;
    if (dateFieldQ === 'registered') {
      params.push(tz);
      dateCol = `(s.created_at AT TIME ZONE ($${params.length}::text))::date`;
    } else {
      dateCol = dateFieldQ === 'end' ? 's.end_date' : 's.start_date';
    }
    if (statusQ === 'active') clauses.push(`s.status = 'active' AND s.end_date >= CURRENT_DATE`);
    else if (statusQ === 'ending_soon') clauses.push(`s.status = 'active' AND s.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`);
    else if (statusQ === 'expired') clauses.push(`(s.status = 'expired' OR (s.status = 'active' AND s.end_date < CURRENT_DATE))`);
    else if (statusQ === 'suspended') clauses.push(`s.status = 'suspended'`);
    if (offerQ) { params.push(offerQ); clauses.push(`s.offer_id = $${params.length}`); }
    if (from) { params.push(from); clauses.push(`${dateCol} >= $${params.length}::date`); }
    if (to) { params.push(to); clauses.push(`${dateCol} <= $${params.length}::date`); }
    const where = clauses.join(' AND ');

    const SORTS: Record<string, string> = {
      member_name: 'm.full_name',
      end_date: 's.end_date',
      amount: 'o.price',
    };
    const rawSort = String(req.query.sort || 'end_date');
    const sortKey = Object.keys(SORTS).includes(rawSort) ? rawSort : 'end_date';
    const dir = String(req.query.order) === 'desc' ? 'DESC' : 'ASC';

    const rows = await query(
      `SELECT s.id, m.full_name AS member_name, m.card_code,
              decrypt_sensitive(m.phone_encrypted) AS phone_number,
              o.title AS offer_title, s.start_date, s.end_date,
              o.price AS price, s.price_paid, s.status
       FROM member_subscriptions s
       JOIN members m ON m.id = s.member_id
       JOIN membership_offers o ON o.id = s.offer_id
       WHERE ${where}
       ORDER BY ${SORTS[sortKey]} ${dir} NULLS LAST, s.start_date DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params);
    const totalRes = await query(
      `SELECT COUNT(*)::int AS total FROM member_subscriptions s WHERE ${where}`,
      params);
    const stats = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE s.price_paid >= o.price)::int AS full_paid,
              COUNT(*) FILTER (WHERE s.price_paid < o.price)::int AS partial,
              COALESCE(SUM(d.remaining_amount) FILTER (WHERE d.status = 'active'), 0) AS remaining
       FROM member_subscriptions s
       JOIN membership_offers o ON o.id = s.offer_id
       LEFT JOIN member_debts d ON d.subscription_id = s.id AND d.status = 'active'
       WHERE ${where}`,
      params);
    const st = stats.rows[0] || {};
    const total = Number(totalRes.rows[0]?.total || 0);
    res.json({
      data: rows.rows.map((r) => ({
        ...r,
        price: Number(r.price || 0),
        price_paid: Number(r.price_paid || 0),
      })),
      pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
      stats: {
        total: Number(st.total || 0),
        full_paid: Number(st.full_paid || 0),
        partial: Number(st.partial || 0),
        remaining: Number(st.remaining || 0),
      },
    });
  } catch (error) {
    logger.error('Subscriptions report query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// === الأعضاء الغائبون: قائمة إنقاذ مرتبة بالأخطر أولًا ===
// الغياب = أيام منذ آخر حضور (ومن تاريخ الانضمام لمن لم يحضر قط) —
// وليس منذ انتهاء الاشتراك (تعريفان مختلفان). المحظورون خارج القائمة
// (لا حملة استرداد لمحظور). التقسيم محكم: ≤7 / 8-30 / 30+ (المجموع = الكل).
export async function getAbsentReport(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const daysMin = Math.max(0, parseInt(req.query.days_min as string, 10) || 15);
  const rawLimit = parseInt(req.query.limit as string, 10) || 10;
  const limit = [10, 50, 100, 300].includes(rawLimit) ? rawLimit : 10;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const offset = (page - 1) * limit;
  const rawSort = String(req.query.sort || 'absence');
  const sortKey = ['absence', 'member_name'].includes(rawSort) ? rawSort : 'absence';
  const dir = String(req.query.order) === 'asc' ? 'ASC' : 'DESC';
  try {
    const base = `
      SELECT m.id, m.full_name, m.card_code,
             decrypt_sensitive(m.phone_encrypted) AS phone_number,
             o.title AS plan_name,
             ls.end_date AS sub_end,
             EXISTS (SELECT 1 FROM member_subscriptions ms
               WHERE ms.member_id = m.id AND ms.gym_id = m.gym_id
                 AND ms.deleted_at IS NULL AND ms.status = 'active'
                 AND ms.end_date >= CURRENT_DATE) AS has_active,
             lv.last_in AS last_visit,
             (CURRENT_DATE - COALESCE((lv.last_in)::date, (m.created_at)::date))::int AS days_absent
      FROM members m
      LEFT JOIN LATERAL (
        SELECT MAX(al.check_in_time) AS last_in
        FROM attendance_logs al
        WHERE al.member_id = m.id AND al.gym_id = m.gym_id AND al.deleted_at IS NULL
      ) lv ON TRUE
      LEFT JOIN LATERAL (
        SELECT end_date FROM member_subscriptions ms
        WHERE ms.member_id = m.id AND ms.gym_id = m.gym_id AND ms.deleted_at IS NULL
        ORDER BY ms.created_at DESC LIMIT 1
      ) ls ON TRUE
      LEFT JOIN LATERAL (
        SELECT o.title FROM member_subscriptions ms
        JOIN membership_offers o ON o.id = ms.offer_id
        WHERE ms.member_id = m.id AND ms.gym_id = m.gym_id AND ms.deleted_at IS NULL
        ORDER BY ms.created_at DESC LIMIT 1
      ) o ON TRUE
      WHERE m.gym_id = $1 AND m.deleted_at IS NULL AND m.is_blacklisted = false`;
    const rows = await query(
      `SELECT * FROM (${base}) t WHERE t.days_absent > $2
       ORDER BY ${sortKey === 'member_name' ? `t.full_name ${dir}` : `t.days_absent ${dir}, t.full_name ASC`}
       LIMIT ${limit} OFFSET ${offset}`,
      [gym_id, daysMin]);
    const totalRes = await query(
      `SELECT COUNT(*)::int AS total FROM (${base}) t WHERE t.days_absent > $2`,
      [gym_id, daysMin]);
    const buckets = await query(
      `SELECT COUNT(*) FILTER (WHERE t.days_absent <= 7)::int AS week_or_less,
              COUNT(*) FILTER (WHERE t.days_absent BETWEEN 8 AND 30)::int AS mid,
              COUNT(*) FILTER (WHERE t.days_absent > 30)::int AS over_month
       FROM (${base}) t`,
      [gym_id]);
    const b = buckets.rows[0] || {};
    const total = Number(totalRes.rows[0]?.total || 0);
    res.json({
      data: rows.rows,
      pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
      stats: {
        total,
        week_or_less: Number(b.week_or_less || 0),
        mid: Number(b.mid || 0),
        over_month: Number(b.over_month || 0),
      },
    });
  } catch (error) {
    logger.error('Absent report query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// === مبيعات الموظفين: جديد/تجديد + قيمة/محصّل + عمولة ===
// البائع = موظف أول سجل «Created subscription {id}» في activity_logs (منشئ
// الاشتراك). بلا سجل → صف «غير محدد» (أي بيع بلا بائع معروف يتسجل هناك بدل
// ما يضيع). جديد = أول اشتراك للعضو إطلاقًا، تجديد = له سابق.
// قيمة البيع = سعر الباقة الكامل، المحصّل = price_paid، والفرق = ديون مفتوحة.
// العمولة = النسبة الحالية للموظف × قيمة البيع (0 حتى تُضبط من المستخدمين).
export async function getEmployeeSalesReport(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const tzRow = await query(
      `SELECT COALESCE(timezone, 'Africa/Cairo') AS tz FROM gyms WHERE id = $1`,
      [gym_id],
    );
    const tz: string = tzRow.rows[0]?.tz || 'Africa/Cairo';
    const today: string = new Date().toISOString().slice(0, 10);
    let from = ISO_DATE.test(String(req.query.from || '')) ? String(req.query.from) : `${today.slice(0, 8)}01`;
    let to = ISO_DATE.test(String(req.query.to || '')) ? String(req.query.to) : today;
    if (from > to) { const s = from; from = to; to = s; }
    if (addDaysIso(from, 366) < to) to = addDaysIso(from, 366);

    const rangeStart = `( $1::date )::timestamp AT TIME ZONE $2`;
    const rangeEnd = `( $3::date + 1 )::timestamp AT TIME ZONE $2`;

    const rows = await query(
      `WITH subs AS (
         SELECT s.id, s.member_id, o.price,
                COALESCE(s.price_paid, 0) AS paid,
                EXISTS (SELECT 1 FROM member_subscriptions p
                  WHERE p.member_id = s.member_id AND p.gym_id = s.gym_id
                    AND p.deleted_at IS NULL AND p.created_at < s.created_at) AS is_renewal
         FROM member_subscriptions s
         JOIN membership_offers o ON o.id = s.offer_id
         WHERE s.gym_id = $4 AND s.deleted_at IS NULL
           AND s.created_at >= ${rangeStart} AND s.created_at < ${rangeEnd}
       ),
       sellers AS (
         SELECT DISTINCT ON (sub_id) sub_id, staff_user_id
         FROM (
           SELECT (substring(al.action_description from '^Created subscription ([0-9a-f-]{36})'))::uuid AS sub_id,
                  al.staff_user_id, al.created_at
           FROM activity_logs al
           WHERE al.gym_id = $4 AND al.action_description LIKE 'Created subscription %'
         ) t
         WHERE sub_id IS NOT NULL
         ORDER BY sub_id, created_at ASC
       )
       SELECT su.id AS staff_id, su.full_name AS staff_name,
              COALESCE(su.commission_pct, 0) AS rate,
              COUNT(subs.id) FILTER (WHERE NOT subs.is_renewal)::int AS new_count,
              COUNT(subs.id) FILTER (WHERE subs.is_renewal)::int AS renew_count,
              COUNT(subs.id)::int AS total_count,
              COALESCE(SUM(subs.price), 0) AS sale_value,
              COALESCE(SUM(subs.paid), 0) AS collected
       FROM subs
       LEFT JOIN sellers sl ON sl.sub_id = subs.id
       LEFT JOIN staff_users su ON su.id = sl.staff_user_id AND su.gym_id = $4
       GROUP BY su.id, su.full_name, su.commission_pct
       ORDER BY sale_value DESC`,
      [from, tz, to, gym_id]);
    const per = rows.rows.map((r) => {
      const rate = Number(r.rate || 0);
      const sale = Number(r.sale_value || 0);
      return {
        staff_id: r.staff_id,
        staff_name: r.staff_name,
        rate,
        new_count: Number(r.new_count || 0),
        renew_count: Number(r.renew_count || 0),
        total_count: Number(r.total_count || 0),
        sale_value: sale,
        collected: Number(r.collected || 0),
        commission: Math.round(sale * (rate / 100) * 100) / 100,
      };
    });
    const sum = (k: 'total_count' | 'new_count' | 'renew_count' | 'sale_value' | 'collected' | 'commission') =>
      per.reduce((t, r) => t + (r[k] as number), 0);
    res.json({
      data: {
        from, to, timezone: tz,
        staff: per,
        totals: {
          total_count: sum('total_count'),
          new_count: sum('new_count'),
          renew_count: sum('renew_count'),
          sale_value: sum('sale_value'),
          collected: sum('collected'),
          commission: Math.round(sum('commission') * 100) / 100,
        },
      },
    });
  } catch (error) {
    logger.error('Employee sales report query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// === التقرير المالي: نفس جدول المدفوعات بمنظور محاسبي ===
// إجمالي/مصروف/صافي + تفصيل طرق الدفع + أحدث الحركات — كلها بنفس نطاق
// الفلتر وبعملة الصالة. الخزنة وهذا التقرير يقرآن financial_transactions
// نفسه: أي اختلاف بينهما بج فلتر لا داتا.
export async function getFinancialReport(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const tzRow = await query(
      `SELECT COALESCE(timezone, 'Africa/Cairo') AS tz FROM gyms WHERE id = $1`,
      [gym_id],
    );
    const tz: string = tzRow.rows[0]?.tz || 'Africa/Cairo';
    const today: string = new Date().toISOString().slice(0, 10);
    let from = ISO_DATE.test(String(req.query.from || '')) ? String(req.query.from) : `${today.slice(0, 8)}01`;
    let to = ISO_DATE.test(String(req.query.to || '')) ? String(req.query.to) : today;
    if (from > to) { const s = from; from = to; to = s; }
    if (addDaysIso(from, 366) < to) to = addDaysIso(from, 366);

    const rangeStart = `( $2::date )::timestamp AT TIME ZONE $3`;
    const rangeEnd = `( $4::date + 1 )::timestamp AT TIME ZONE $3`;

    const [totals, daily, methods, recentIn, recentOut] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'payment'), 0) AS revenue,
                COUNT(*) FILTER (WHERE type = 'payment')::int AS revenue_count,
                COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS expenses,
                COUNT(*) FILTER (WHERE type = 'expense')::int AS expenses_count
         FROM financial_transactions
         WHERE gym_id = $1 AND created_at >= ${rangeStart} AND created_at < ${rangeEnd}`,
        [gym_id, from, tz, to],
      ),
      query(
        `WITH days AS (
           SELECT generate_series($2::date, $4::date, INTERVAL '1 day')::date AS d
         ),
         moves AS (
           SELECT (ft.created_at AT TIME ZONE $3)::date AS d,
                  SUM(ft.amount) FILTER (WHERE ft.type = 'payment') AS rev,
                  SUM(ft.amount) FILTER (WHERE ft.type = 'expense') AS exp
           FROM financial_transactions ft
           WHERE ft.gym_id = $1
             AND ft.created_at >= ${rangeStart} AND ft.created_at < ${rangeEnd}
           GROUP BY 1
         )
         SELECT to_char(days.d, 'YYYY-MM-DD') AS date,
                COALESCE(moves.rev, 0) AS revenue,
                COALESCE(moves.exp, 0) AS expenses
         FROM days LEFT JOIN moves ON moves.d = days.d
         ORDER BY days.d`,
        [gym_id, from, tz, to],
      ),
      query(
        `SELECT COALESCE(ft.payment_method, 'cash') AS method,
                COUNT(*)::int AS count,
                COALESCE(SUM(ft.amount), 0) AS total
         FROM financial_transactions ft
         WHERE ft.gym_id = $1 AND ft.type = 'payment'
           AND ft.created_at >= ${rangeStart} AND ft.created_at < ${rangeEnd}
         GROUP BY 1
         ORDER BY total DESC`,
        [gym_id, from, tz, to],
      ),
      query(
        `SELECT ft.amount, ft.payment_method, ft.created_at, m.full_name AS member_name
         FROM financial_transactions ft
         LEFT JOIN members m ON m.id = ft.member_id
         WHERE ft.gym_id = $1 AND ft.type = 'payment'
           AND ft.created_at >= ${rangeStart} AND ft.created_at < ${rangeEnd}
         ORDER BY ft.created_at DESC
         LIMIT 15`,
        [gym_id, from, tz, to],
      ),
      query(
        `SELECT ft.amount, ft.description, ft.created_at
         FROM financial_transactions ft
         WHERE ft.gym_id = $1 AND ft.type = 'expense'
           AND ft.created_at >= ${rangeStart} AND ft.created_at < ${rangeEnd}
         ORDER BY ft.created_at DESC
         LIMIT 15`,
        [gym_id, from, tz, to],
      ),
    ]);
    const t = totals.rows[0] || {};
    const revenue = Number(t.revenue || 0);
    const expenses = Number(t.expenses || 0);
    res.json({
      data: {
        from, to, timezone: tz,
        totals: {
          revenue,
          revenue_count: Number(t.revenue_count || 0),
          expenses,
          expenses_count: Number(t.expenses_count || 0),
          net: Math.round((revenue - expenses) * 100) / 100,
        },
        daily: daily.rows.map((r) => ({
          date: r.date, revenue: Number(r.revenue || 0), expenses: Number(r.expenses || 0),
        })),
        methods: methods.rows.map((r) => ({
          method: r.method, count: Number(r.count || 0), total: Number(r.total || 0),
        })),
        recent_income: recentIn.rows.map((r) => ({
          amount: Number(r.amount || 0),
          payment_method: r.payment_method,
          member_name: r.member_name,
          created_at: r.created_at,
        })),
        recent_expenses: recentOut.rows.map((r) => ({
          amount: Number(r.amount || 0),
          description: r.description,
          created_at: r.created_at,
        })),
      },
    });
  } catch (error) {
    logger.error('Financial report query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}
