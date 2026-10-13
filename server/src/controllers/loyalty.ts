import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

// ====================================================================
// LOYALTY — migrated to the 044 schema (§31).
//
// Migration 044 replaced the old loyalty_points/loyalty_redemptions
// tables with loyalty_accounts (per-member aggregate) +
// loyalty_tiers (data-driven thresholds) + loyalty_transactions
// (ledger keyed by account_id, type ∈ earned|redeemed|expired|
// adjusted|refunded) and dropped stock in favour of
// max_claims_per_member/claims_count on loyalty_rewards.
// All controllers here were still querying the dropped tables and
// 500'd at runtime — every response contract is preserved
// (points_balance/tier/points_earned/points_redeemed, tier lowercase).
// ====================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tier id for a lifetime-points total, from the seeded loyalty_tiers ladder.
 * Takes the placeholder string ($1/$3/...) of the enclosing query so the
 * subquery shares the correct parameter type (inlined SQL placeholders are
 * positional across the whole statement). */
const tierFor = (ph: string) =>
  `SELECT id FROM loyalty_tiers WHERE is_active AND min_points <= ${ph} ORDER BY min_points DESC LIMIT 1`;

/** Account aggregate row in the legacy response shape. */
const ACCOUNT_SELECT = `
  SELECT la.current_points AS points_balance,
         LOWER(COALESCE(lt.name, 'bronze')) AS tier,
         la.lifetime_points AS points_earned,
         la.total_redeemed AS points_redeemed,
         la.total_redeemed AS lifetime_redeemed,
         la.id AS account_id
  FROM loyalty_accounts la
  LEFT JOIN loyalty_tiers lt ON lt.id = la.tier_id
  WHERE la.member_id = $1 AND la.gym_id = $2`;

async function upsertAccount(member_id: string, gym_id: string, points: number) {
  const acc = await query(
    `INSERT INTO loyalty_accounts (member_id, gym_id, current_points, lifetime_points, tier_id)
     VALUES ($1, $2, $3, $3, (${tierFor('$3')}))
     ON CONFLICT (member_id, gym_id) DO UPDATE SET
       current_points = loyalty_accounts.current_points + $3,
       lifetime_points = loyalty_accounts.lifetime_points + $3,
       updated_at = NOW()
     RETURNING id, current_points, lifetime_points`,
    [member_id, gym_id, points]
  );
  const row = acc.rows[0];
  // Re-evaluate tier from lifetime points (upgrade/downgrade on thresholds).
  const tierRes = await query(
    `UPDATE loyalty_accounts SET tier_id = (${tierFor('$1')}) WHERE id = $2 RETURNING tier_id`,
    [row.lifetime_points, row.id]
  );
  return { id: row.id, current_points: row.current_points, lifetime_points: row.lifetime_points, tier_id: tierRes.rows[0]?.tier_id };
}

export async function getPointsBalance(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { member_id } = req.params;
  try {
    const result = await query(ACCOUNT_SELECT, [member_id, gym_id]);
    if (result.rows.length === 0) {
      res.status(200).json({ data: { points_balance: 0, tier: 'bronze', points_earned: 0, points_redeemed: 0, lifetime_redeemed: 0 } });
      return;
    }
    const { account_id, ...legacy } = result.rows[0];
    res.status(200).json({ data: legacy });
  } catch (error) {
    logger.error('Get points balance failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function earnPoints(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { member_id, points, reason, reference_type, reference_id } = req.body;
  if (!gym_id) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const account = await upsertAccount(member_id, gym_id, points);
    await query(
      `INSERT INTO loyalty_transactions (account_id, type, points, balance_after, description, reference_type, reference_id)
       VALUES ($1, 'earned', $2, $3, $4, $5, $6)`,
      [
        account.id,
        points,
        account.current_points,
        reason || null,
        reference_type || null,
        UUID_RE.test(String(reference_id || '')) ? reference_id : null,
      ]
    );
    const tierRes = await query(`SELECT LOWER(name) AS tier FROM loyalty_tiers WHERE id = $1`, [account.tier_id]);
    res.status(200).json({ success: true, points_balance: account.current_points, tier: tierRes.rows[0]?.tier || 'bronze' });
  } catch (error) {
    logger.error('Earn points failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function redeemPoints(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const member_id = req.body.member_id || req.staff?.member_id;
  const { reward_id } = req.body;
  try {
    const accResult = await query(
      `SELECT id, current_points FROM loyalty_accounts WHERE member_id = $1 AND gym_id = $2`,
      [member_id, gym_id]
    );
    if (accResult.rows.length === 0) {
      res.status(400).json({ error: 'رصيد النقاط غير كافٍ' });
      return;
    }
    const account = accResult.rows[0];
    const rewardResult = await query(
      `SELECT name, points_cost, max_claims_per_member, claims_count FROM loyalty_rewards
       WHERE id = $1 AND gym_id = $2 AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [reward_id, gym_id]
    );
    if (rewardResult.rows.length === 0) {
      res.status(404).json({ error: 'المكافأة غير موجودة' });
      return;
    }
    const reward = rewardResult.rows[0];
    const points_spent = req.body.points_spent ?? reward.points_cost;
    if (account.current_points < points_spent) {
      res.status(400).json({ error: 'رصيد النقاط غير كافٍ' });
      return;
    }
    // 044 model: stock replaced by per-member claim cap.
    if (reward.max_claims_per_member !== null && reward.max_claims_per_member >= 0) {
      const claimed = await query(
        `SELECT COUNT(*)::int AS n FROM loyalty_transactions
         WHERE account_id = $1 AND type = 'redeemed' AND reference_id = $2`,
        [account.id, reward_id]
      );
      if (claimed.rows[0].n >= reward.max_claims_per_member) {
        res.status(400).json({ error: 'تم استنفاد حد الاستبدال لهذه المكافأة' });
        return;
      }
    }
    await query(
      `UPDATE loyalty_accounts
       SET current_points = current_points - $1, total_redeemed = total_redeemed + $1, updated_at = NOW()
       WHERE id = $2`,
      [points_spent, account.id]
    );
    await query(
      `INSERT INTO loyalty_transactions (account_id, type, points, balance_after, description, reference_type, reference_id)
       VALUES ($1, 'redeemed', $2, $3, $4, 'reward', $5)`,
      [account.id, -points_spent, account.current_points - points_spent, `استبدال مكافأة: ${reward.name}`, reward_id]
    );
    await query(`UPDATE loyalty_rewards SET claims_count = claims_count + 1 WHERE id = $1`, [reward_id]);
    res.status(200).json({ success: true, message: `تم استبدال المكافأة بنجاح` });
  } catch (error) {
    logger.error('Redeem points failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function listRewards(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const result = await query(
      `SELECT * FROM loyalty_rewards WHERE gym_id = $1 AND is_active = true ORDER BY points_cost ASC`,
      [gym_id]
    );
    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('List rewards failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createReward(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { name, name_ar, description, points_cost, reward_type, reward_value, max_claims_per_member, starts_at, expires_at } = req.body;
  try {
    const result = await query(
      `INSERT INTO loyalty_rewards (gym_id, name, name_ar, description, points_cost, reward_type, reward_value, max_claims_per_member, starts_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [gym_id, name, name_ar || null, description || null, points_cost, reward_type, reward_value ?? null,
       max_claims_per_member ?? 1, starts_at || null, expires_at || null]
    );
    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (error) {
    logger.error('Create reward failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPointsHistory(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { member_id } = req.params;
  try {
    const result = await query(
      `SELECT lt.id, lt.type, lt.points, lt.balance_after, lt.description, lt.reference_type, lt.created_at
       FROM loyalty_transactions lt
       JOIN loyalty_accounts la ON la.id = lt.account_id
       WHERE la.member_id = $1 AND la.gym_id = $2
       ORDER BY lt.created_at DESC LIMIT 50`,
      [member_id, gym_id]
    );
    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Get points history failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}
