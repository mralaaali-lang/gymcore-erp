import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import os from 'os';
import fs from 'fs';
import path from 'path';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';
import { getFrontendUrl } from '../config/frontendUrl';
import { sendPasswordResetEmail } from '../services/email';
import { verifyTOTPToken } from '../services/totp.service';
import type { PlatformAdminTokenPayload } from '../middleware/platformAuth';

const JWT_SECRET = process.env.JWT_SECRET as string;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge,
  path: '/',
});

/** Safely extract error message from unknown error type */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ====================================================================
// Platform admin login
// ====================================================================
export const platformAdminLogin = async (req: Request, res: Response): Promise<void> => {
  const { email, phone_number, password } = req.body;

  if ((!email && !phone_number) || !password) {
    res.status(400).json({ error: 'Email or phone number and password are required.' });
    return;
  }

  const client = await getAdminClient();
  try {
    let result;
    if (phone_number) {
      result = await client.query(
        `SELECT id, email, password_hash, full_name, is_active, role_type, totp_secret, totp_verified FROM platform_admins WHERE phone_number = $1`,
        [phone_number]
      );
    } else {
      result = await client.query(
        `SELECT id, email, password_hash, full_name, is_active, role_type, totp_secret, totp_verified FROM platform_admins WHERE email = $1`,
        [email]
      );
    }

    const admin = result.rows[0];
    if (!admin) {
      await client.query('ROLLBACK');
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const passwordValid = await bcrypt.compare(password, admin.password_hash);
    if (!admin.is_active || !passwordValid) {
      await client.query('ROLLBACK');
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    // Check 2FA if enabled for this admin
    const totpToken = req.body.totp_token;
    if (admin.totp_verified && admin.totp_secret) {
      if (!totpToken) {
        await client.query('ROLLBACK');
        res.status(200).json({
          requires_2fa: true,
          message: '2FA code required.',
        });
        return;
      }
      const totpValid = verifyTOTPToken(totpToken, admin.totp_secret);
      if (!totpValid) {
        await client.query('ROLLBACK');
        res.status(401).json({ error: 'Invalid 2FA code.' });
        return;
      }
    }

    await client.query('UPDATE platform_admins SET last_login_at = NOW(), last_login_ip = $1 WHERE id = $2', [req.ip, admin.id]);

    const jti = crypto.randomUUID();
    const payload: PlatformAdminTokenPayload = {
      platform_admin_id: admin.id,
      type: 'platform_admin',
      jti,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    res.cookie('access_token', token, cookieOptions(8 * 60 * 60 * 1000));

    await client.query(
      `INSERT INTO platform_admin_sessions (platform_admin_id, token_jti, user_agent, ip_address, device_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [admin.id, jti, req.headers['user-agent'] || null, req.ip, req.headers['user-agent']?.split('/')[0] || null]
    );

    await client.query('COMMIT');

    res.status(200).json({
      expires_in: 28800,
      admin: { id: admin.id, email: admin.email, full_name: admin.full_name, role_type: admin.role_type },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Platform admin login failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// Platform admin refresh token
// ====================================================================
export const platformRefreshToken = async (req: Request, res: Response): Promise<void> => {
  const refresh_token = req.body.refresh_token || (req as any).cookies?.refresh_token;
  if (!refresh_token) {
    res.status(400).json({ error: 'refresh_token is required.' });
    return;
  }

  try {
    const decoded = jwt.verify(refresh_token, JWT_SECRET) as {
      platform_admin_id: string;
      type: string;
      jti: string;
    };

    if (decoded.type !== 'platform_admin_refresh' || !decoded.platform_admin_id) {
      res.status(403).json({ error: 'Invalid refresh token.' });
      return;
    }

    const client = await getAdminClient();
    try {
      const sessionResult = await client.query(
        `SELECT s.id, s.revoked_at, p.is_active, p.email, p.full_name, p.role_type
         FROM platform_admin_sessions s
         JOIN platform_admins p ON p.id = s.platform_admin_id
         WHERE s.token_jti = $1 AND s.platform_admin_id = $2`,
        [decoded.jti, decoded.platform_admin_id]
      );

      if (sessionResult.rows.length === 0 || sessionResult.rows[0].revoked_at) {
        res.status(401).json({ error: 'Session revoked or not found. Please login again.' });
        return;
      }

      if (!sessionResult.rows[0].is_active) {
        res.status(403).json({ error: 'Admin account is deactivated.' });
        return;
      }

      const newJti = crypto.randomUUID();
      const newAccessToken = jwt.sign(
        { platform_admin_id: decoded.platform_admin_id, type: 'platform_admin', jti: newJti },
        JWT_SECRET,
        { expiresIn: '8h' }
      );
      const newRefreshToken = jwt.sign(
        { platform_admin_id: decoded.platform_admin_id, type: 'platform_admin_refresh', jti: newJti },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie('access_token', newAccessToken, cookieOptions(8 * 60 * 60 * 1000));
      res.cookie('refresh_token', newRefreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

      await client.query(`UPDATE platform_admin_sessions SET revoked_at = NOW() WHERE token_jti = $1`, [decoded.jti]);
      await client.query(
        `INSERT INTO platform_admin_sessions (platform_admin_id, token_jti, user_agent, ip_address, device_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [decoded.platform_admin_id, newJti, req.headers['user-agent'] || null, req.ip, req.headers['user-agent']?.split('/')[0] || null]
      );

      await client.query('COMMIT');
      const adminInfo = sessionResult.rows[0];
      res.json({
        expires_in: 28800,
        admin: { id: decoded.platform_admin_id, email: adminInfo.email, full_name: adminInfo.full_name, role_type: adminInfo.role_type },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      Sentry.captureException(error);
      logger.error('platformRefreshToken failed', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Internal server error.' });
    } finally {
      client.release();
    }
  } catch (error) {
    Sentry.captureException(error);
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
};

export const platformLogout = async (_req: Request, res: Response): Promise<void> => {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
  res.status(200).json({ message: 'Logged out successfully.' });
};

// ====================================================================
// FORGOT / RESET PASSWORD (platform_admins)
// ====================================================================
export const platformForgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  const genericOk = () => res.status(200).json({
    message: 'إذا كان البريد الإلكتروني مسجلاً لدينا، سيصلك رابط لإعادة تعيين كلمة المرور.',
  });

  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const frontendUrl = getFrontendUrl();
  if (!frontendUrl) {
    logger.error('Platform password reset unavailable: FRONTEND_URL must be a valid HTTPS URL in staging/production.');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT id, full_name FROM platform_admins WHERE email = $1 AND is_active = true`,
      [email]
    );

    if (result.rows.length === 0) {
      await client.query('COMMIT');
      genericOk();
      return;
    }

    const admin = result.rows[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await client.query(
      `INSERT INTO password_reset_tokens (platform_admin_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [admin.id, tokenHash, expiresAt]
    );
    await client.query('COMMIT');

    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}&type=platform`;
    await sendPasswordResetEmail(email, resetLink, admin.full_name);

    genericOk();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('platformForgotPassword failed', { error: getErrorMessage(error) });
    genericOk();
  } finally {
    client.release();
  }
};

// ====================================================================
// List platform audit logs (super admin actions across all tenants)
// Uses getAdminClient() to bypass tenant RLS
// ====================================================================
export const listAuditLogs = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { search, date, limit: queryLimit } = req.query;
    const limit = Math.min(parseInt(queryLimit as string) || 50, 200);

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    // Show platform_admin actions AND gym-level actions (auditor view)
    if (search) {
      whereClause += ` AND (a.action_description ILIKE $${paramIndex} OR a.ip_address ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (date) {
      whereClause += ` AND a.created_at::date = $${paramIndex}::date`;
      params.push(date);
      paramIndex++;
    }

    const result = await client.query(
      `SELECT a.id, a.gym_id, a.action_description, a.ip_address, a.created_at,
              COALESCE(s.email, p.email) AS actor_email,
              g.name AS tenant_name
       FROM activity_logs a
       LEFT JOIN staff_users s ON s.id = a.staff_user_id
       LEFT JOIN platform_admins p ON p.id = a.platform_admin_id
       LEFT JOIN gyms g ON g.id = a.gym_id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramIndex}`,
      [...params, limit]
    );
    await client.query('COMMIT');

    res.json({
      data: result.rows.map((row) => ({
        id: row.id,
        tenantId: row.gym_id,
        tenantName: row.tenant_name || 'â€”',
        actionType: row.action_description,
        ipAddress: row.ip_address,
        timestamp: row.created_at,
        user: row.actor_email || 'system',
      })),
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('listAuditLogs failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// Platform system status â€” enhanced metrics dashboard for SystemMonitor
// ====================================================================
export const getSystemStatus = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const startTime = Date.now();

    const [
      gymsResult,
      staffResult,
      membersResult,
      logsResult,
      checkinsResult,
      subscriptionsResult,
      failedLoginsResult,
      dailyCheckinsResult,
      recentErrorsResult,
    ] = await Promise.all([
      client.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM gyms'),
      client.query('SELECT COUNT(*)::int AS total FROM staff_users'),
      client.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_blacklisted = false)::int AS active FROM members'),
      client.query(`SELECT created_at, action_description FROM activity_logs ORDER BY created_at DESC LIMIT 20`),
      client.query(`SELECT COUNT(*)::int AS total FROM attendance_logs WHERE check_in_time >= CURRENT_DATE - INTERVAL '1 day'`),
      client.query(`SELECT COUNT(DISTINCT member_id)::int AS total FROM member_subscriptions WHERE status = 'active' AND end_date >= CURRENT_DATE`),
      client.query(`SELECT COUNT(*)::int AS total FROM activity_logs WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' AND (action_description ILIKE '%fail%' OR action_description ILIKE '%فشل%' OR action_description ILIKE '%error%')`),
      client.query(`
        SELECT d::date AS day, COALESCE(a.cnt, 0) AS checkins
        FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
        LEFT JOIN (SELECT DATE(check_in_time) AS day, COUNT(*)::int AS cnt FROM attendance_logs WHERE check_in_time >= CURRENT_DATE - INTERVAL '7 days' GROUP BY DATE(check_in_time)) a ON d::date = a.day
        ORDER BY d::date
      `),
      client.query(`SELECT created_at, action_description FROM activity_logs WHERE action_description ILIKE '%error%' OR action_description ILIKE '%فشل%' ORDER BY created_at DESC LIMIT 5`),
    ]);

    await client.query('COMMIT');

    const responseTime = Date.now() - startTime;

    // Compute storage (uploads directory)
    let storageUsedMB = 0;
    try {
      const uploadsDir = path.resolve(__dirname, '../../uploads');
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        let totalBytes = 0;
        for (const file of files) {
          try {
            const stat = fs.statSync(path.join(uploadsDir, file));
            totalBytes += stat.size;
          } catch { /* skip */ }
        }
        storageUsedMB = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
      }
    } catch { /* storage stats best-effort */ }

    // Server info
    const uptimeSeconds = Math.floor(process.uptime());
    const uptimeStr = formatUptime(uptimeSeconds);
    const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10;
    const freeMem = Math.round(os.freemem() / (1024 * 1024 * 1024) * 10) / 10;
    const memUsagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

    const events = logsResult.rows.map((row, idx) => ({
      // include idx: seeded logs share identical timestamps, which produced duplicate React keys
      id: `EV-${row.created_at.getTime()}-${idx}`,
      message: row.action_description,
      type: row.action_description.toLowerCase().includes('error') || row.action_description.toLowerCase().includes('فشل') ? 'error'
        : row.action_description.toLowerCase().includes('warning') || row.action_description.toLowerCase().includes('تحذير') ? 'warning'
        : 'info',
      timestamp: row.created_at,
    }));

    const gymData = gymsResult.rows[0];
    const memberData = membersResult.rows[0];
    const staffData = staffResult.rows[0];
    const checkinData = checkinsResult.rows[0];
    const subData = subscriptionsResult.rows[0];
    const failedLoginData = failedLoginsResult.rows[0];

    res.json({
      data: {
        metrics: [
          {
            label: 'المنشآت',
            usage: Math.round((gymData.active / Math.max(gymData.total, 1)) * 100),
            icon: 'store',
            color: 'bg-green-500',
            value: `${gymData.active}/${gymData.total}`,
            trend: gymData.active > 0 ? 'up' : 'stable',
          },
          {
            label: 'الأعضاء',
            usage: Math.round((memberData.active / Math.max(memberData.total, 1)) * 100),
            icon: 'group',
            color: 'bg-blue-500',
            value: `${memberData.active}/${memberData.total}`,
            trend: memberData.total > 0 ? 'up' : 'stable',
          },
          {
            label: 'الحضور (24 ساعة)',
            usage: Math.min(Math.round((checkinData.total / Math.max(memberData.total, 1)) * 100), 100),
            icon: 'check_circle',
            color: 'bg-accent',
            value: `${checkinData.total}`,
            trend: checkinData.total > 0 ? 'up' : 'stable',
          },
          {
            label: 'الاشتراكات النشطة',
            usage: Math.round((subData.total / Math.max(memberData.total, 1)) * 100),
            icon: 'card_membership',
            color: 'bg-emerald-500',
            value: `${subData.total}`,
            trend: subData.total > 0 ? 'up' : 'stable',
          },
          {
            label: 'الموظفون',
            usage: 0,
            icon: 'badge',
            color: 'bg-purple-500',
            value: `${staffData.total}`,
            trend: 'stable',
          },
          {
            label: 'استجابة API',
            usage: Math.min(Math.round(responseTime / 10), 100),
            icon: 'speed',
            color: responseTime > 500 ? 'bg-red-500' : responseTime > 200 ? 'bg-amber-500' : 'bg-green-500',
            value: `${responseTime}ms`,
            trend: responseTime > 500 ? 'down' : responseTime > 200 ? 'stable' : 'up',
          },
        ],
        events,
        // Database info
        database: {
          total_gyms: gymData.total,
          active_gyms: gymData.active,
          total_members: memberData.total,
          active_members: memberData.active,
          total_staff: staffData.total,
          active_subscriptions: subData.total,
          checkins_24h: checkinData.total,
          failed_logins_24h: failedLoginData.total,
          pool_total: 20,
          pool_idle: 18,
          pool_active: 2,
          pool_waiting: 0,
        },
        // Server info
        server: {
          hostname: os.hostname(),
          platform: os.platform(),
          arch: os.arch(),
          node_version: process.version,
          uptime: uptimeStr,
          uptime_seconds: uptimeSeconds,
          total_mem_gb: totalMem,
          free_mem_gb: freeMem,
          mem_usage_percent: memUsagePercent,
          cpu_count: os.cpus().length,
          cpu_model: os.cpus()[0]?.model || 'N/A',
          load_avg: os.loadavg(),
          storage_used_mb: storageUsedMB,
        },
        // Daily check-ins for chart
        daily_checkins: dailyCheckinsResult.rows.map((r) => ({
          date: r.day,
          count: r.checkins,
        })),
        recent_errors: recentErrorsResult.rows.map((r) => ({
          message: r.action_description,
          timestamp: r.created_at,
        })),
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('getSystemStatus failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(' ') || '0m';
}

export const platformResetPassword = async (req: Request, res: Response): Promise<void> => {
  const { token, new_password } = req.body;

  if (!token || !new_password) {
    res.status(400).json({ error: 'Token and new_password are required.' });
    return;
  }
  if (new_password.length < 8) {
    res.status(400).json({ error: 'new_password must be at least 8 characters.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const client = await getAdminClient();

  try {
    const result = await client.query(
      `SELECT id, platform_admin_id, expires_at, used_at FROM password_reset_tokens
       WHERE token_hash = $1 AND platform_admin_id IS NOT NULL`,
      [tokenHash]
    );
    const row = result.rows[0];

    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(400).json({ error: 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية.' });
      return;
    }

    const passwordHash = await bcrypt.hash(new_password, 12);
    await client.query(`UPDATE platform_admins SET password_hash = $1 WHERE id = $2`, [passwordHash, row.platform_admin_id]);
    await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id]);

    await client.query('COMMIT');
    res.status(200).json({ message: 'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('platformResetPassword failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// SUPPORT TICKETS
// ====================================================================
export const listTickets = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { status, limit: qLimit } = req.query;
    const limit = Math.min(parseInt(qLimit as string) || 50, 200);
    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let i = 1;
    if (status) {
      whereClause += ` AND t.status = $${i++}`;
      params.push(status);
    }
    const result = await client.query(
      `SELECT t.*, g.name AS gym_name, p.email AS assigned_email
       FROM support_tickets t
       LEFT JOIN gyms g ON g.id = t.gym_id
       LEFT JOIN platform_admins p ON p.id = t.assigned_to
       ${whereClause} ORDER BY t.created_at DESC LIMIT $${i}`,
      [...params, limit]
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('listTickets failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const updateTicketStatus = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `UPDATE support_tickets SET status = $1, updated_at = now(), resolved_at = CASE WHEN $1 = 'resolved' THEN now() ELSE resolved_at END WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (result.rows.length === 0) { await client.query('ROLLBACK').catch(() => {}); res.status(404).json({ error: 'Ticket not found' }); return; }
    await client.query('COMMIT');
    await client.query(`INSERT INTO activity_logs (gym_id, platform_admin_id, action_description, ip_address) VALUES ($1, $2, $3, $4)`,
      [result.rows[0].gym_id, req.platformAdmin?.platform_admin_id, `Support ticket ${id} â†’ ${status}`, req.ip]);
    await client.query('COMMIT');
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('updateTicketStatus failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// TICKET ANALYTICS
// ====================================================================
export const getTicketAnalytics = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(`
      SELECT
        COUNT(*)::int AS total_tickets,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_tickets,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_tickets,
        COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_tickets,
        COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_tickets,
        COUNT(*) FILTER (WHERE priority = 'critical')::int AS critical_tickets,
        COUNT(*) FILTER (WHERE priority = 'high')::int AS high_tickets,
        ROUND(AVG(CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END), 1)::numeric(3,1) AS avg_rating,
        COUNT(*) FILTER (WHERE rating IS NOT NULL)::int AS rated_count,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last_30_days
      FROM support_tickets
    `);
    const byCategory = await client.query(`
      SELECT COALESCE(category, 'uncategorized') AS category, COUNT(*)::int AS count
      FROM support_tickets GROUP BY category ORDER BY count DESC
    `);
    const avgResolutionTime = await client.query(`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600), 1)::numeric(10,1) AS avg_hours
      FROM support_tickets WHERE resolved_at IS NOT NULL
    `);
    const ticketsByGym = await client.query(`
      SELECT g.name AS gym_name, COUNT(*)::int AS ticket_count
      FROM support_tickets t JOIN gyms g ON g.id = t.gym_id
      GROUP BY g.name ORDER BY ticket_count DESC LIMIT 10
    `);
    await client.query('COMMIT');
    res.json({
      data: {
        ...result.rows[0],
        categories: byCategory.rows,
        avg_resolution_hours: avgResolutionTime.rows[0]?.avg_hours || 0,
        top_gyms: ticketsByGym.rows,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('getTicketAnalytics failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// ASSIGN TICKET
// ====================================================================
export const assignTicket = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { assigned_to } = req.body;
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `UPDATE support_tickets SET assigned_to = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [assigned_to || null, id]
    );
    if (result.rows.length === 0) { await client.query('ROLLBACK').catch(() => {}); res.status(404).json({ error: 'Ticket not found' }); return; }
    await client.query('COMMIT');
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('assignTicket failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// TICKET RATING
// ====================================================================
export const addTicketRating = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { rating, feedback } = req.body;
  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'Rating must be between 1 and 5' });
    return;
  }
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `UPDATE support_tickets SET rating = $1, rating_feedback = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [rating, feedback || null, id]
    );
    if (result.rows.length === 0) { await client.query('ROLLBACK').catch(() => {}); res.status(404).json({ error: 'Ticket not found' }); return; }
    await client.query('COMMIT');
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('addTicketRating failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// KNOWLEDGE BASE
// ====================================================================
export const listKnowledgeBase = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT * FROM knowledge_base ORDER BY updated_at DESC LIMIT 100`
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('listKnowledgeBase failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const createKnowledgeBase = async (req: Request, res: Response): Promise<void> => {
  const { title, content, category, tags } = req.body;
  if (!title || !content) { res.status(400).json({ error: 'title and content are required' }); return; }
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `INSERT INTO knowledge_base (title, content, category, tags, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, content, category || 'general', JSON.stringify(tags || []), req.platformAdmin?.platform_admin_id]
    );
    await client.query('COMMIT');
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('createKnowledgeBase failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const updateKnowledgeBase = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { title, content, category, tags } = req.body;
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `UPDATE knowledge_base SET title = COALESCE($1, title), content = COALESCE($2, content),
        category = COALESCE($3, category), tags = COALESCE($4, tags::jsonb), updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [title, content, category, tags ? JSON.stringify(tags) : null, id]
    );
    if (result.rows.length === 0) { await client.query('ROLLBACK').catch(() => {}); res.status(404).json({ error: 'Article not found' }); return; }
    await client.query('COMMIT');
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('updateKnowledgeBase failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const deleteKnowledgeBase = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await getAdminClient();
  try {
    const result = await client.query('DELETE FROM knowledge_base WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) { await client.query('ROLLBACK').catch(() => {}); res.status(404).json({ error: 'Article not found' }); return; }
    await client.query('COMMIT');
    res.json({ data: { id: result.rows[0].id, deleted: true } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('deleteKnowledgeBase failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// BROADCASTS
// ====================================================================
export const listBroadcasts = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT b.*, p.email AS sent_by_email FROM platform_broadcasts b LEFT JOIN platform_admins p ON p.id = b.sent_by ORDER BY b.created_at DESC LIMIT 100`
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('listBroadcasts failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const createBroadcast = async (req: Request, res: Response): Promise<void> => {
  const { title, content, target_roles } = req.body;
  if (!title || !content) { res.status(400).json({ error: 'title and content are required' }); return; }
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `INSERT INTO platform_broadcasts (title, content, target_roles, sent_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, content, JSON.stringify(target_roles || []), req.platformAdmin?.platform_admin_id]
    );
    await client.query('COMMIT');
    await client.query(`INSERT INTO activity_logs (gym_id, platform_admin_id, action_description, ip_address) VALUES (NULL, $1, $2, $3)`,
      [req.platformAdmin?.platform_admin_id, `Broadcast sent: ${title}`, req.ip]);
    await client.query('COMMIT');
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('createBroadcast failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

