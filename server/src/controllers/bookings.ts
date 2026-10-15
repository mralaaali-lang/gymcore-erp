import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import logger from '../config/logger';

export const bookFitnessClass = async (req: Request, res: Response): Promise<void> => {
  const { class_id } = req.body;
  const member_id = req.staff?.member_id;
  const gym_id = req.staff?.gym_id;

  if (!class_id) {
    res.status(400).json({ error: 'Class ID is required.' });
    return;
  }

  if (!member_id) {
    res.status(401).json({ error: 'Member authentication required.' });
    return;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const subCheck = await client.query(
      `SELECT id FROM member_subscriptions
       WHERE member_id = $1 AND gym_id = $2 AND status = 'active' AND end_date >= CURRENT_DATE
       LIMIT 1`,
      [member_id, gym_id]
    );

    if (subCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Active subscription required to book a class.' });
      return;
    }

    const classCheck = await client.query(
      `SELECT capacity, title, start_time, is_cancelled,
              (SELECT COUNT(*) FROM class_bookings WHERE class_id = $1 AND status = 'confirmed')::int as booked_count
       FROM fitness_classes
       WHERE id = $1 AND gym_id = $2 AND is_cancelled = false
       FOR UPDATE`,
      [class_id, gym_id]
    );

    if (classCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Class not found or has been cancelled.' });
      return;
    }

    const { capacity, booked_count, title, start_time } = classCheck.rows[0];

    if (new Date(start_time) < new Date()) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Cannot book a class that has already started.' });
      return;
    }

    if (parseInt(booked_count) >= capacity) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Class booking is full. Maximum capacity reached.' });
      return;
    }

    await client.query(
      `INSERT INTO class_bookings (gym_id, class_id, member_id) VALUES ($1, $2, $3)`,
      [gym_id, class_id, member_id]
    );

    await client.query('COMMIT');

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, null, `Member booked class "${title}" (${class_id})`, req.ip]
    );

    res.status(201).json({ success: true, message: 'Class successfully booked via mobile app.' });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    const pgError = error as { code?: string; message: string };
    if (pgError.code === '23505') {
      res.status(400).json({ error: 'You already have a confirmed booking for this class.' });
    } else {
      logger.error('Class booking failed', { requestId: (req as any).requestId, error: pgError.message });
      res.status(500).json({ error: 'Internal system failure.' });
    }
  } finally {
    client.release();
  }
};

export const cancelClassBooking = async (req: Request, res: Response): Promise<void> => {
  const { booking_id } = req.params;
  const member_id = req.staff?.member_id;
  const gym_id = req.staff?.gym_id;

  try {
    const result = await query(
      `UPDATE class_bookings SET status = 'cancelled'
       WHERE id = $1 AND member_id = $2 AND gym_id = $3 AND status = 'confirmed'
       RETURNING id, status`,
      [booking_id, member_id, gym_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Booking not found or already cancelled.' });
      return;
    }

    res.status(200).json({ success: true, message: 'Booking cancelled successfully.' });
  } catch (error) {
    logger.error('Cancel booking failed', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const getMyBookings = async (req: Request, res: Response): Promise<void> => {
  const member_id = req.staff?.member_id;
  const gym_id = req.staff?.gym_id;

  try {
    const result = await query(
      `SELECT cb.id, cb.status, cb.booked_at,
              fc.title, fc.start_time, fc.end_time, fc.capacity,
              su.full_name as coach_name
       FROM class_bookings cb
       JOIN fitness_classes fc ON cb.class_id = fc.id
       JOIN staff_users su ON fc.coach_id = su.id
       WHERE cb.member_id = $1 AND cb.gym_id = $2 AND fc.start_time >= CURRENT_TIMESTAMP
       ORDER BY fc.start_time ASC`,
      [member_id, gym_id]
    );

    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Failed to fetch member bookings', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const toggleMobileSubscriptionFreeze = async (req: Request, res: Response): Promise<void> => {
  const { subscription_id, freeze_days } = req.body;
  const member_id = req.staff?.member_id;
  const gym_id = req.staff?.gym_id;

  if (!subscription_id || !freeze_days || freeze_days <= 0) {
    res.status(400).json({ error: 'Valid Subscription ID and freeze days are required.' });
    return;
  }

  // سياسة التجميد من الإعدادات: حد أقصى + هل يمدد تاريخ الانتهاء
  let freezeMax = 30;
  let freezeExtends = true;
  try {
    const s = await query(
      `SELECT setting_key, setting_value FROM gym_settings
       WHERE gym_id = $1 AND setting_key IN ('member_freeze_days_max', 'freeze_extend_end')`,
      [gym_id]
    );
    for (const row of s.rows) {
      if (row.setting_key === 'member_freeze_days_max') {
        const v = parseInt(String(row.setting_value), 10);
        if (Number.isFinite(v) && v >= 0) freezeMax = Math.min(v, 365);
      }
      if (row.setting_key === 'freeze_extend_end') freezeExtends = String(row.setting_value) !== 'false';
    }
  } catch { /* defaults stand */ }
  if (freeze_days > freezeMax) {
    res.status(400).json({ error: `Freeze days exceed the gym limit (${freezeMax}).` });
    return;
  }

  try {
    const subResult = await query(
      `SELECT id, status, end_date, is_frozen
       FROM member_subscriptions
       WHERE id = $1 AND member_id = $2 AND gym_id = $3 AND end_date >= CURRENT_DATE`,
      [subscription_id, member_id, gym_id]
    );

    if (subResult.rows.length === 0) {
      res.status(404).json({ error: 'Active subscription profile not found or already expired.' });
      return;
    }

    const subscription = subResult.rows[0];

    if (subscription.status !== 'active') {
      res.status(400).json({ error: 'Subscription is not active. Cannot freeze.' });
      return;
    }

    if (subscription.is_frozen) {
      res.status(400).json({ error: 'Subscription is already frozen.' });
      return;
    }

    const freeze_start_date = new Date();
    const freeze_end_date = new Date();
    freeze_end_date.setDate(freeze_start_date.getDate() + parseInt(freeze_days));

    const result = await query(
      `UPDATE member_subscriptions
       SET status = 'frozen', is_frozen = true, freeze_start_date = $1, freeze_end_date = $2
           ${freezeExtends ? `, end_date = end_date + ($3::integer * INTERVAL '1 day')` : ''}
       WHERE id = $4 RETURNING id, status, end_date`,
      freezeExtends
        ? [freeze_start_date.toISOString().split('T')[0], freeze_end_date.toISOString().split('T')[0], freeze_days, subscription_id]
        : [freeze_start_date.toISOString().split('T')[0], freeze_end_date.toISOString().split('T')[0], subscription_id]
    );

    res.status(200).json({
      success: true,
      message: 'Subscription successfully frozen and extended.',
      updated_profile: result.rows[0],
    });
  } catch (error) {
    logger.error('Subscription freeze failed', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal system error.' });
  }
};
