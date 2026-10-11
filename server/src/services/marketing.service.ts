/**
 * marketing.service.ts — Marketing campaigns, broadcasts, referrals
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// --- Campaigns ---

export async function createCampaign(input: {
  name: string;
  name_ar?: string;
  type: string;
  gym_id?: string;
  platform_wide?: boolean;
  budget?: number;
  target_audience?: object;
  start_date?: string;
  end_date?: string;
  created_by?: string;
}) {
  const result = await pool.query(
    `INSERT INTO marketing_campaigns (
      id, name, name_ar, type, gym_id, platform_wide, budget,
      target_audience, start_date, end_date, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      uuidv4(), input.name, input.name_ar ?? null, input.type,
      input.gym_id ?? null, input.platform_wide ?? false,
      input.budget ?? 0, JSON.stringify(input.target_audience ?? {}),
      input.start_date ?? null, input.end_date ?? null,
      input.created_by ?? null,
    ]
  );
  return result.rows[0];
}

export async function getCampaigns(filters: {
  gym_id?: string;
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ campaigns: any[]; total: number }> {
  const { gym_id, status, type, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM marketing_campaigns WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;

  if (gym_id) { query += ` AND gym_id = $${idx++}`; params.push(gym_id); }
  if (status) { query += ` AND status = $${idx++}`; params.push(status); }
  if (type) { query += ` AND type = $${idx++}`; params.push(type); }

  query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  let countQuery = 'SELECT COUNT(*) as total FROM marketing_campaigns WHERE 1=1';
  const countParams: unknown[] = [];
  let countIdx = 1;
  if (gym_id) { countQuery += ` AND gym_id = $${countIdx++}`; countParams.push(gym_id); }
  if (status) { countQuery += ` AND status = $${countIdx++}`; countParams.push(status); }
  if (type) { countQuery += ` AND type = $${countIdx++}`; countParams.push(type); }
  const countResult = await pool.query(countQuery, countParams);

  return { campaigns: result.rows, total: parseInt(countResult.rows[0].total, 10) };
}

export async function updateCampaignStatus(
  campaignId: string,
  status: string
): Promise<any> {
  const result = await pool.query(
    `UPDATE marketing_campaigns SET status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [campaignId, status]
  );
  return result.rows[0] ?? null;
}

// --- Broadcasts ---

export async function createBroadcast(input: {
  campaign_id?: string;
  subject: string;
  content: string;
  target_type: string;
  target_filter?: object;
  scheduled_at?: string;
  created_by?: string;
}) {
  const result = await pool.query(
    `INSERT INTO marketing_broadcasts (
      id, campaign_id, subject, content, target_type,
      target_filter, scheduled_at, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      uuidv4(), input.campaign_id ?? null, input.subject, input.content,
      input.target_type, JSON.stringify(input.target_filter ?? {}),
      input.scheduled_at ?? null, input.created_by ?? null,
    ]
  );
  return result.rows[0];
}

export async function getBroadcasts(filters: {
  campaign_id?: string;
  status?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ broadcasts: any[]; total: number }> {
  const { campaign_id, status, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM marketing_broadcasts WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;

  if (campaign_id) { query += ` AND campaign_id = $${idx++}`; params.push(campaign_id); }
  if (status) { query += ` AND status = $${idx++}`; params.push(status); }

  query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  let countQuery = 'SELECT COUNT(*) as total FROM marketing_broadcasts WHERE 1=1';
  const countParams: unknown[] = [];
  let countIdx = 1;
  if (campaign_id) { countQuery += ` AND campaign_id = $${countIdx++}`; countParams.push(campaign_id); }
  if (status) { countQuery += ` AND status = $${countIdx++}`; countParams.push(status); }
  const countResult = await pool.query(countQuery, countParams);

  return { broadcasts: result.rows, total: parseInt(countResult.rows[0].total, 10) };
}

// --- Referrals ---

export async function createReferral(input: {
  referrer_gym_id: string;
  referred_member_id: string;
  referrer_member_id?: string;
  referral_code: string;
  campaign_id?: string;
}) {
  const result = await pool.query(
    `INSERT INTO marketing_referrals (
      id, referrer_gym_id, referred_member_id, referrer_member_id,
      referral_code, campaign_id
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      uuidv4(), input.referrer_gym_id, input.referred_member_id,
      input.referrer_member_id ?? null, input.referral_code,
      input.campaign_id ?? null,
    ]
  );
  return result.rows[0];
}

export async function getReferrals(filters: {
  referrer_gym_id?: string;
  referred_member_id?: string;
  status?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ referrals: any[]; total: number }> {
  const { referrer_gym_id, referred_member_id, status, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM marketing_referrals WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;

  if (referrer_gym_id) { query += ` AND referrer_gym_id = $${idx++}`; params.push(referrer_gym_id); }
  if (referred_member_id) { query += ` AND referred_member_id = $${idx++}`; params.push(referred_member_id); }
  if (status) { query += ` AND status = $${idx++}`; params.push(status); }

  query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  let countQuery = 'SELECT COUNT(*) as total FROM marketing_referrals WHERE 1=1';
  const countParams: unknown[] = [];
  let countIdx = 1;
  if (referrer_gym_id) { countQuery += ` AND referrer_gym_id = $${countIdx++}`; countParams.push(referrer_gym_id); }
  if (referred_member_id) { countQuery += ` AND referred_member_id = $${countIdx++}`; countParams.push(referred_member_id); }
  if (status) { countQuery += ` AND status = $${countIdx++}`; countParams.push(status); }
  const countResult = await pool.query(countQuery, countParams);

  return { referrals: result.rows, total: parseInt(countResult.rows[0].total, 10) };
}

export async function completeReferral(referralId: string): Promise<any> {
  const result = await pool.query(
    `UPDATE marketing_referrals SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [referralId]
  );
  return result.rows[0] ?? null;
}
