import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

export async function getCustomer360(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { member_id } = req.params;
  try {
    const memberResult = await query(
      `SELECT id, full_name, decrypt_sensitive(phone_encrypted) as phone_number, email, birth_date, photo_url, medical_notes, is_blacklisted, created_at
       FROM members WHERE id = $1 AND gym_id = $2`,
      [member_id, gym_id]
    );
    if (memberResult.rows.length === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    const member = memberResult.rows[0];
    const subscriptionResult = await query(
      `SELECT ms.*, mo.title AS plan_name
       FROM member_subscriptions ms
       LEFT JOIN membership_offers mo ON ms.offer_id = mo.id
       WHERE ms.member_id = $1 AND ms.gym_id = $2
       ORDER BY ms.created_at DESC`,
      [member_id, gym_id]
    );
    const attendanceResult = await query(
      `SELECT al.id, al.check_in_time, al.entry_method, al.verified_by_staff_id, su.full_name AS verified_by_name
       FROM attendance_logs al
       LEFT JOIN staff_users su ON al.verified_by_staff_id = su.id
       WHERE al.member_id = $1 AND al.gym_id = $2
       ORDER BY al.check_in_time DESC
       LIMIT 30`,
      [member_id, gym_id]
    );
    const paymentsResult = await query(
      `SELECT id, created_at, amount, description, 'cash' AS payment_method
       FROM financial_transactions
       WHERE gym_id = $1 AND type = 'payment'
       ORDER BY created_at DESC LIMIT 20`,
      [gym_id]
    );
    const loyaltyResult = await query(
      `SELECT points_balance, tier, points_earned, points_redeemed
       FROM loyalty_points WHERE member_id = $1 AND gym_id = $2`,
      [member_id, gym_id]
    );
    const checkinResult = await query(
      `SELECT COUNT(*) AS total_checkins,
              COUNT(*) FILTER (WHERE check_in_time >= CURRENT_DATE - INTERVAL '30 days') AS checkins_30d,
              COUNT(*) FILTER (WHERE check_in_time >= CURRENT_DATE - INTERVAL '7 days') AS checkins_7d,
              MAX(check_in_time) AS last_checkin
       FROM attendance_logs WHERE member_id = $1 AND gym_id = $2`,
      [member_id, gym_id]
    );
    res.status(200).json({
      data: {
        profile: member,
        subscriptions: subscriptionResult.rows,
        attendance: attendanceResult.rows,
        payments: paymentsResult.rows,
        loyalty: loyaltyResult.rows[0] || { points_balance: 0, tier: 'bronze', points_earned: 0, points_redeemed: 0 },
        stats: checkinResult.rows[0],
      },
    });
  } catch (error) {
    logger.error('Customer 360 query failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getMemberSearch(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { q } = req.query;
  try {
    if (!q || String(q).trim().length < 2) {
      res.status(400).json({ error: 'Provide at least 2 characters to search' });
      return;
    }
    const result = await query(
      `SELECT id, full_name, decrypt_sensitive(phone_encrypted) as phone_number, photo_url,
              (SELECT COUNT(*) FROM attendance_logs al WHERE al.member_id = m.id AND al.gym_id = m.gym_id AND al.check_in_time >= CURRENT_DATE - INTERVAL '30 days') AS checkins_30d,
              (SELECT status FROM member_subscriptions WHERE member_id = m.id AND gym_id = m.gym_id ORDER BY created_at DESC LIMIT 1) AS sub_status
       FROM members m
       WHERE m.gym_id = $1 AND (m.full_name ILIKE $2 OR m.phone_number ILIKE $2 OR m.phone_hash = phone_hash($3))
       ORDER BY m.full_name ASC
       LIMIT 20`,
      [gym_id, `%${String(q).trim()}%`, String(q).trim()]
    );
    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Member search failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}
