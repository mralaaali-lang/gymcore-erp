import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

export async function getPointsBalance(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { member_id } = req.params;
  try {
    const result = await query(
      `SELECT lp.points_balance, lp.tier, lp.points_earned, lp.points_redeemed,
              COALESCE((SELECT SUM(lr.points_cost) AS lifetime_value
               FROM loyalty_redemptions lr WHERE lr.member_id = lp.member_id AND lr.gym_id = lp.gym_id), 0) AS lifetime_redeemed
       FROM loyalty_points lp WHERE lp.member_id = $1 AND lp.gym_id = $2`,
      [member_id, gym_id]
    );
    if (result.rows.length === 0) {
      res.status(200).json({ data: { points_balance: 0, tier: 'bronze', points_earned: 0, points_redeemed: 0, lifetime_redeemed: 0 } });
      return;
    }
    res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    logger.error('Get points balance failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function earnPoints(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { member_id, points, reason, reference_type, reference_id } = req.body;
  try {
    await query(`INSERT INTO loyalty_transactions (member_id, gym_id, points, type, reason, reference_type, reference_id) VALUES ($1, $2, $3, 'earn', $4, $5, $6)`,
      [member_id, gym_id, points, reason, reference_type || null, reference_id || null]);
    const updated = await query(
      `INSERT INTO loyalty_points (member_id, gym_id, points_earned, points_balance)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (member_id, gym_id)
       DO UPDATE SET points_earned = loyalty_points.points_earned + $3,
                     points_balance = loyalty_points.points_balance + $3,
                     updated_at = NOW()
       RETURNING points_balance, tier`,
      [member_id, gym_id, points]
    );
    const balance = updated.rows[0].points_balance;
    let newTier = 'bronze';
    if (balance >= 10000) newTier = 'platinum';
    else if (balance >= 5000) newTier = 'gold';
    else if (balance >= 2000) newTier = 'silver';
    await query(`UPDATE loyalty_points SET tier = $1 WHERE member_id = $2 AND gym_id = $3`, [newTier, member_id, gym_id]);
    res.status(200).json({ success: true, points_balance: balance, tier: newTier });
  } catch (error) {
    logger.error('Earn points failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function redeemPoints(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { member_id, reward_id, points_spent } = req.body;
  try {
    const balanceResult = await query(
      `SELECT points_balance FROM loyalty_points WHERE member_id = $1 AND gym_id = $2`,
      [member_id, gym_id]
    );
    if (balanceResult.rows.length === 0 || balanceResult.rows[0].points_balance < points_spent) {
      res.status(400).json({ error: 'رصيد النقاط غير كافٍ' });
      return;
    }
    const rewardResult = await query(
      `SELECT name, stock FROM loyalty_rewards WHERE id = $1 AND gym_id = $2 AND is_active = true`,
      [reward_id, gym_id]
    );
    if (rewardResult.rows.length === 0) {
      res.status(404).json({ error: 'المكافأة غير موجودة' });
      return;
    }
    const reward = rewardResult.rows[0];
    if (reward.stock !== -1 && reward.stock <= 0) {
      res.status(400).json({ error: 'المكافأة نفدت من المخزون' });
      return;
    }
    await query(
      `INSERT INTO loyalty_redemptions (member_id, gym_id, reward_id, points_spent, status) VALUES ($1, $2, $3, $4, 'completed')`,
      [member_id, gym_id, reward_id, points_spent]
    );
    await query(
      `INSERT INTO loyalty_transactions (member_id, gym_id, points, type, reason, reference_type, reference_id) VALUES ($1, $2, $3, 'redeem', $4, 'reward', $5)`,
      [member_id, gym_id, -points_spent, `استبدال مكافأة: ${reward.name}`, reward_id]
    );
    await query(
      `UPDATE loyalty_points SET points_balance = points_balance - $1, points_redeemed = points_redeemed + $1, updated_at = NOW() WHERE member_id = $2 AND gym_id = $3`,
      [points_spent, member_id, gym_id]
    );
    if (reward.stock !== -1) {
      await query(`UPDATE loyalty_rewards SET stock = stock - 1 WHERE id = $1`, [reward_id]);
    }
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
  const { name, description, points_cost, reward_type, reward_value, stock } = req.body;
  try {
    const result = await query(
      `INSERT INTO loyalty_rewards (gym_id, name, description, points_cost, reward_type, reward_value, stock) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [gym_id, name, description, points_cost, reward_type, reward_value, stock ?? -1]
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
      `SELECT * FROM loyalty_transactions WHERE member_id = $1 AND gym_id = $2 ORDER BY created_at DESC LIMIT 50`,
      [member_id, gym_id]
    );
    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Get points history failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}
