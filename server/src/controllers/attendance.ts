import { Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../config/database';
import { setTenantGymId } from '../config/tenantContext';
import { broadcastCheckIn } from '../services/realtime';
import { enqueueCheckIn } from '../services/queue';
import { whatsapp } from '../services/whatsapp';
import logger from '../config/logger';

const QR_WINDOW_SECONDS = 30;

interface DecodedQrPayload {
  member_id: string;
  gym_id: string;
  timestamp: number;
  signature: string;
}

type QrDecodeResult =
  | { ok: true; payload: DecodedQrPayload }
  | { ok: false; status: number; error: string };

/**
 * Decodes a base64 QR payload, checks its rotation window, and verifies its
 * HMAC signature. Shared by both the staff-authenticated and public
 * verification endpoints so the security-critical logic exists in exactly
 * one place instead of being copy-pasted (previously it was duplicated
 * across verifyAndRegisterAttendance and verifyPublicQrPass, which is how
 * things silently drift out of sync over time).
 */
function decodeAndVerifyQr(qr_token: string, expectedGymId?: string): QrDecodeResult {
  let decodedData: Partial<DecodedQrPayload>;
  try {
    decodedData = JSON.parse(Buffer.from(qr_token, 'base64').toString('utf-8'));
  } catch {
    return { ok: false, status: 400, error: 'Invalid QR token encoding.' };
  }

  const { member_id, gym_id, timestamp, signature } = decodedData;
  if (!member_id || !gym_id || !timestamp || !signature) {
    return { ok: false, status: 400, error: 'Invalid QR token structure.' };
  }

  const tokenAgeSeconds = Math.abs(Date.now() - timestamp) / 1000;
  if (tokenAgeSeconds > QR_WINDOW_SECONDS) {
    return { ok: false, status: 400, error: `Access Denied. Expired QR code. Maximum window is ${QR_WINDOW_SECONDS} seconds.` };
  }

  if (expectedGymId && gym_id !== expectedGymId) {
    return { ok: false, status: 403, error: 'Tenant mismatch security alert. QR belongs to a different gym.' };
  }

  const systemSecret = (process.env.QR_SECRET_SALT as string) + gym_id;
  const localSignature = crypto
    .createHmac('sha256', systemSecret)
    .update(`${member_id}-${gym_id}-${timestamp}`)
    .digest('hex');

  if (localSignature !== signature) {
    return { ok: false, status: 400, error: 'Access Denied. Tampered or invalid QR signature.' };
  }

  return { ok: true, payload: { member_id, gym_id, timestamp, signature } };
}

/**
 * Runs every check that must pass before a member is let in and logged —
 * exists, not blacklisted, has an active subscription, hasn't already
 * checked in today — then records the attendance row and fires the
 * (best-effort) side effects. Shared by the QR flow and the manual-phone
 * fallback flow so both paths enforce identical business rules.
 */
async function performCheckIn(
  member_id: string,
  gym_id: string,
  entry_method: 'qr_code' | 'manual_phone',
  verified_by_staff_id: string | undefined,
  res: Response
): Promise<void> {
  const statusCheck = await query(
    `SELECT m.id, m.full_name, decrypt_sensitive(m.phone_encrypted) as phone_number, m.is_blacklisted, s.status, s.end_date
     FROM members m
     LEFT JOIN LATERAL (
       SELECT status, end_date FROM member_subscriptions
       WHERE member_id = m.id AND gym_id = m.gym_id
       ORDER BY created_at DESC LIMIT 1
     ) s ON true
     WHERE m.id = $1 AND m.gym_id = $2`,
    [member_id, gym_id]
  );

  if (statusCheck.rows.length === 0) {
    res.status(404).json({ error: 'Member not found.' });
    return;
  }

  const member = statusCheck.rows[0];

  if (member.is_blacklisted) {
    res.status(403).json({ error: 'Access Denied. Profile is blacklisted.' });
    return;
  }

  if (!member.status || member.status !== 'active') {
    const reason = !member.status ? 'no active subscription found' : `subscription is ${member.status}`;
    res.status(403).json({ error: `Access Denied. ${reason}.` });
    return;
  }

  const todayCheck = await query(
    `SELECT id FROM attendance_logs
     WHERE member_id = $1 AND gym_id = $2 AND check_in_time::date = CURRENT_DATE`,
    [member_id, gym_id]
  );

  if (todayCheck.rows.length > 0) {
    res.status(400).json({ error: 'Member has already checked in today.' });
    return;
  }

  const attendanceResult = await query(
    `INSERT INTO attendance_logs (gym_id, member_id, entry_method, verified_by_staff_id)
     VALUES ($1, $2, $3, $4) RETURNING id, check_in_time`,
    [gym_id, member_id, entry_method, verified_by_staff_id || null]
  );

  if (verified_by_staff_id) {
    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, verified_by_staff_id, `Check-in verified for member ${member.full_name} (${member_id}) via ${entry_method}`, null]
    );
  }

  try {
    broadcastCheckIn({
      type: 'checkin',
      gym_id,
      member_name: member.full_name,
      check_in_time: attendanceResult.rows[0].check_in_time,
      entry_method,
    });
  } catch { /* real-time broadcast is best-effort, never block check-in on it */ }

  try {
    await enqueueCheckIn({ memberId: member_id, gymId: gym_id, timestamp: new Date().toISOString() });
  } catch { /* queue is best-effort */ }

  // Fixed bug: the SQL above now actually selects phone_number (the old
  // verifyAndRegisterAttendance query didn't), so this notification is no
  // longer silently sent to an empty string for staff-verified check-ins.
  whatsapp.sendMessage({
    to: member.phone_number || '',
    memberName: member.full_name,
    type: 'attendance',
    gymName: undefined,
  }).catch(() => {});

  res.status(200).json({
    success: true,
    message: 'Access Granted. Welcome!',
    record: attendanceResult.rows[0],
  });
}

// ====================================================================
// Staff-authenticated QR check-in (front desk scans a member's rotating pass)
// ====================================================================
export const verifyAndRegisterAttendance = async (req: Request, res: Response): Promise<void> => {
  const { qr_token } = req.body;
  const staff_gym_id = req.staff?.gym_id;
  const verified_by_staff_id = req.staff?.staff_user_id;

  if (!qr_token) {
    res.status(400).json({ error: 'QR token is required.' });
    return;
  }

  const decoded = decodeAndVerifyQr(qr_token, staff_gym_id);
  if (!decoded.ok) {
    res.status(decoded.status).json({ error: decoded.error });
    return;
  }

  try {
    await performCheckIn(decoded.payload.member_id, decoded.payload.gym_id, 'qr_code', verified_by_staff_id, res);
  } catch (error) {
    logger.error('QR verification failed', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal validation failure.' });
  }
};

export const getTodayAttendance = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const role = req.staff?.role;

  try {
    const result = await query(
      `SELECT al.id, al.check_in_time, al.entry_method, m.full_name, decrypt_sensitive(m.phone_encrypted) as phone_number,
              su.full_name as verified_by_name
       FROM attendance_logs al
       JOIN members m ON al.member_id = m.id
       LEFT JOIN staff_users su ON al.verified_by_staff_id = su.id
       WHERE al.gym_id = $1 AND al.check_in_time >= CURRENT_DATE
       ORDER BY al.check_in_time DESC`,
      [gym_id]
    );

    const rows = result.rows.map((row: Record<string, unknown>) => {
      if (role === 'coach') {
        const { phone_number, ...rest } = row;
        return rest;
      }
      return row;
    });

    res.status(200).json({ data: rows, count: rows.length });
  } catch (error) {
    logger.error('Failed to fetch today attendance', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const manualCheckIn = async (req: Request, res: Response): Promise<void> => {
  const { member_phone, member_id } = req.body;
  const gym_id = req.staff?.gym_id;
  const verified_by_staff_id = req.staff?.staff_user_id;

  if (!gym_id) {
    res.status(401).json({ error: 'Access denied.' });
    return;
  }

  try {
    let resolvedMemberId = member_id as string | undefined;

    if (!resolvedMemberId) {
      const lookup = await query(`SELECT id FROM members WHERE (phone_number = $1 OR phone_hash = phone_hash($1)) AND gym_id = $2`, [member_phone, gym_id]);
      if (lookup.rows.length === 0) {
        res.status(404).json({ error: 'No member found with this phone number.' });
        return;
      }
      resolvedMemberId = lookup.rows[0].id;
    }

    await performCheckIn(resolvedMemberId!, gym_id, 'manual_phone', verified_by_staff_id, res);
  } catch (error) {
    logger.error('Manual check-in failed', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// ====================================================================
// PUBLIC QR PASS VERIFICATION — No staff JWT required
// Used by QR scanner hardware at the entry gate
// ====================================================================
export const verifyPublicQrPass = async (req: Request, res: Response): Promise<void> => {
  const { qr_token } = req.body;

  if (!qr_token) {
    res.status(400).json({ error: 'QR token is required.' });
    return;
  }

  const decoded = decodeAndVerifyQr(qr_token);
  if (!decoded.ok) {
    // Public endpoint: keep responses generic (401) regardless of the
    // specific reason, so a scanner/attacker can't distinguish "expired"
    // from "bad signature" from "wrong tenant" by response content alone.
    res.status(401).json({ error: 'Invalid or expired QR pass.' });
    return;
  }

  // Public route has no authenticateAndIsolateTenant middleware to set this
  // (there's no staff JWT at all), so scope it explicitly from the QR's own
  // gym_id before running any query() calls that rely on RLS.
  setTenantGymId(decoded.payload.gym_id);

  try {
    await performCheckIn(decoded.payload.member_id, decoded.payload.gym_id, 'qr_code', undefined, res);
  } catch (error) {
    logger.error('Public QR pass verification failed', { error: (error as Error).message });
    res.status(401).json({ error: 'Invalid or expired QR pass.' });
  }
};
