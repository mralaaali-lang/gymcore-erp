/**
 * aiAnalytics.service.ts — AI-powered analytics for billing & marketing [MODIFIED - 2026]
 * Uses Gemini AI for natural-language insights with rule-based fallback.
 * Provides churn prediction, plan recommendations, and revenue forecasting.
 */

import { Pool } from 'pg';
import {
  isGeminiAvailable,
  generateChurnAnalysis as geminiChurnAnalysis,
  generatePlanRecommendation as geminiPlanRecommendation,
  generateRevenueInsights as geminiRevenueInsights,
} from '../utils/geminiAdapter';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Check if Gemini AI is available */
function isAiAvailable(): boolean {
  return isGeminiAvailable();
}

// ─── Churn Prediction ────────────────────────────────────────────────

export interface ChurnRiskResult {
  gym_id: string;
  gym_name: string;
  churn_score: number; // 0-100, higher = more likely to churn
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  factors: ChurnFactor[];
  suggested_action?: string;
}

export interface ChurnFactor {
  name: string;
  weight: number;
  value: string;
  description: string;
}

/**
 * Calculate churn risk score for each gym based on:
 * - Subscription age (newer gyms churn less)
 * - Payment delays (late payments increase risk)
 * - Usage decline (fewer check-ins = higher risk)
 * - Support tickets (many open tickets = higher risk)
 * - Invoice overdue ratio (more overdue = higher risk)
 */
export async function predictChurn(
  daysBack: number = 90
): Promise<ChurnRiskResult[]> {
  const query = `
    SELECT
      g.id AS gym_id,
      g.name AS gym_name,
      g.created_at,
      -- Count overdue invoices (last 90 days)
      COALESCE(overdue.count, 0) AS overdue_invoices,
      COALESCE(total_invoices.total, 0) AS total_invoices,
      -- Count support tickets (open, last 90 days)
      COALESCE(open_tickets.count, 0) AS open_tickets,
      -- Payment history (count of failed/pending payments)
      COALESCE(failed_payments.count, 0) AS failed_payments,
      -- Usage trend (check-ins in last 30 days vs previous 30 days)
      COALESCE(recent_usage.count, 0) AS recent_checkins,
      COALESCE(prev_usage.count, 0) AS prev_checkins
    FROM gyms g
    LEFT JOIN (
      SELECT gym_id, COUNT(*) AS count
      FROM billing_invoices
      WHERE status = 'overdue'
        AND due_date >= CURRENT_DATE - INTERVAL '${daysBack} days'
      GROUP BY gym_id
    ) overdue ON g.id = overdue.gym_id
    LEFT JOIN (
      SELECT gym_id, COUNT(*) AS total
      FROM billing_invoices
      WHERE billing_period_start >= CURRENT_DATE - INTERVAL '${daysBack} days'
      GROUP BY gym_id
    ) total_invoices ON g.id = total_invoices.gym_id
    LEFT JOIN (
      SELECT gym_id, COUNT(*) AS count
      FROM support_tickets
      WHERE status IN ('open', 'in_progress')
        AND created_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
      GROUP BY gym_id
    ) open_tickets ON g.id = open_tickets.gym_id
    LEFT JOIN (
      SELECT gym_id, COUNT(*) AS count
      FROM billing_payment_transactions
      WHERE status = 'failed'
        AND created_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
      GROUP BY gym_id
    ) failed_payments ON g.id = failed_payments.gym_id
    LEFT JOIN (
      SELECT gym_id, COUNT(*) AS count
      FROM attendance_logs
      WHERE checked_in_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY gym_id
    ) recent_usage ON g.id = recent_usage.gym_id
    LEFT JOIN (
      SELECT gym_id, COUNT(*) AS count
      FROM attendance_logs
      WHERE checked_in_at BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '30 days'
      GROUP BY gym_id
    ) prev_usage ON g.id = prev_usage.gym_id
  `;

  const result = await pool.query(query);

  return result.rows.map((row: any) => {
    const totalInvoices = parseInt(row.total_invoices, 10) || 1;
    const overdueCount = parseInt(row.overdue_invoices, 10) || 0;
    const openTickets = parseInt(row.open_tickets, 10) || 0;
    const failedPayments = parseInt(row.failed_payments, 10) || 0;
    const recentCheckins = parseInt(row.recent_checkins, 10) || 0;
    const prevCheckins = parseInt(row.prev_checkins, 10) || 0;

    const overdueRatio = overdueCount / totalInvoices;
    const usageDecline = prevCheckins > 0 ? (prevCheckins - recentCheckins) / prevCheckins : 0;

    // Weighted scoring
    let score = 0;
    const factors: ChurnFactor[] = [];

    // Factor 1: Overdue invoice ratio (weight: 30)
    const overdueScore = Math.min(overdueRatio * 100, 100);
    score += overdueScore * 0.30;
    factors.push({
      name: 'overdue_invoices',
      weight: 0.30,
      value: `${overdueCount}/${totalInvoices}`,
      description: `Overdue invoices ratio: ${Math.round(overdueRatio * 100)}%`,
    });

    // Factor 2: Open support tickets (weight: 25)
    const ticketScore = Math.min(openTickets * 25, 100);
    score += ticketScore * 0.25;
    factors.push({
      name: 'open_tickets',
      weight: 0.25,
      value: String(openTickets),
      description: `${openTickets} open support ticket(s)`,
    });

    // Factor 3: Failed payments (weight: 25)
    const paymentScore = Math.min(failedPayments * 33, 100);
    score += paymentScore * 0.25;
    factors.push({
      name: 'failed_payments',
      weight: 0.25,
      value: String(failedPayments),
      description: `${failedPayments} failed payment(s)`,
    });

    // Factor 4: Usage decline (weight: 20)
    const usageScore = Math.min(usageDecline * 100, 100);
    score += usageScore * 0.20;
    factors.push({
      name: 'usage_decline',
      weight: 0.20,
      value: `${Math.round(usageDecline * 100)}%`,
      description: `Attendance declined ${Math.round(usageDecline * 100)}% vs previous period`,
    });

    // Normalize to 0-100
    score = Math.min(Math.round(score), 100);

    let riskLevel: ChurnRiskResult['risk_level'] = 'low';
    if (score >= 70) riskLevel = 'critical';
    else if (score >= 50) riskLevel = 'high';
    else if (score >= 25) riskLevel = 'medium';

    let suggestedAction: string | undefined;
    if (score >= 70) suggestedAction = 'Urgent: Schedule call with gym owner, review payment history';
    else if (score >= 50) suggestedAction = 'Flag for account manager review, offer retention incentive';
    else if (score >= 25) suggestedAction = 'Monitor closely, send engagement email';

    return {
      gym_id: row.gym_id,
      gym_name: row.gym_name,
      churn_score: score,
      risk_level: riskLevel,
      factors,
      suggested_action: suggestedAction,
    };
  });
}

// ─── Plan Recommendations ────────────────────────────────────────────

export interface PlanRecommendation {
  gym_id: string;
  gym_name: string;
  current_plan: string;
  recommended_plan: string;
  confidence: number; // 0-1
  reason: string;
}

/**
 * Recommend plan upgrades based on usage patterns and billing history
 */
export async function recommendPlans(): Promise<PlanRecommendation[]> {
  const query = `
    SELECT
      g.id AS gym_id,
      g.name AS gym_name,
      bp.name AS current_plan,
      -- Usage intensity: check-ins per day
      CASE
        WHEN COUNT(DISTINCT al.id) > 30 THEN 'high'
        WHEN COUNT(DISTINCT al.id) > 10 THEN 'medium'
        ELSE 'low'
      END AS usage_intensity,
      -- Payment history
      AVG(CASE WHEN bi.status = 'paid' THEN 1.0 ELSE 0.0 END) AS payment_rate,
      COUNT(DISTINCT bi.id) AS total_bills
    FROM gyms g
    LEFT JOIN billing_invoices bi ON g.id = bi.gym_id
    LEFT JOIN billing_plans bp ON bi.plan_id = bp.id
    LEFT JOIN attendance_logs al ON g.id = al.gym_id
      AND al.checked_in_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY g.id, g.name, bp.name
    HAVING COUNT(DISTINCT bi.id) > 0
  `;

  const result = await pool.query(query);

  return result.rows.map((row: any) => {
    const paymentRate = parseFloat(row.payment_rate) || 0;
    const usageIntensity = row.usage_intensity;
    const totalBills = parseInt(row.total_bills, 10) || 1;

    let recommendedPlan = 'Professional';
    let reason = '';
    let confidence = 0.5;

    if (usageIntensity === 'high' && paymentRate >= 0.8) {
      recommendedPlan = 'Enterprise';
      reason = 'High usage with strong payment history — suitable for premium tier';
      confidence = 0.85;
    } else if (usageIntensity === 'medium' && paymentRate >= 0.6) {
      recommendedPlan = 'Professional';
      reason = 'Moderate usage with good payment track record';
      confidence = 0.75;
    } else if (usageIntensity === 'low' || paymentRate < 0.5) {
      recommendedPlan = 'Starter';
      reason = 'Low usage or inconsistent payment — recommend entry plan';
      confidence = 0.7;
    } else {
      reason = 'Current plan appears suitable based on available data';
      confidence = 0.5;
    }

    return {
      gym_id: row.gym_id,
      gym_name: row.gym_name,
      current_plan: row.current_plan ?? 'Unknown',
      recommended_plan: recommendedPlan,
      confidence,
      reason,
    };
  });
}

// ─── Revenue Forecast ────────────────────────────────────────────────

export interface RevenueForecast {
  month: string;
  predicted_revenue: number;
  confidence_lower: number;
  confidence_upper: number;
}

/**
 * Simple revenue forecast based on historical monthly billing data.
 * Uses a 3-month moving average as baseline, with confidence interval.
 */
export async function forecastRevenue(monthsAhead: number = 3): Promise<RevenueForecast[]> {
  // Get last 12 months of revenue data
  const histQuery = `
    SELECT
      DATE_TRUNC('month', billing_period_start) AS month,
      SUM(total_amount) AS revenue,
      COUNT(*) AS invoice_count
    FROM billing_invoices
    WHERE status IN ('paid', 'partial')
      AND billing_period_start >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', billing_period_start)
    ORDER BY month ASC
  `;
  const histResult = await pool.query(histQuery);
  const history = histResult.rows.map((r: any) => ({
    month: r.month,
    revenue: parseFloat(r.revenue) || 0,
    count: parseInt(r.invoice_count, 10) || 0,
  }));

  if (history.length < 2) {
    return [];
  }

  // Calculate 3-month moving average
  const recent3 = history.slice(-3);
  const avgRevenue = recent3.reduce((sum, m) => sum + m.revenue, 0) / recent3.length;
  const stdDev = Math.sqrt(
    recent3.reduce((sum, m) => sum + Math.pow(m.revenue - avgRevenue, 2), 0) / recent3.length
  );

  // Growth rate estimate
  const growthRate = history.length >= 2
    ? (history[history.length - 1].revenue - history[0].revenue) / history.length
    : 0;

  const forecasts: RevenueForecast[] = [];
  const now = new Date();

  for (let i = 1; i <= monthsAhead; i++) {
    const forecastMonth = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const predicted = Math.max(0, avgRevenue + growthRate * i);
    const ci = 1.96 * stdDev; // 95% confidence interval

    forecasts.push({
      month: forecastMonth.toISOString().slice(0, 7),
      predicted_revenue: Math.round(predicted * 100) / 100,
      confidence_lower: Math.round((predicted - ci) * 100) / 100,
      confidence_upper: Math.round((predicted + ci) * 100) / 100,
    });
  }

  return forecasts;
}

// ─── AI Suggestion Engine (Rule-based fallback) ──────────────────────

export interface AISuggestion {
  type: 'upsell' | 'retention' | 'optimization' | 'alert';
  gym_id: string;
  gym_name: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

/**
 * Generate rule-based AI suggestions for gym owners
 */
export async function generateSuggestions(): Promise<AISuggestion[]> {
  const suggestions: AISuggestion[] = [];

  // 1. Overdue invoice alerts
  const overdueResult = await pool.query(`
    SELECT g.id AS gym_id, g.name AS gym_name,
           COUNT(*) AS overdue_count,
           SUM(bi.total_amount) AS overdue_amount
    FROM billing_invoices bi
    JOIN gyms g ON bi.gym_id = g.id
    WHERE bi.status = 'overdue'
    GROUP BY g.id, g.name
    HAVING COUNT(*) > 0
    ORDER BY overdue_count DESC
    LIMIT 10
  `);

  for (const row of overdueResult.rows) {
    suggestions.push({
      type: 'alert',
      gym_id: row.gym_id,
      gym_name: row.gym_name,
      title: `⚠️ ${row.overdue_count} فاتورة متأخرة`,
      description: `إجمالي المبالغ المتأخرة: ${row.overdue_amount} EGP — يُرجى مراجعة مع صاحب الصالة`,
      priority: 'high',
    });
  }

  // 2. High-usage gyms suitable for upgrade
  const highUsageResult = await pool.query(`
    SELECT g.id AS gym_id, g.name AS gym_name,
           COUNT(DISTINCT al.id) AS checkin_count_90d
    FROM gyms g
    JOIN attendance_logs al ON g.id = al.gym_id
    WHERE al.checked_in_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY g.id, g.name
    HAVING COUNT(DISTINCT al.id) > 50
    ORDER BY checkin_count_90d DESC
    LIMIT 5
  `);

  for (const row of highUsageResult.rows) {
    suggestions.push({
      type: 'upsell',
      gym_id: row.gym_id,
      gym_name: row.gym_name,
      title: '💡 فرصة ترقية الباقة',
      description: `الصالة تشهد ${row.checkin_count_90d} دخول خلال 90 يوم — باقة Professional أو Enterprise قد تكون مناسبة`,
      priority: 'medium',
    });
  }

  // 3. Low-usage gyms at risk
  const lowUsageResult = await pool.query(`
    SELECT g.id AS gym_id, g.name AS gym_name,
           COUNT(DISTINCT al.id) AS checkin_count_90d
    FROM gyms g
    LEFT JOIN attendance_logs al ON g.id = al.gym_id
      AND al.checked_in_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY g.id, g.name
    HAVING COUNT(DISTINCT al.id) < 5 AND g.created_at < CURRENT_DATE - INTERVAL '180 days'
    ORDER BY checkin_count_90d ASC
    LIMIT 5
  `);

  for (const row of lowUsageResult.rows) {
    suggestions.push({
      type: 'retention',
      gym_id: row.gym_id,
      gym_name: row.gym_name,
      title: '🔔 صالة غير نشطة',
      description: `الصالة تستخدم الخدمة منذ أكثر من 6 أشهر بعدد دخول قليل — يُوصى بعرض ترويجي أو تواصل مباشر`,
      priority: 'medium',
    });
  }

  return suggestions;
}
