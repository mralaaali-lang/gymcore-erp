/**
 * loyalty.service.ts — Loyalty program: tiers, rewards, member points
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface LoyaltySettings {
  points_per_currency: number;
  min_redemption_points: number;
  points_expiry_days: number;
  max_points_per_transaction: number;
  allow_partial_redemption: boolean;
}

export interface LoyaltyAccount {
  id: string;
  member_id: string;
  gym_id: string;
  tier_id: string | null;
  current_points: number;
  lifetime_points: number;
  total_redeemed: number;
  total_expired: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Tier {
  id: string;
  name: string;
  name_ar: string;
  level: number;
  color: string;
  min_points: number;
  discount_percent: number;
  free_subscription_months: number;
  benefits: unknown[];
  is_active: boolean;
}

/**
 * Get loyalty settings for a gym (or global defaults)
 */
export async function getLoyaltySettings(gym_id?: string): Promise<LoyaltySettings> {
  if (gym_id) {
    const result = await pool.query(
      'SELECT * FROM loyalty_settings WHERE gym_id = $1',
      [gym_id]
    );
    if (result.rows[0]) {
      return normalizeSettings(result.rows[0]);
    }
  }
  // Return defaults
  return {
    points_per_currency: 10,
    min_redemption_points: 100,
    points_expiry_days: 365,
    max_points_per_transaction: 10000,
    allow_partial_redemption: true,
  };
}

/**
 * Get or create loyalty account for a member
 */
export async function getOrCreateAccount(
  memberId: string,
  gymId: string
): Promise<LoyaltyAccount> {
  // Try to find existing account
  let result = await pool.query(
    'SELECT * FROM loyalty_accounts WHERE member_id = $1 AND gym_id = $2',
    [memberId, gymId]
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  // Create new account
  result = await pool.query(
    `INSERT INTO loyalty_accounts (id, member_id, gym_id, current_points, lifetime_points)
     VALUES ($1, $2, $3, 0, 0)
     RETURNING *`,
    [uuidv4(), memberId, gymId]
  );

  return result.rows[0];
}

/**
 * Add points to a member's account
 */
export async function addPoints(
  accountId: string,
  points: number,
  description?: string,
  referenceType?: string,
  referenceId?: string,
  createdBy?: string
): Promise<any> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current balance
    const accountResult = await client.query(
      'SELECT current_points, lifetime_points FROM loyalty_accounts WHERE id = $1',
      [accountId]
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error('Account not found');

    const newBalance = account.current_points + points;

    // Update account
    await client.query(
      `UPDATE loyalty_accounts
       SET current_points = $2, lifetime_points = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [accountId, newBalance, account.lifetime_points + points]
    );

    // Log transaction
    const txResult = await client.query(
      `INSERT INTO loyalty_transactions (
        id, account_id, type, points, balance_after, description,
        reference_type, reference_id, created_by
      ) VALUES ($1, $2, 'earned', $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [uuidv4(), accountId, points, newBalance, description ?? null,
       referenceType ?? null, referenceId ?? null, createdBy ?? null]
    );

    await client.query('COMMIT');
    return txResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Redeem points from a member's account
 */
export async function redeemPoints(
  accountId: string,
  points: number,
  description?: string,
  referenceType?: string,
  referenceId?: string,
  createdBy?: string
): Promise<any> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const accountResult = await client.query(
      'SELECT current_points FROM loyalty_accounts WHERE id = $1',
      [accountId]
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error('Account not found');
    if (account.current_points < points) {
      throw new Error('Insufficient points');
    }

    const newBalance = account.current_points - points;

    await client.query(
      `UPDATE loyalty_accounts
       SET current_points = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [accountId, newBalance]
    );

    const txResult = await client.query(
      `INSERT INTO loyalty_transactions (
        id, account_id, type, points, balance_after, description,
        reference_type, reference_id, created_by
      ) VALUES ($1, $2, 'redeemed', $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [uuidv4(), accountId, -points, newBalance, description ?? null,
       referenceType ?? null, referenceId ?? null, createdBy ?? null]
    );

    await client.query('COMMIT');
    return txResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get tier for a given points balance
 */
export async function getTierForPoints(points: number): Promise<Tier | null> {
  const result = await pool.query(
    `SELECT * FROM loyalty_tiers
     WHERE is_active = true AND min_points <= $1
     ORDER BY min_points DESC LIMIT 1`,
    [points]
  );
  return result.rows[0] ?? null;
}

/**
 * Get rewards catalog for a gym
 */
export async function getRewards(gymId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM loyalty_rewards
     WHERE gym_id = $1 AND is_active = true
     AND (starts_at IS NULL OR starts_at <= NOW())
     AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY points_cost ASC`,
    [gymId]
  );
  return result.rows;
}

/**
 * Claim a reward
 */
export async function claimReward(
  accountId: string,
  rewardId: string,
  gymId: string
): Promise<any> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const account = await client.query(
      'SELECT * FROM loyalty_accounts WHERE id = $1',
      [accountId]
    );
    if (!account.rows[0]) throw new Error('Account not found');
    const acc = account.rows[0];

    const reward = await client.query(
      'SELECT * FROM loyalty_rewards WHERE id = $1 AND gym_id = $2 AND is_active = true',
      [rewardId, gymId]
    );
    if (!reward.rows[0]) throw new Error('Reward not found');
    const rew = reward.rows[0];

    if (acc.current_points < rew.points_cost) {
      throw new Error('Insufficient points');
    }

    if (rew.max_claims_per_member <= rew.claims_count) {
      throw new Error('Reward claim limit reached');
    }

    // Deduct points
    await client.query(
      'UPDATE loyalty_accounts SET current_points = current_points - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [rew.points_cost, accountId]
    );

    // Increment claim count
    await client.query(
      'UPDATE loyalty_rewards SET claims_count = claims_count + 1 WHERE id = $1',
      [rewardId]
    );

    // Log redemption
    const txResult = await client.query(
      `INSERT INTO loyalty_transactions (
        id, account_id, type, points, balance_after, description
      ) VALUES ($1, $2, 'redeemed', $3, $4, $5)
      RETURNING *`,
      [uuidv4(), accountId, -rew.points_cost,
       acc.current_points - rew.points_cost,
       `Redeemed: ${rew.name}`]
    );

    await client.query('COMMIT');
    return txResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function normalizeSettings(row: any): LoyaltySettings {
  return {
    points_per_currency: row.points_per_currency ?? 10,
    min_redemption_points: row.min_redemption_points ?? 100,
    points_expiry_days: row.points_expiry_days ?? 365,
    max_points_per_transaction: row.max_points_per_transaction ?? 10000,
    allow_partial_redemption: row.allow_partial_redemption ?? true,
  };
}
