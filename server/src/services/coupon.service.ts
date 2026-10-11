/**
 * coupon.service.ts — Coupon creation, validation, usage tracking, expiry
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface CouponCreateInput {
  code: string;
  gym_id?: string;
  platform_wide?: boolean;
  type: 'percentage' | 'fixed_amount';
  value: number;
  max_uses?: number;
  min_order_amount?: number;
  starts_at: string;
  expires_at: string;
  description?: string;
  created_by?: string;
}

export interface Coupon {
  id: string;
  code: string;
  gym_id: string | null;
  platform_wide: boolean;
  type: string;
  value: number;
  max_uses: number | null;
  used_count: number;
  min_order_amount: number;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CouponValidationResult {
  valid: boolean;
  coupon?: Coupon;
  error?: string;
}

/**
 * Create a new coupon
 */
export async function createCoupon(input: CouponCreateInput): Promise<Coupon> {
  const result = await pool.query(
    `INSERT INTO billing_coupons (
      code, gym_id, platform_wide, type, value, max_uses,
      min_order_amount, starts_at, expires_at, is_active, description, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      input.code, input.gym_id ?? null, input.platform_wide ?? false,
      input.type, input.value, input.max_uses ?? null,
      input.min_order_amount ?? 0, input.starts_at, input.expires_at,
      true, input.description ?? null, input.created_by ?? null,
    ]
  );
  return result.rows[0];
}

/**
 * Validate a coupon code
 */
export async function validateCoupon(
  code: string,
  gym_id?: string,
  orderAmount?: number
): Promise<CouponValidationResult> {
  const result = await pool.query(
    `SELECT * FROM billing_coupons WHERE code = $1 AND is_active = true`,
    [code]
  );

  const coupon = result.rows[0];
  if (!coupon) {
    return { valid: false, error: 'Coupon not found or inactive' };
  }

  // Check expiry
  const now = new Date();
  if (new Date(coupon.expires_at) < now) {
    return { valid: false, error: 'Coupon has expired' };
  }

  // Check start date
  if (new Date(coupon.starts_at) > now) {
    return { valid: false, error: 'Coupon is not yet active' };
  }

  // Check gym scope
  if (coupon.gym_id && coupon.gym_id !== gym_id && !coupon.platform_wide) {
    return { valid: false, error: 'Coupon is not valid for this gym' };
  }

  // Check min order amount
  if (orderAmount !== undefined && orderAmount < coupon.min_order_amount) {
    return {
      valid: false,
      error: `Minimum order amount is ${coupon.min_order_amount}`,
    };
  }

  // Check max uses
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { valid: false, error: 'Coupon has reached maximum uses' };
  }

  return { valid: true, coupon };
}

/**
 * Apply coupon discount to an amount
 */
export function applyCouponDiscount(
  amount: number,
  coupon: Coupon
): number {
  if (coupon.type === 'percentage') {
    const discount = amount * (coupon.value / 100);
    return Math.max(0, amount - discount);
  }
  // fixed_amount
  return Math.max(0, amount - coupon.value);
}

/**
 * Record coupon usage
 */
export async function recordCouponUsage(
  couponId: string,
  gymId: string,
  invoiceId?: string,
  usedAmount?: number
): Promise<any> {
  const result = await pool.query(
    `INSERT INTO billing_coupon_usage (id, coupon_id, gym_id, invoice_id, used_amount)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [uuidv4(), couponId, gymId, invoiceId ?? null, usedAmount ?? 0]
  );

  // Update coupon used_count
  await pool.query(
    `UPDATE billing_coupons SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [couponId]
  );

  return result.rows[0];
}

/**
 * Get coupons list for a gym
 */
export async function getCoupons(gym_id?: string, page = 1, limit = 20): Promise<{ coupons: Coupon[]; total: number }> {
  let query = 'SELECT * FROM billing_coupons WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;

  if (gym_id) {
    query += ` AND gym_id = $${idx++}`;
    params.push(gym_id);
  }

  query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, (page - 1) * limit);

  const result = await pool.query(query, params);

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM billing_coupons WHERE 1=1` +
    (gym_id ? ' AND gym_id = $1' : ''),
    gym_id ? [gym_id] : []
  );

  return {
    coupons: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
}

/**
 * Toggle coupon active state
 */
export async function toggleCoupon(couponId: string): Promise<Coupon | null> {
  const result = await pool.query(
    `UPDATE billing_coupons SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [couponId]
  );
  return result.rows[0] ?? null;
}
