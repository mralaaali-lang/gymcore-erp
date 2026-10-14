import { Request, Response } from 'express';
import { getAdminClient } from '../config/database';

/**
 * GET /platform/reports/overview
 * Returns aggregated report data for the super admin reports page
 */
export async function getReportsOverview(_req: Request, res: Response) {
  const client = await getAdminClient();
  try {
    // Gyms stats
    const gymsResult = await client.query(`
      SELECT
        COUNT(*)::int AS total_gyms,
        COUNT(*) FILTER (WHERE g.is_active)::int AS active_gyms,
        COUNT(*) FILTER (WHERE gym_plan_tier_from_name(p.name) = 'basic')::int AS basic_plan,
        COUNT(*) FILTER (WHERE gym_plan_tier_from_name(p.name) = 'premium')::int AS premium_plan,
        COUNT(*) FILTER (WHERE gym_plan_tier_from_name(p.name) = 'enterprise')::int AS enterprise_plan,
        COUNT(*) FILTER (WHERE g.is_active = false)::int AS suspended_gyms
      FROM gyms g
      LEFT JOIN billing_plans p ON p.id = g.plan_id
    `);

    // Members stats
    const membersResult = await client.query(`
      SELECT
        COUNT(*)::int AS total_members,
        COUNT(*) FILTER (WHERE is_blacklisted = false)::int AS active_members
      FROM members
    `);

    // Revenue stats
    const revenueResult = await client.query(`
      SELECT
        COUNT(*)::int AS total_invoices,
        COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_invoices,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0)::numeric(10,2) AS paid_total,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_invoices,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0)::numeric(10,2) AS pending_total,
        COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue_invoices
      FROM billing_invoices
    `);

    // Staff stats
    const staffResult = await client.query(`
      SELECT
        COUNT(*)::int AS total_staff,
        COUNT(*) FILTER (WHERE role = 'manager')::int AS managers,
        COUNT(*) FILTER (WHERE role = 'coach')::int AS coaches,
        COUNT(*) FILTER (WHERE role = 'receptionist')::int AS receptionists
      FROM staff_users
    `);

    // Monthly gym creation (last 12 months)
    const monthlyGymsResult = await client.query(`
      SELECT
        TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') AS month,
        COUNT(*)::int AS count
      FROM gyms
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY date_trunc('month', created_at)
      ORDER BY month
    `);

    // Monthly invoices (last 12 months)
    const monthlyRevenueResult = await client.query(`
      SELECT
        TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') AS month,
        COUNT(*)::int AS invoice_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0)::numeric(10,2) AS paid_amount,
        COALESCE(SUM(total_amount), 0)::numeric(10,2) AS total_amount
      FROM billing_invoices
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY date_trunc('month', created_at)
      ORDER BY month
    `);

    // Gyms by currency
    const currencyResult = await client.query(`
      SELECT currency, COUNT(*)::int AS count
      FROM gyms
      WHERE currency IS NOT NULL
      GROUP BY currency
      ORDER BY count DESC
    `);

    // New members this month
    const newMembersResult = await client.query(`
      SELECT COUNT(*)::int AS new_members_this_month
      FROM members
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);

    // Today's check-ins across all gyms
    const todayCheckinsResult = await client.query(`
      SELECT COUNT(*)::int AS today_checkins
      FROM attendance_logs
      WHERE check_in_time >= CURRENT_DATE
    `);

    // Plan sales this month (paid invoices count)
    const planSalesResult = await client.query(`
      SELECT COUNT(*)::int AS plan_sales_this_month,
             COALESCE(SUM(total_amount), 0)::numeric(12,2) AS plan_revenue_this_month
      FROM billing_invoices
      WHERE status = 'paid'
        AND paid_at >= date_trunc('month', CURRENT_DATE)
    `);

    await client.query('COMMIT');

    // Calculate MRR/ARR from actual plan data
    const activeGymsCount = gymsResult.rows[0].active_gyms;
    const planSalesCount = planSalesResult.rows[0].plan_sales_this_month;
    const planRevenueThisMonth = parseFloat(planSalesResult.rows[0].plan_revenue_this_month || '0');
    const mrr = Math.round(planRevenueThisMonth);
    const arr = mrr * 12;

    res.json({
      data: {
        gyms: gymsResult.rows[0],
        members: { ...membersResult.rows[0], new_this_month: newMembersResult.rows[0].new_members_this_month },
        revenue: revenueResult.rows[0],
        staff: staffResult.rows[0],
        mrr,
        arr,
        monthly_gyms: monthlyGymsResult.rows,
        monthly_revenue: monthlyRevenueResult.rows,
        gyms_by_currency: currencyResult.rows,
        today_checkins: todayCheckinsResult.rows[0].today_checkins,
        plan_sales_this_month: planSalesCount,
        plan_revenue_this_month: planRevenueThisMonth,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * POST /platform/reports/multi-tenant
 * Returns per-gym report with revenue, members, growth, and churn
 */
export async function getMultiTenantReport(_req: Request, res: Response) {
  const client = await getAdminClient();
  try {
    const gymsResult = await client.query(`
      SELECT id, name, subdomain FROM gyms ORDER BY name
    `);

    const memberStats = await client.query(`
      SELECT gym_id, COUNT(*)::int AS total_members,
             COUNT(*) FILTER (WHERE is_blacklisted = false)::int AS active_members
      FROM members GROUP BY gym_id
    `);

    const revenueStats = await client.query(`
      SELECT gym_id,
             COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0)::numeric(10,2) AS paid,
             COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0)::numeric(10,2) AS pending
      FROM billing_invoices GROUP BY gym_id
    `);

    const newThisMonth = await client.query(`
      SELECT gym_id, COUNT(*)::int AS new_members
      FROM members WHERE created_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY gym_id
    `);

    const newLastMonth = await client.query(`
      SELECT gym_id, COUNT(*)::int AS new_members
      FROM members
      WHERE created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
        AND created_at < date_trunc('month', CURRENT_DATE)
      GROUP BY gym_id
    `);

    const churnedThisMonth = await client.query(`
      SELECT gym_id, COUNT(*)::int AS churned
      FROM members
      WHERE is_blacklisted = true AND updated_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY gym_id
    `);

    const prevMemberCounts = await client.query(`
      SELECT gym_id, COUNT(*)::int AS prev_count
      FROM members WHERE created_at < date_trunc('month', CURRENT_DATE)
      GROUP BY gym_id
    `);

    const memberMap = new Map(memberStats.rows.map((r: any) => [r.gym_id, r]));
    const revenueMap = new Map(revenueStats.rows.map((r: any) => [r.gym_id, r]));
    const newThisMap = new Map(newThisMonth.rows.map((r: any) => [r.gym_id, r]));
    const newLastMap = new Map(newLastMonth.rows.map((r: any) => [r.gym_id, r]));
    const churnedMap = new Map(churnedThisMonth.rows.map((r: any) => [r.gym_id, r]));
    const prevMap = new Map(prevMemberCounts.rows.map((r: any) => [r.gym_id, r]));

    const gyms = gymsResult.rows.map((gym: any) => {
      const members = memberMap.get(gym.id) || { total_members: 0, active_members: 0 };
      const revenue = revenueMap.get(gym.id) || { paid: 0, pending: 0 };
      const newThis = newThisMap.get(gym.id)?.new_members || 0;
      const newLast = newLastMap.get(gym.id)?.new_members || 0;
      const churned = churnedMap.get(gym.id)?.churned || 0;
      const prev = prevMap.get(gym.id)?.prev_count || 0;

      const growthRate = newLast > 0
        ? ((newThis - newLast) / newLast) * 100
        : (newThis > 0 ? 100 : 0);
      const churnRate = prev > 0 ? (churned / prev) * 100 : 0;

      return {
        id: gym.id,
        name: gym.name,
        subdomain: gym.subdomain,
        members: members.total_members,
        active_members: members.active_members,
        revenue_paid: parseFloat(revenue.paid || 0),
        revenue_pending: parseFloat(revenue.pending || 0),
        growth_rate: Math.round(growthRate * 100) / 100,
        churn_rate: Math.round(churnRate * 100) / 100,
      };
    });

    res.json({ data: gyms });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * GET /platform/reports/metrics
 * Returns platform-wide aggregated metrics
 */
export async function getReportsMetrics(_req: Request, res: Response) {
  const client = await getAdminClient();
  try {
    const totalRevenueResult = await client.query(`
      SELECT COALESCE(SUM(total_amount), 0)::numeric(12,2) AS total_revenue
      FROM billing_invoices WHERE status = 'paid'
    `);

    const totalMembersResult = await client.query(`SELECT COUNT(*)::int AS total_members FROM members`);
    const activeMembersResult = await client.query(`
      SELECT COUNT(*)::int AS active_members FROM members WHERE is_blacklisted = false
    `);
    const activeGymsResult = await client.query(`
      SELECT COUNT(*)::int AS active_gyms FROM gyms WHERE is_active = true
    `);
    const totalGymsResult = await client.query(`SELECT COUNT(*)::int AS total_gyms FROM gyms`);
    const newMembersResult = await client.query(`
      SELECT COUNT(*)::int AS new_members_this_month
      FROM members WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);
    const churnedResult = await client.query(`
      SELECT COUNT(*)::int AS churned_this_month
      FROM members WHERE is_blacklisted = true AND updated_at >= date_trunc('month', CURRENT_DATE)
    `);

    const activeGymsCount = activeGymsResult.rows[0].active_gyms;
    const avgMonthlyPerGym = 12000;
    const mrr = Math.round(activeGymsCount * avgMonthlyPerGym / 12);
    const arr = mrr * 12;
    const totalRevenue = parseFloat(totalRevenueResult.rows[0].total_revenue);
    const avgRevenuePerGym = activeGymsCount > 0 ? totalRevenue / activeGymsCount : 0;

    res.json({
      data: {
        total_revenue: totalRevenue,
        total_members: totalMembersResult.rows[0].total_members,
        active_members: activeMembersResult.rows[0].active_members,
        active_gyms: activeGymsCount,
        total_gyms: totalGymsResult.rows[0].total_gyms,
        avg_revenue_per_gym: Math.round(avgRevenuePerGym * 100) / 100,
        mrr,
        arr,
        new_members_this_month: newMembersResult.rows[0].new_members_this_month,
        churned_this_month: churnedResult.rows[0].churned_this_month,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * GET /platform/reports/tenants-growth
 * Returns tenants sorted by growth rate
 */
export async function getTenantsWithGrowth(_req: Request, res: Response) {
  const client = await getAdminClient();
  try {
    const growthResult = await client.query(`
      WITH prev_members AS (
        SELECT g.id as gym_id, COUNT(m.id)::int as prev_count
        FROM gyms g
        LEFT JOIN members m ON m.gym_id = g.id AND m.created_at < date_trunc('month', CURRENT_DATE)
        GROUP BY g.id
      ),
      current_members AS (
        SELECT gym_id, COUNT(*)::int as current_count
        FROM members GROUP BY gym_id
      ),
      new_members AS (
        SELECT gym_id, COUNT(*)::int as new_count
        FROM members WHERE created_at >= date_trunc('month', CURRENT_DATE)
        GROUP BY gym_id
      ),
      churned_members AS (
        SELECT gym_id, COUNT(*)::int as churned_count
        FROM members
        WHERE is_blacklisted = true AND updated_at >= date_trunc('month', CURRENT_DATE)
        GROUP BY gym_id
      )
      SELECT g.id, g.name, g.subdomain,
             COALESCE(cm.current_count, 0) as members,
             COALESCE(nm.new_count, 0) as new_members,
             COALESCE(chm.churned_count, 0) as churned,
             COALESCE(pm.prev_count, 0) as prev_members
      FROM gyms g
      LEFT JOIN current_members cm ON cm.gym_id = g.id
      LEFT JOIN new_members nm ON nm.gym_id = g.id
      LEFT JOIN churned_members chm ON chm.gym_id = g.id
      LEFT JOIN prev_members pm ON pm.gym_id = g.id
      ORDER BY (COALESCE(nm.new_count, 0) - COALESCE(chm.churned_count, 0)) DESC
    `);

    const tenants = growthResult.rows.map((row: any) => {
      const prev = row.prev_members || 0;
      const netChange = row.new_members - row.churned;
      const growthRate = prev > 0 ? (netChange / prev) * 100 : (netChange > 0 ? 100 : 0);
      return {
        id: row.id,
        name: row.name,
        subdomain: row.subdomain,
        members: row.members,
        growth_rate: Math.round(growthRate * 100) / 100,
        churned: row.churned,
      };
    });

    res.json({ data: tenants });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────
// 🆕 ADVANCED REPORTS (Task 1 — Super Admin)
// ──────────────────────────────────────────────

/**
 * GET /platform/reports/revenue-trend
 * Revenue trend with period-over-period comparison
 */
export async function getRevenueTrend(req: Request, res: Response) {
  const client = await getAdminClient();
  try {
    const { period = '12', compare = 'true' } = req.query;
    const months = Math.min(Math.max(parseInt(period as string) || 12, 1), 36);
    const doCompare = compare !== 'false';

    // Current period
    const current = await client.query(`
      SELECT
        TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') AS month,
        COUNT(*)::int AS invoice_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0)::numeric(12,2) AS revenue,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0)::numeric(12,2) AS pending,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'overdue'), 0)::numeric(12,2) AS overdue
      FROM billing_invoices
      WHERE created_at >= NOW() - ($1 || ' months')::INTERVAL
      GROUP BY date_trunc('month', created_at)
      ORDER BY month
    `, [months]);

    // Previous period (for comparison)
    let previous: any = { rows: [] };
    if (doCompare) {
      previous = await client.query(`
        SELECT
          TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') AS month,
          COUNT(*)::int AS invoice_count,
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0)::numeric(12,2) AS revenue,
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0)::numeric(12,2) AS pending,
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'overdue'), 0)::numeric(12,2) AS overdue
        FROM billing_invoices
        WHERE created_at >= NOW() - ($1 || ' months')::INTERVAL - ($1 || ' months')::INTERVAL
          AND created_at < NOW() - ($1 || ' months')::INTERVAL
        GROUP BY date_trunc('month', created_at)
        ORDER BY month
      `, [months]);
    }

    // Summary calculations
    const currentRevenue = current.rows.reduce((s: number, r: any) => s + parseFloat(r.revenue || '0'), 0);
    const previousRevenue = previous.rows.reduce((s: number, r: any) => s + parseFloat(r.revenue || '0'), 0);
    const changePct = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    res.json({
      data: {
        current_period: current.rows,
        previous_period: previous.rows,
        summary: {
          current_revenue: Math.round(currentRevenue * 100) / 100,
          previous_revenue: Math.round(previousRevenue * 100) / 100,
          change_percentage: Math.round(changePct * 100) / 100,
          total_invoices: current.rows.reduce((s: number, r: any) => s + r.invoice_count, 0),
          total_pending: current.rows.reduce((s: number, r: any) => s + parseFloat(r.pending || '0'), 0),
          total_overdue: current.rows.reduce((s: number, r: any) => s + parseFloat(r.overdue || '0'), 0),
        },
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * GET /platform/reports/churn-analysis
 * Churn rate analysis with trends and predictions
 */
export async function getChurnAnalysis(_req: Request, res: Response) {
  const client = await getAdminClient();
  try {
    // Monthly churn (last 12 months)
    const monthlyChurn = await client.query(`
      SELECT
        TO_CHAR(date_trunc('month', updated_at), 'YYYY-MM') AS month,
        COUNT(*)::int AS churned,
        (SELECT COUNT(*)::int FROM members WHERE created_at < date_trunc('month', CURRENT_DATE)) AS total_members
      FROM members
      WHERE is_blacklisted = true
        AND updated_at >= NOW() - INTERVAL '12 months'
      GROUP BY date_trunc('month', updated_at)
      ORDER BY month
    `);

    // Churn by gym
    const churnByGym = await client.query(`
      SELECT
        g.id, g.name,
        COUNT(DISTINCT m.id) FILTER (WHERE m.is_blacklisted)::int AS churned,
        COUNT(DISTINCT m.id)::int AS total_members,
        CASE WHEN COUNT(DISTINCT m.id) > 0
          THEN ROUND((COUNT(DISTINCT m.id) FILTER (WHERE m.is_blacklisted)::numeric / COUNT(DISTINCT m.id)::numeric) * 100, 2)
          ELSE 0
        END AS churn_rate
      FROM gyms g
      LEFT JOIN members m ON m.gym_id = g.id
      GROUP BY g.id, g.name
      ORDER BY churn_rate DESC
      LIMIT 20
    `);

    // Churn reasons (from activity logs or invoices)
    const churnReasons = await client.query(`
      SELECT
        COALESCE(NULLIF(m.blacklist_reason, ''), 'غير محدد') AS reason,
        COUNT(*)::int AS count
      FROM members m
      WHERE m.is_blacklisted = true
      GROUP BY reason
      ORDER BY count DESC
    `);

    // Overall stats
    const stats = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_blacklisted)::int AS total_churned,
        COUNT(*)::int AS total_members,
        ROUND((COUNT(*) FILTER (WHERE is_blacklisted)::numeric / NULLIF(COUNT(*)::numeric, 0)) * 100, 2) AS overall_churn_rate,
        COUNT(*) FILTER (WHERE is_blacklisted AND updated_at >= date_trunc('month', CURRENT_DATE))::int AS churned_this_month
      FROM members
    `);

    res.json({
      data: {
        stats: stats.rows[0],
        monthly_churn: monthlyChurn.rows,
        churn_by_gym: churnByGym.rows,
        churn_reasons: churnReasons.rows,
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * GET /platform/reports/geo-distribution
 * Geographic distribution of gyms and members
 */
export async function getGeoDistribution(_req: Request, res: Response) {
  const client = await getAdminClient();
  try {
    const result = await client.query(`
      SELECT
        COALESCE(NULLIF(g.address_country, ''), 'غير محدد') AS region,
        COUNT(DISTINCT g.id)::int AS gyms,
        COUNT(DISTINCT m.id)::int AS members,
        COALESCE(SUM(bi.total_amount) FILTER (WHERE bi.status = 'paid'), 0)::numeric(12,2) AS revenue
      FROM gyms g
      LEFT JOIN members m ON m.gym_id = g.id
      LEFT JOIN billing_invoices bi ON bi.gym_id = g.id
      GROUP BY region
      ORDER BY gyms DESC
    `);

    const total = result.rows.reduce((s: any, r: any) => ({
      gyms: s.gyms + r.gyms,
      members: s.members + r.members,
      revenue: s.revenue + parseFloat(r.revenue || '0'),
    }), { gyms: 0, members: 0, revenue: 0 });

    res.json({
      data: {
        regions: result.rows,
        total: { ...total, revenue: Math.round(total.revenue * 100) / 100 },
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * GET /platform/reports/plan-performance
 * Plan tier performance metrics
 */
export async function getPlanPerformance(_req: Request, res: Response) {
  const client = await getAdminClient();
  try {
    const result = await client.query(`
      SELECT
        COALESCE(gym_plan_tier_from_name(p.name), 'unknown') AS plan_tier,
        COUNT(DISTINCT g.id)::int AS gym_count,
        COUNT(DISTINCT m.id)::int AS total_members,
        COUNT(DISTINCT m.id) FILTER (WHERE m.is_blacklisted = false)::int AS active_members,
        COALESCE(SUM(bi.total_amount) FILTER (WHERE bi.status = 'paid'), 0)::numeric(12,2) AS total_revenue,
        COALESCE(AVG(bi.total_amount) FILTER (WHERE bi.status = 'paid'), 0)::numeric(10,2) AS avg_revenue
      FROM gyms g
      LEFT JOIN billing_plans p ON p.id = g.plan_id
      LEFT JOIN members m ON m.gym_id = g.id
      LEFT JOIN billing_invoices bi ON bi.gym_id = g.id
      GROUP BY gym_plan_tier_from_name(p.name)
      ORDER BY total_revenue DESC
    `);

    res.json({ data: result.rows });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * GET /platform/reports/overdue-payments
 * Overdue payments report with aging
 */
export async function getOverduePayments(req: Request, res: Response) {
  const client = await getAdminClient();
  try {
    const { days = '30' } = req.query;
    const overdueDays = Math.max(parseInt(days as string) || 30, 1);

    const result = await client.query(`
      SELECT
        bi.id, bi.invoice_number, bi.total_amount AS amount, bi.due_date,
        bi.created_at,
        g.name AS gym_name,
        g.subdomain,
        CASE
          WHEN bi.due_date < NOW() - INTERVAL '90 days' THEN '90+ يوم'
          WHEN bi.due_date < NOW() - INTERVAL '60 days' THEN '61-90 يوم'
          WHEN bi.due_date < NOW() - INTERVAL '30 days' THEN '31-60 يوم'
          ELSE '1-30 يوم'
        END AS aging_bucket,
        EXTRACT(DAY FROM NOW() - bi.due_date)::int AS days_overdue
      FROM billing_invoices bi
      JOIN gyms g ON g.id = bi.gym_id
      WHERE bi.status = 'overdue'
        AND bi.due_date < NOW() - ($1 || ' days')::INTERVAL
      ORDER BY bi.due_date ASC
    `, [overdueDays]);

    // Aging summary
    const agingSummary = result.rows.reduce((acc: Record<string, number>, r: any) => {
      acc[r.aging_bucket] = (acc[r.aging_bucket] || 0) + parseFloat(r.amount || '0');
      return acc;
    }, {});

    res.json({
      data: {
        invoices: result.rows,
        total_overdue: result.rows.reduce((s: number, r: any) => s + parseFloat(r.amount || '0'), 0),
        total_count: result.rows.length,
        aging_summary: agingSummary,
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}

/**
 * GET /platform/reports/gym-performance
 * Gym ranking by performance metrics
 */
export async function getGymPerformance(_req: Request, res: Response) {
  const client = await getAdminClient();
  try {
    const result = await client.query(`
      SELECT
        g.id, g.name, g.subdomain, gym_plan_tier_from_name(p.name) AS plan_tier, p.name AS plan_name, g.is_active,
        COALESCE(m.members, 0)::int AS members,
        COALESCE(m.active_members, 0)::int AS active_members,
        COALESCE(m.new_members_this_month, 0)::int AS new_members_this_month,
        COALESCE(al.today_checkins, 0)::int AS today_checkins,
        COALESCE(bi.total_revenue, 0)::numeric(12,2) AS total_revenue,
        COALESCE(bi.monthly_revenue, 0)::numeric(12,2) AS monthly_revenue,
        COALESCE(su.staff_count, 0)::int AS staff_count
      FROM gyms g
      LEFT JOIN billing_plans p ON p.id = g.plan_id
      LEFT JOIN (
        SELECT gym_id,
          COUNT(*)::int AS members,
          COUNT(*) FILTER (WHERE is_blacklisted = false)::int AS active_members,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::int AS new_members_this_month
        FROM members GROUP BY gym_id
      ) m ON m.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, COUNT(*)::int AS today_checkins
        FROM attendance_logs WHERE check_in_time >= CURRENT_DATE GROUP BY gym_id
      ) al ON al.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id,
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0)::numeric(12,2) AS total_revenue,
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('month', CURRENT_DATE)), 0)::numeric(12,2) AS monthly_revenue
        FROM billing_invoices GROUP BY gym_id
      ) bi ON bi.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, COUNT(*)::int AS staff_count FROM staff_users GROUP BY gym_id
      ) su ON su.gym_id = g.id
      ORDER BY monthly_revenue DESC
    `);

    res.json({ data: result.rows });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}
