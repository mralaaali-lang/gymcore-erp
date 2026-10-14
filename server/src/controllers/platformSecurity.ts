import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import {
  generateTOTPSetup, enableTOTP, disableTOTP, verifyTOTPToken,
} from '../services/totp.service';
import logger from '../config/logger';
import { logPlatformAudit } from '../utils/platformAudit';

/** Safely extract error message from unknown error type */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const listPlatformAdminSessions = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    // List sessions for all platform admins (super admin view)
    const result = await client.query(
      `SELECT s.id, s.platform_admin_id, s.user_agent, s.ip_address, s.device_name,
              s.last_active_at, s.created_at, s.revoked_at,
              p.email, p.full_name
       FROM platform_admin_sessions s
       LEFT JOIN platform_admins p ON p.id = s.platform_admin_id
       ORDER BY s.last_active_at DESC
       LIMIT 100`
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listPlatformAdminSessions failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const revokePlatformAdminSession = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `UPDATE platform_admin_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(404).json({ error: 'Session not found or already revoked.' });
      return;
    }
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'REVOKE', tableName: 'platform_admin_sessions', recordId: id, newValues: { revoked_at: new Date().toISOString() }, req });
    res.json({ data: { message: 'Session revoked successfully.' } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('revokePlatformAdminSession failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const getSecuritySettings = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT * FROM platform_security_settings WHERE id = 1`
    );
    await client.query('COMMIT');
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Security settings not found.' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('getSecuritySettings failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const updateSecuritySettings = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const allowedFields = [
      'two_factor_enabled', 'two_factor_method',
      'password_min_length', 'password_require_uppercase',
      'password_require_lowercase', 'password_require_numbers',
      'password_require_symbols', 'password_expiry_days',
      'max_login_attempts', 'lockout_duration_minutes',
      'ip_whitelist_enabled', 'ip_whitelist',
      'session_timeout_minutes',
    ];

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(req.body[field]);
      }
    }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No valid fields to update.' });
      return;
    }

    sets.push(`updated_by = $${idx++}`);
    params.push(req.platformAdmin?.platform_admin_id);
    sets.push(`updated_at = NOW()`);

    const result = await client.query(
      `UPDATE platform_security_settings SET ${sets.join(', ')} WHERE id = 1 RETURNING *`,
      params
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'SETTINGS_UPDATE', tableName: 'platform_security_settings', newValues: result.rows[0], req });
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateSecuritySettings failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// FEATURE FLAGS
// ====================================================================
export const getFeatureFlags = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT feature_flags FROM platform_security_settings WHERE id = 1`
    );
    await client.query('COMMIT');
    const flags = result.rows[0]?.feature_flags ?? [];
    res.json({ data: flags });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('getFeatureFlags failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const updateFeatureFlags = async (req: Request, res: Response): Promise<void> => {
  const { feature_flags } = req.body;
  if (!Array.isArray(feature_flags)) {
    res.status(400).json({ error: 'feature_flags must be an array.' });
    return;
  }
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `UPDATE platform_security_settings SET feature_flags = $1::jsonb, updated_at = NOW(), updated_by = $2 WHERE id = 1 RETURNING feature_flags`,
      [JSON.stringify(feature_flags), req.platformAdmin?.platform_admin_id]
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'FEATURE_FLAG_UPDATE', tableName: 'platform_security_settings', newValues: { feature_flags }, req });
    res.json({ data: result.rows[0]?.feature_flags ?? [] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateFeatureFlags failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const getSecurityOverview = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const [sessionsResult, loginStats, settingsResult, adminsResult] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total_sessions FROM platform_admin_sessions WHERE revoked_at IS NULL`),
      client.query(`SELECT COUNT(*)::int AS total_logins, COUNT(*) FILTER (WHERE action_description ILIKE '%fail%' OR action_description ILIKE '%فشل%')::int AS failed_logins FROM activity_logs WHERE action_description ILIKE '%login%' OR action_description ILIKE '%دخول%'`),
      client.query(`SELECT * FROM platform_security_settings WHERE id = 1`),
      client.query(`SELECT COUNT(*)::int AS total FROM platform_admins WHERE is_active = true`),
    ]);
    await client.query('COMMIT');

    res.json({
      data: {
        active_sessions: sessionsResult.rows[0]?.total_sessions ?? 0,
        total_logins: loginStats.rows[0]?.total_logins ?? 0,
        failed_logins: loginStats.rows[0]?.failed_logins ?? 0,
        active_admins: adminsResult.rows[0]?.total ?? 0,
        two_factor_enabled: settingsResult.rows[0]?.two_factor_enabled ?? false,
        password_expiry_days: settingsResult.rows[0]?.password_expiry_days ?? 90,
        ip_whitelist_enabled: settingsResult.rows[0]?.ip_whitelist_enabled ?? false,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('getSecurityOverview failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// 2FA (TOTP) for Platform Admins
// ====================================================================

export const setup2FA = async (req: Request, res: Response): Promise<void> => {
  const admin = req.platformAdmin;
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  try {
    const client = await getAdminClient();
    const result = await client.query(
      'SELECT email FROM platform_admins WHERE id = $1',
      [admin.platform_admin_id]
    );
    await client.query('COMMIT');
    client.release();

    const email = result.rows[0]?.email;
    if (!email) {
      res.status(404).json({ error: 'Admin not found.' });
      return;
    }

    const { qrCodeUrl, secret } = await generateTOTPSetup(admin.platform_admin_id, email);
    res.json({ data: { qrCodeUrl, secret } });
  } catch (error) {
    logger.error('setup2FA failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const verify2FA = async (req: Request, res: Response): Promise<void> => {
  const admin = req.platformAdmin;
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  const { token, secret } = req.body;
  if (!token || !secret) {
    res.status(400).json({ error: 'token and secret are required.' });
    return;
  }

  const isValid = verifyTOTPToken(token, secret);
  if (!isValid) {
    res.status(400).json({ error: 'Invalid 2FA code.' });
    return;
  }

  try {
    await enableTOTP(admin.platform_admin_id, secret);
    await logPlatformAudit({ action: '2FA_ENABLE', tableName: 'platform_admins', recordId: admin.platform_admin_id, newValues: { enabled: true }, req });
    res.json({ data: { success: true, message: '2FA enabled successfully.' } });
  } catch (error) {
    logger.error('verify2FA failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const disable2FA = async (req: Request, res: Response): Promise<void> => {
  const admin = req.platformAdmin;
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  try {
    await disableTOTP(admin.platform_admin_id);
    await logPlatformAudit({ action: '2FA_DISABLE', tableName: 'platform_admins', recordId: admin.platform_admin_id, newValues: { enabled: false }, req });
    res.json({ data: { success: true, message: '2FA disabled successfully.' } });
  } catch (error) {
    logger.error('disable2FA failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  }
};
