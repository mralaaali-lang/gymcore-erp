import { Request, Response } from 'express';
import { query } from '../config/database';
import { whatsapp } from '../services/whatsapp';
import logger from '../config/logger';

// ====================================================================
// Gym notifications feed (latest platform_notifications for this gym)
// ====================================================================
export async function listGymNotifications(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const role = req.staff?.role;
  try {
    const result = await query(
      `SELECT id, gym_id, recipient_role, notification_type, title, body, action_url,
              read_at, created_at,
              (read_at IS NULL) AS is_unread
       FROM platform_notifications
       WHERE gym_id = $1 AND (recipient_role = $2 OR recipient_role = 'all')
       ORDER BY created_at DESC
       LIMIT 20`,
      [gym_id, role]
    );
    res.json({ data: result.rows });
  } catch (error) {
    logger.error('List gym notifications failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function markGymNotificationRead(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Notification id is required.' });
    return;
  }
  try {
    const result = await query(
      `UPDATE platform_notifications SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND gym_id = $2
       RETURNING id, read_at`,
      [id, gym_id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error('Mark gym notification read failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function sendNotification(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { member_id, type } = req.body;
  try {
    const memberResult = await query(
      `SELECT id, full_name, decrypt_sensitive(phone_encrypted) as phone_number, (SELECT name FROM gyms WHERE id = $2) AS gym_name FROM members WHERE id = $1 AND gym_id = $2`,
      [member_id, gym_id]
    );
    if (memberResult.rows.length === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    const member = memberResult.rows[0];
    const ok = await whatsapp.sendMessage({
      to: member.phone_number,
      memberName: member.full_name,
      type,
      gymName: member.gym_name,
      data: req.body.data || undefined,
    });
    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, req.staff?.staff_user_id, `WhatsApp ${type} sent to ${member.full_name} (${member_id})`, req.ip]
    );
    res.status(200).json({ success: ok, provider: whatsapp.getProvider() });
  } catch (error) {
    logger.error('Send notification failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function sendBulkNotification(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { member_ids, type } = req.body;
  try {
    if (!Array.isArray(member_ids) || member_ids.length === 0) {
      res.status(400).json({ error: 'member_ids array required' });
      return;
    }
    const membersResult = await query(
      `SELECT id, full_name, decrypt_sensitive(phone_encrypted) as phone_number, (SELECT name FROM gyms WHERE id = $1) AS gym_name FROM members WHERE gym_id = $1 AND id = ANY($2::uuid[])`,
      [gym_id, member_ids]
    );
    const payloads = membersResult.rows.map((m: any) => ({
      to: m.phone_number, memberName: m.full_name, type, gymName: m.gym_name, data: req.body.data || undefined,
    }));
    const result = await whatsapp.sendBulk(payloads);
    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, req.staff?.staff_user_id, `Bulk WhatsApp (${type}) sent to ${result.sent} members, ${result.failed} failed`, req.ip]
    );
    res.status(200).json(result);
  } catch (error) {
    logger.error('Bulk notification failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getWhatsappStatus(req: Request, res: Response): Promise<void> {
  res.status(200).json({
    configured: whatsapp.isConfigured(),
    provider: whatsapp.getProvider(),
  });
}
