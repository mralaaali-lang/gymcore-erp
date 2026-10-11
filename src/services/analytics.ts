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