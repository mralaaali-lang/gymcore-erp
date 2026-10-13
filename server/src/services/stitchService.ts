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
        // §31: 044 schema — aggregate row in loyalty_accounts, ledger in
        // loyalty_transactions (keyed by account_id, type 'earned').
        const accRes = await client.query(
          `INSERT INTO loyalty_accounts (member_id, gym_id, current_points, lifetime_points, tier_id)
           VALUES ($1, $2, $3, $3, (SELECT id FROM loyalty_tiers WHERE is_active AND min_points <= $3 ORDER BY min_points DESC LIMIT 1))
           ON CONFLICT (member_id, gym_id) DO UPDATE SET
             current_points = loyalty_accounts.current_points + $3,
             lifetime_points = loyalty_accounts.lifetime_points + $3,
             updated_at = NOW()
           RETURNING id, current_points, lifetime_points`,
          [order.member_id, order.gym_id, pointsEarned]
        );
        const acc = accRes.rows[0];
        await client.query(
          `UPDATE loyalty_accounts SET tier_id =
             (SELECT id FROM loyalty_tiers WHERE is_active AND min_points <= lifetime_points ORDER BY min_points DESC LIMIT 1)
           WHERE id = $1`,
          [acc.id]
        );
        await client.query(
          `INSERT INTO loyalty_transactions (account_id, type, points, balance_after, description, reference_type, reference_id)
           VALUES ($1, 'earned', $2, $3, 'stitch_order_completed', 'stitch_order', $4)`,
          [acc.id, pointsEarned, acc.current_points, orderId]
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
