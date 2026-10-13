import api from './api';

export interface EnrollmentTrendRow {
  month: string;
  new_members: number;
  /** Subscriptions that ended (expired/cancelled/suspended) that month (§24). */
  cancellations?: number;
}

export interface PeakHourRow {
  hour: number;
  check_ins: number;
  unique_members: number;
}

export interface RevenueBreakdown {
  memberships: number;
  pos: number;
  personal_training: number;
  aging_receivables: {
    current: number;
    aging_1_30: number;
    aging_31_60: number;
    aging_60_plus: number;
  };
}

export async function getEnrollmentTrend(): Promise<{ data: EnrollmentTrendRow[] }> {
  const res = await api.get('/api/analytics/enrollment-trend');
  return res.data;
}

export async function getPeakHours(): Promise<{ data: PeakHourRow[] }> {
  const res = await api.get('/api/analytics/peak-hours');
  return res.data;
}

export async function getRevenueBreakdown(): Promise<{ data: RevenueBreakdown }> {
  const res = await api.get('/api/analytics/revenue-breakdown');
  return res.data;
}

// §34أ — money KPIs computed server-side from member_subscriptions only.
// null arpu/churn_rate_pct = honest "no base yet" (render as '—').
export interface BusinessMetrics {
  mrr: number;
  arpu: number | null;
  churn_rate_pct: number | null;
  churned_this_month: number;
  active_at_month_start: number;
  new_this_month: number;
  net_growth: number;
  active_members: number;
}

export async function getBusinessMetrics(): Promise<{ data: BusinessMetrics }> {
  const res = await api.get('/api/analytics/business-metrics');
  return res.data;
}

// §34ب — typed contracts for the analytics page (the old page read fields
// the server never sent: retention.rate, forecast as an array, peak-hours
// .count — every one of those was silently '-' or 0).

/** One row per month (last 12): new subs that month vs renewals of them. */
export interface RetentionRow {
  month: string; // ISO month start (timestamp)
  new_members: number;
  renewals: number;
  retention_rate: number; // % renewals/new that month
}

/** Single summary object — NOT an array. */
export interface RevenueForecast {
  active_subscriptions: number;
  monthly_recurring_revenue: number;
  renewing_next_7d: number;
  renewing_next_30d: number;
  forecast_revenue_30d: number;
}

export interface ClassOccupancyItem {
  id: string;
  title: string;
  start_time: string;
  capacity: number;
  booked: number;
  occupancy_pct: number | null;
}

export interface Engagement {
  visits: {
    checkins_30d: number;
    visiting_members_30d: number;
    active_members: number;
    /** avg check-ins per active member, last 30 days; null = no base. */
    avg_per_member: number | null;
  };
  classes: {
    count: number;
    avg_occupancy_pct: number | null;
    items: ClassOccupancyItem[];
  };
}

export async function getRetentionRate(): Promise<{ data: RetentionRow[] }> {
  const res = await api.get('/api/analytics/retention-rate');
  return res.data;
}

export async function getRevenueForecast(): Promise<{ data: RevenueForecast }> {
  const res = await api.get('/api/analytics/revenue-forecast');
  return res.data;
}

export async function getEngagement(): Promise<{ data: Engagement }> {
  const res = await api.get('/api/analytics/engagement');
  return res.data;
}

// §34ت — marketing funnel computed server-side from gym_leads + members.
// funnel stages are "reached at least this step" (new→contacted→trial_booked→converted);
// pct is null when there are zero leads (honest no-base, render as '—' / empty state).
export interface FunnelStage {
  key: 'leads' | 'interest' | 'decision' | 'converted';
  count: number;
  pct: number | null;
}

export interface FunnelSourceRow {
  source: string;
  total: number;
  converted: number;
}

export interface FunnelSeriesPoint {
  date: string; // YYYY-MM-DD
  leads: number;
  signups: number;
}

export interface MarketingFunnel {
  funnel: {
    total_leads: number;
    lost: number;
    conversion_pct: number | null;
    stages: FunnelStage[];
  };
  by_source: FunnelSourceRow[];
  series: FunnelSeriesPoint[];
}

export async function getMarketingFunnel(source?: string): Promise<{ data: MarketingFunnel }> {
  const res = await api.get('/api/analytics/marketing-funnel', {
    params: source && source !== 'all' ? { source } : undefined,
  });
  return res.data;
}