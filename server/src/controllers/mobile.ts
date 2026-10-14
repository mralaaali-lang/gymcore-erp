import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query, getAdminClient } from '../config/database';
import logger from '../config/logger';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

export async function memberLogin(req: Request, res: Response): Promise<void> {
  const { phone, pin } = req.body;
  try {
    const adminClient = await getAdminClient();
    let candidates;
    try {
      const result = await adminClient.query(
        `SELECT m.id, m.full_name, m.phone_number, m.email, m.photo_url, m.gym_id, m.pin_code_hash
         FROM members m WHERE m.phone_number = $1 OR m.phone_hash = phone_hash($1)`,
        [phone]
      );
      await adminClient.query('COMMIT');
      candidates = result.rows;
    } catch (e) {
      await adminClient.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      adminClient.release();
    }

    let member = null;
    for (const candidate of candidates) {
      if (candidate.pin_code_hash && await bcrypt.compare(pin, candidate.pin_code_hash)) {
        member = candidate;
        break;
      }
    }

    if (!member) {
      res.status(401).json({ error: 'رقم الهاتف أو الرمز السري غير صحيح' });
      return;
    }
    delete member.pin_code_hash;
    const token = jwt.sign(
      { member_id: member.id, gym_id: member.gym_id, role: 'member' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ member });
  } catch (error) {
    logger.error('Member login failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getMyProfile(req: Request, res: Response): Promise<void> {
  const memberId = req.staff?.member_id;
  const gymId = req.staff?.gym_id;
  try {
    const result = await query(
      `SELECT id, full_name, decrypt_sensitive(phone_encrypted) as phone_number, email, photo_url, birth_date FROM members WHERE id = $1 AND gym_id = $2`,
      [memberId, gymId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Member not found' }); return; }
    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error('Get my profile failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getMyVisits(req: Request, res: Response): Promise<void> {
  const memberId = req.staff?.member_id;
  const gymId = req.staff?.gym_id;
  try {
    const result = await query(
      `SELECT id, check_in_time, entry_method FROM attendance_logs WHERE member_id = $1 AND gym_id = $2 ORDER BY check_in_time DESC LIMIT 20`,
      [memberId, gymId]
    );
    res.json({ data: result.rows });
  } catch (error) {
    logger.error('Get my visits failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getMySubscription(req: Request, res: Response): Promise<void> {
  const memberId = req.staff?.member_id;
  const gymId = req.staff?.gym_id;
  try {
    const result = await query(
      `SELECT ms.*, mo.title AS plan_name FROM member_subscriptions ms LEFT JOIN membership_offers mo ON ms.offer_id = mo.id WHERE ms.member_id = $1 AND ms.gym_id = $2 ORDER BY ms.created_at DESC LIMIT 1`,
      [memberId, gymId]
    );
    res.json({ data: result.rows[0] || null });
  } catch (error) {
    logger.error('Get my subscription failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getUpcomingClasses(req: Request, res: Response): Promise<void> {
  // §37ب — هذا الدالة كانت تقرأ أعمدة غير موجودة (fc.name/day/trainer_id/
  // is_active) وهوية من req.member التي لا يملؤها أي middleware — أي أنها
  // كانت تنهار 500 لكل عضو. الصيغة الآن على السكيما الحقيقية (migration 001:
  // title/coach_id/is_cancelled) وهوية req.staff كما في بقية مسارات الأعضاء.
  const gymId = req.staff?.gym_id;
  try {
    const result = await query(
      `SELECT fc.id, fc.title AS name, fc.start_time, fc.end_time, fc.capacity,
              su.full_name AS trainer_name,
              COALESCE((SELECT COUNT(*) FROM class_bookings cb
                        WHERE cb.class_id = fc.id AND cb.status = 'confirmed'), 0)::int AS booked
       FROM fitness_classes fc
       LEFT JOIN staff_users su ON su.id = fc.coach_id
       WHERE fc.gym_id = $1 AND fc.is_cancelled = false
         AND fc.start_time >= CURRENT_TIMESTAMP
       ORDER BY fc.start_time
       LIMIT 50`,
      [gymId]
    );
    res.json({ data: result.rows });
  } catch (error) {
    logger.error('Get upcoming classes failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getMyPoints(req: Request, res: Response): Promise<void> {
  const memberId = req.staff?.member_id;
  const gymId = req.staff?.gym_id;
  try {
    const result = await query(
      `SELECT la.current_points AS points_balance, LOWER(COALESCE(lt.name, 'bronze')) AS tier
       FROM loyalty_accounts la
       LEFT JOIN loyalty_tiers lt ON lt.id = la.tier_id
       WHERE la.member_id = $1 AND la.gym_id = $2`,
      [memberId, gymId]
    );
    res.json({ data: result.rows[0] || { points_balance: 0, tier: 'bronze' } });
  } catch (error) {
    logger.error('Get my points failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getMy360(req: Request, res: Response): Promise<void> {
  const memberId = req.staff?.member_id;
  const gymId = req.staff?.gym_id;
  try {
    const memberResult = await query(
      `SELECT id, full_name, decrypt_sensitive(phone_encrypted) as phone_number, email, photo_url, is_blacklisted, created_at FROM members WHERE id = $1 AND gym_id = $2`,
      [memberId, gymId]
    );
    if (memberResult.rows.length === 0) { res.status(404).json({ error: 'Member not found' }); return; }
    const member = memberResult.rows[0];
    const [subResult, attResult, payResult, loyResult, statResult] = await Promise.all([
      query(`SELECT ms.*, mo.title AS plan_name FROM member_subscriptions ms LEFT JOIN membership_offers mo ON ms.offer_id = mo.id WHERE ms.member_id = $1 AND ms.gym_id = $2 ORDER BY ms.created_at DESC`, [memberId, gymId]),
      query(`SELECT id, check_in_time, entry_method FROM attendance_logs WHERE member_id = $1 AND gym_id = $2 ORDER BY check_in_time DESC LIMIT 30`, [memberId, gymId]),
      // §34ث: real payment_method (not a fake 'cash') and scoped to this member.
      query(`SELECT id, created_at, amount, description, payment_method FROM financial_transactions WHERE gym_id = $1 AND type = 'payment' AND member_id = $2 ORDER BY created_at DESC LIMIT 20`, [gymId, memberId]),
      query(`SELECT la.current_points AS points_balance, LOWER(COALESCE(lt.name, 'bronze')) AS tier
       FROM loyalty_accounts la LEFT JOIN loyalty_tiers lt ON lt.id = la.tier_id
       WHERE la.member_id = $1 AND la.gym_id = $2`, [memberId, gymId]),
      query(`SELECT COUNT(*) AS total_checkins, COUNT(*) FILTER (WHERE check_in_time >= CURRENT_DATE - INTERVAL '30 days') AS checkins_30d, COUNT(*) FILTER (WHERE check_in_time >= CURRENT_DATE - INTERVAL '7 days') AS checkins_7d, MAX(check_in_time) AS last_checkin FROM attendance_logs WHERE member_id = $1 AND gym_id = $2`, [memberId, gymId]),
    ]);
    res.json({
      data: {
        profile: member,
        subscriptions: subResult.rows,
        attendance: attResult.rows,
        payments: payResult.rows,
        loyalty: loyResult.rows[0] || { points_balance: 0, tier: 'bronze' },
        stats: statResult.rows[0],
      },
    });
  } catch (error) {
    logger.error('Get my 360 failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ====================================================================
// PUSH NOTIFICATION TOKEN REGISTRATION
// ====================================================================

export async function registerPushToken(req: Request, res: Response): Promise<void> {
  const memberId = req.staff?.member_id;
  const gymId = req.staff?.gym_id;
  const { token, platform, device_name } = req.body;

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Push token is required.' });
    return;
  }

  try {
    // Upsert: if the same member registers the same token again, update it
    await query(
      `INSERT INTO push_tokens (member_id, gym_id, expo_token, platform, device_name, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
       ON CONFLICT (member_id, expo_token)
       DO UPDATE SET platform = EXCLUDED.platform,
                     device_name = EXCLUDED.device_name,
                     is_active = true,
                     updated_at = CURRENT_TIMESTAMP`,
      [memberId, gymId, token, platform || 'unknown', device_name || null]
    );

    logger.info('Push token registered', {
      memberId,
      gymId,
      platform: platform || 'unknown',
    });

    res.json({ success: true, message: 'Push token registered.' });
  } catch (error) {
    logger.error('Failed to register push token', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function unregisterPushToken(req: Request, res: Response): Promise<void> {
  const memberId = req.staff?.member_id;
  const gymId = req.staff?.gym_id;
  const { token } = req.body;

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Push token is required.' });
    return;
  }

  try {
    // Soft delete — mark as inactive
    await query(
      `UPDATE push_tokens SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE member_id = $1 AND gym_id = $2 AND expo_token = $3`,
      [memberId, gymId, token]
    );

    res.json({ success: true, message: 'Push token unregistered.' });
  } catch (error) {
    logger.error('Failed to unregister push token', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}
