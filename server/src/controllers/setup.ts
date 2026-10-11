import { Request, Response } from 'express';
import { query } from '../config/database';

export async function getSetupProgress(req: Request, res: Response) {
  const gym_id = req.staff?.gym_id;
  if (!gym_id) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const [gymInfo, trainers, offers, members, cashbox, attendance, payments, announcements, settings] = await Promise.all([
      query(`SELECT name, logo_url FROM gyms WHERE id=$1`, [gym_id]),
      query(`SELECT COUNT(*)::int AS count FROM staff_users WHERE gym_id=$1 AND role='coach'`, [gym_id]),
      query(`SELECT COUNT(*)::int AS count FROM membership_offers WHERE gym_id=$1`, [gym_id]),
      query(`SELECT COUNT(*)::int AS count FROM members WHERE gym_id=$1`, [gym_id]),
      query(`SELECT COUNT(*)::int AS count FROM cashbox_sessions WHERE gym_id=$1`, [gym_id]),
      query(`SELECT COUNT(*)::int AS count FROM attendance_logs WHERE gym_id=$1 AND check_in_time>=CURRENT_DATE`, [gym_id]),
      query(`SELECT COUNT(*)::int AS count FROM financial_transactions WHERE gym_id=$1 AND type='payment'`, [gym_id]),
      query(`SELECT COUNT(*)::int AS count FROM announcements WHERE gym_id=$1`, [gym_id]),
      query(`SELECT COUNT(*)::int AS count FROM gym_settings WHERE gym_id=$1`, [gym_id]),
    ]);

    res.json({
      data: {
        gym_name: gymInfo.rows[0]?.name || '',
        gym_logo: gymInfo.rows[0]?.logo_url || '',
        trainers: trainers.rows[0].count > 0,
        subscriptions: offers.rows[0].count > 0,
        members: members.rows[0].count > 0,
        cashbox: cashbox.rows[0].count > 0,
        schedule: attendance.rows[0].count > 0,
        payments: payments.rows[0].count > 0,
        marketing: announcements.rows[0].count > 0,
        settings: settings.rows[0].count > 0,
      },
    });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}
