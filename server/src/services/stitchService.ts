import { withAdminClient, query } from '../config/database';
import logger from '../config/logger';

/**
 * Stitch / Tailoring Module — business logic linking garment customization
 * orders to Core Membership (Architecture Audit: Core Membership ↔ Stitch).
 *
 * Two hard rules enforced here:
 *  1. SUBSCRIPTION GUARD — a stitch order can ONLY be completed (the
 *     irreversible `completed` state) for a member whose subscription is
 *     currently `active`. This prevents delivering custom garments to a
 *     member whose membership is `expired` (or any non-active status).
 *  2. AUTO-INVOICE — completing an order atomically creates a POS order +
 *     a financial income transaction, so tailoring revenue is unified with
 *     the Billing Engine instead of being tracked in a silo.
 *  3. LOYALTY — the member earns loyalty points on the completed order.
 */

export interface CompleteStitchResult {
  orderId: string;
  posOrderId: string;
  transactionId: string;
  pointsEarned: number;
}

export class StitchGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StitchGuardError';
  }
}

/**
 * Complete a stitch order: enforce the subscription guard, mark it
 * completed, and create the linked POS order + financial transaction +
 * loyalty points in a single transaction.
 */
export async function completeStitchOrder(
  orderId: string,
  staffUserId: string,
  price: number,
  opts: { earnLoyalty?: boolean } = {}
): Promise<CompleteStitchResult> {
  const earnLoyalty = opts.earnLoyalty ?? true;

  return withAdminClient(async (client) => {
    // 1. Load the order + its member + gym
    const orderRes = await client.query(
      `SELECT id, gym_id, member_id, order_status
       FROM stitch_orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (orderRes.rows.length === 0) {
      throw new StitchGuardError('Stitch order not found.');
    }
    const order = orderRes.rows[0];
    if (order.order_status === 'completed' || order.order_status === 'cancelled') {
      throw new StitchGuardError(
        `Cannot complete a stitch order that is already ${order.order_status}.`
      );
    }

    // 2. SUBSCRIPTION GUARD — member must have an ACTIVE subscription
    const subRes = await client.query(
      `SELECT id, status FROM member_subscriptions
       WHERE member_id = $1 AND gym_id = $2
       ORDER BY end_date DESC LIMIT 1`,
      [order.member_id, order.gym_id]
    );
    const latest = subRes.rows[0];
    if (!latest || latest.status !== 'active') {
      throw new StitchGuardError(
        'Member subscription is not active — stitch order completion blocked.'
      );
    }

    // 3. Mark the order completed
    await client.query(
      `UPDATE stitch_orders SET order_status = 'completed' WHERE id = $1`,
      [orderId]
    );

    // 4. AUTO-INVOICE — POS order + financial income transaction
    const posRes = await client.query(
      `INSERT INTO pos_orders (gym_id, staff_user_id, member_id, total_amount, payment_method)
       VALUES ($1, $2, $3, $4, 'stitch')
       RETURNING id`,
      [order.gym_id, staffUserId, order.member_id, price]
    );
    const posOrderId = posRes.rows[0].id;

    const finRes = await client.query(
      `INSERT INTO financial_transactions
         (gym_id, staff_user_id, type, amount, description)
       VALUES ($1, $2, 'income', $3, $4)
       RETURNING id`,
      [
        order.gym_id,
        staffUserId,
        price,
        `Stitch order ${orderId} — custom garment`,
      ]
    );
    const transactionId = finRes.rows[0].id;

    // 5. LOYALTY — 1 point per whole 10 currency units (rounded down)
    let pointsEarned = 0;
    if (earnLoyalty && price > 0) {
      pointsEarned = Math.floor(price / 10);
      if (pointsEarned > 0) {
        await client.query(
          `INSERT INTO loyalty_transactions
             (member_id, gym_id, points, type, reason, reference_type, reference_id)
           VALUES ($1, $2, $3, 'earn', 'stitch_order_completed', 'stitch_order', $4)`,
          [order.member_id, order.gym_id, pointsEarned, orderId]
        );
        await client.query(
          `INSERT INTO loyalty_points (member_id, gym_id, points_earned, points_redeemed, points_balance, tier)
           VALUES ($1, $2, $3, 0, $3, 'bronze')
           ON CONFLICT (member_id, gym_id) DO UPDATE
             SET points_earned = loyalty_points.points_earned + $3,
                 points_balance = loyalty_points.points_balance + $3,
                 updated_at = NOW()`,
          [order.member_id, order.gym_id, pointsEarned]
        );
      }
    }

    return { orderId, posOrderId, transactionId, pointsEarned };
  });
}

/**
 * List stitch orders for a gym (tenant-scoped via RLS — uses the shared
 * query() so app.gym_id filtering applies automatically).
 */
export async function listStitchOrders(gymId: string, status?: string) {
  const params: unknown[] = [gymId];
  let sql = `SELECT id, member_id, size_chest, size_waist, design_notes,
                    order_status, created_at
             FROM stitch_orders WHERE gym_id = $1`;
  if (status) {
    params.push(status);
    sql += ` AND order_status = $${params.length}`;
  }
  sql += ' ORDER BY created_at DESC';
  const res = await query(sql, params);
  return res.rows;
}

/**
 * Get a single stitch order (tenant-scoped).
 */
export async function getStitchOrder(orderId: string) {
  const res = await query(
    `SELECT id, gym_id, member_id, size_chest, size_waist, design_notes,
            order_status, created_at FROM stitch_orders WHERE id = $1`,
    [orderId]
  );
  return res.rows[0] || null;
}
