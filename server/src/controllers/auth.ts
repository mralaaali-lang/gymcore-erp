import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query, getAdminClient } from '../config/database';
import { setTenantGymId } from '../config/tenantContext';
import logger from '../config/logger';
import { getFrontendUrl } from '../config/frontendUrl';
import { sendPasswordResetEmail } from '../services/email';
import type { TokenPayload } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET as string;
const ACCESS_TOKEN_EXPIRY = '5m';
const REFRESH_TOKEN_EXPIRY = '7d';

/**
 * GET /auth/me — identity for cookie-based sessions (staff and members).
 * The web clients hold only HttpOnly cookies, so session restore after a
 * page reload must ask the server who is logged in instead of decoding a
 * storage token (there is none by design).
 * Includes a minimal `gym` block (name/subdomain/plan/currency) so tenant
 * pages never need the platform-only /platform/gyms/:id endpoint (403 for
 * managers — dashboard GymInfo card was stuck on loading because of it).
 */
const gymBrief = async (gymId: string) => {
  const g = await query(
    `SELECT g.id, g.name, g.subdomain, g.plan_tier, g.currency, g.subscription_status, g.is_active,
            gt.trial_end,
            CASE WHEN gt.trial_end > NOW()
                 THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (gt.trial_end - NOW())) / 86400))::int
                 ELSE NULL END AS trial_days_remaining
     FROM gyms g
     LEFT JOIN gym_trials gt ON gt.gym_id = g.id
     WHERE g.id = $1`,
    [gymId]
  );
  return g.rows[0] ?? null;
};

export const getAuthMe = async (req: Request, res: Response): Promise<void> => {
  const s = req.staff!;
  try {
    if (s.role === 'member' && s.member_id) {
      const r = await query(
        `SELECT id, full_name, gym_id FROM members WHERE id = $1 AND gym_id = $2`,
        [s.member_id, s.gym_id]
      );
      if (r.rows.length === 0) {
        res.status(401).json({ error: 'Session no longer valid.' });
        return;
      }
      const gym = await gymBrief(r.rows[0].gym_id);
      res.json({ user: { id: r.rows[0].id, full_name: r.rows[0].full_name, role: 'member', gym_id: r.rows[0].gym_id }, gym });
      return;
    }
    const r = await query(
      `SELECT id, full_name, email, role, gym_id FROM staff_users WHERE id = $1 AND gym_id = $2`,
      [s.staff_user_id, s.gym_id]
    );
    if (r.rows.length === 0) {
      res.status(401).json({ error: 'Session no longer valid.' });
      return;
    }
    const gym = await gymBrief(r.rows[0].gym_id);
    res.json({ user: r.rows[0], gym });
  } catch (error) {
    logger.error('auth/me failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge,
  path: '/',
});

function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshToken(payload: Pick<TokenPayload, 'staff_user_id' | 'gym_id'>, jti: string): string {
  return jwt.sign(
    { staff_user_id: payload.staff_user_id, gym_id: payload.gym_id, type: 'refresh', jti },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

export const staffLogin = async (req: Request, res: Response): Promise<void> => {
  const { email, phone_number, phone, password } = req.body;

  // Accept either phone_number or phone field name
  const phoneVal = phone_number || phone;

  if ((!email && !phoneVal) || !password) {
    res.status(400).json({ error: 'Email or phone and password are required.' });
    return;
  }

  try {
    // Cross-tenant lookup by email or phone — gym_id isn't known yet, so this
    // must run on an explicit RLS-bypass connection, never the shared
    // per-request client (which would otherwise be scoped to gym_id = '' and
    // see zero rows once RLS is actually enforced).
    //
    // NOTE: staff_users has UNIQUE(gym_id, email), not a global-unique email
    // constraint, so the same email could technically exist in more than
    // one gym. This lookup takes the first match, same as before this fix —
    // that pre-existing ambiguity is unchanged here and worth revisiting
    // separately (either enforce a global-unique email, or require a
    // gym/subdomain selector at login).
    const adminClient = await getAdminClient();
    let staff;
    try {
      let result;
      if (phoneVal) {
        // staff_users has a `phone` column (not `phone_number`)
        result = await adminClient.query(
          `SELECT id, gym_id, email, password_hash, full_name, role, is_active
           FROM staff_users WHERE phone = $1`,
          [phoneVal]
        );
      } else {
        result = await adminClient.query(
          `SELECT id, gym_id, email, password_hash, full_name, role, is_active
           FROM staff_users WHERE email = $1`,
          [email]
        );
      }
      await adminClient.query('COMMIT');
      staff = result.rows[0];
    } catch (e) {
      await adminClient.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      adminClient.release();
    }

    if (!staff) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const passwordValid = await bcrypt.compare(password, staff.password_hash);

    if (!staff.is_active) {
      logger.warn('Deactivated account login attempt', { email, staffId: staff.id });
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    // We now know which gym this staff member belongs to — scope the rest
    // of this request's queries to it so RLS applies correctly from here on.
    setTenantGymId(staff.gym_id);

    const gymResult = await query(
      `SELECT is_active FROM gyms WHERE id = $1`,
      [staff.gym_id]
    );

    if (gymResult.rows.length === 0 || !gymResult.rows[0].is_active) {
      // 14-day grace policy: is_active=false means suspended (manually by the
      // platform, or automatically after the grace elapsed). Data is intact —
      // the gym admin must renew/reactivate via the platform.
      logger.warn('Suspended gym staff login attempt', { email, staffId: staff.id, gymId: staff.gym_id });
      res.status(403).json({
        error: 'تم إيقاف حساب الصالة مؤقتًا — يرجى تجديد الاشتراك أو التواصل مع إدارة المنصة.',
        code: 'GYM_SUSPENDED',
      });
      return;
    }

    const jti = crypto.randomUUID();
    const tokenPayload: TokenPayload = {
      staff_user_id: staff.id,
      gym_id: staff.gym_id,
      role: staff.role,
      jti,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ staff_user_id: staff.id, gym_id: staff.gym_id }, jti);

    res.cookie('access_token', accessToken, cookieOptions(5 * 60 * 1000));
    res.cookie('refresh_token', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

    // Store refresh token for rotation detection
    await query(
      `INSERT INTO refresh_tokens (staff_user_id, gym_id, token_jti, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [staff.id, staff.gym_id, jti]
    );

    // Record session for Session Management UI
    await query(
      `INSERT INTO user_sessions (staff_user_id, gym_id, token_jti, user_agent, ip_address, device_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [staff.id, staff.gym_id, jti, req.headers['user-agent'] || null, req.ip, req.headers['sec-ch-ua-platform'] || null]
    );

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [staff.gym_id, staff.id, `Staff login: ${staff.full_name} (${staff.role})`, req.ip]
    );

    res.status(200).json({
      expires_in: 300,
      user: {
        id: staff.id,
        full_name: staff.full_name,
        email: staff.email,
        role: staff.role,
        gym_id: staff.gym_id,
      },
    });
  } catch (error) {
    logger.error('Staff login failed', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const refreshAccessToken = async (req: Request, res: Response): Promise<void> => {
  const refresh_token = req.body.refresh_token || (req as any).cookies?.refresh_token;

  if (!refresh_token) {
    res.status(400).json({ error: 'Refresh token is required.' });
    return;
  }

  try {
    const decoded = jwt.verify(refresh_token, JWT_SECRET) as { staff_user_id: string; gym_id: string; type: string; jti: string };

    if (decoded.type !== 'refresh') {
      res.status(403).json({ error: 'Invalid token type.' });
      return;
    }

    // This route runs before authenticateAndIsolateTenant (there's no access
    // token to authenticate with yet — that's the whole point of a refresh
    // endpoint), so the shared per-request client has no gym_id scoped to it
    // yet. The refresh token itself already carries gym_id, so use it.
    setTenantGymId(decoded.gym_id);

    // Check if this jti exists and is not revoked
    const tokenResult = await query(
      `SELECT id, revoked_at FROM refresh_tokens WHERE token_jti = $1 AND staff_user_id = $2`,
      [decoded.jti, decoded.staff_user_id]
    );

    if (tokenResult.rows.length === 0) {
      // Possible replay attack — revoke ALL refresh tokens for this user
      logger.warn('Refresh token replay detected — revoking all sessions', { staffId: decoded.staff_user_id });
      await query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE staff_user_id = $1 AND revoked_at IS NULL`,
        [decoded.staff_user_id]
      );
      res.status(403).json({ error: 'Invalid or expired refresh token.' });
      return;
    }

    const stored = tokenResult.rows[0];
    if (stored.revoked_at) {
      res.status(403).json({ error: 'Invalid or expired refresh token.' });
      return;
    }

    const staffResult = await query(
      `SELECT id, gym_id, role, is_active FROM staff_users WHERE id = $1`,
      [decoded.staff_user_id]
    );

    if (staffResult.rows.length === 0 || !staffResult.rows[0].is_active) {
      res.status(403).json({ error: 'Staff account no longer active.' });
      return;
    }

    const staff = staffResult.rows[0];

    // Suspension enforcement must also cover token refresh — otherwise staff of
    // a suspended gym could ride an existing session for the full refresh-token
    // lifetime (7 days) even though fresh logins are blocked.
    const gymResult = await query(
      `SELECT is_active FROM gyms WHERE id = $1`,
      [decoded.gym_id]
    );
    if (gymResult.rows.length === 0 || !gymResult.rows[0].is_active) {
      logger.warn('Suspended gym token refresh attempt', { staffId: staff.id, gymId: decoded.gym_id });
      res.status(403).json({
        error: 'تم إيقاف حساب الصالة مؤقتًا — يرجى تجديد الاشتراك أو التواصل مع إدارة المنصة.',
        code: 'GYM_SUSPENDED',
      });
      return;
    }

    // Revoke old refresh token
    await query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
      [stored.id]
    );

    // Issue new tokens
    const tokenPayload: TokenPayload = {
      staff_user_id: staff.id,
      gym_id: staff.gym_id,
      role: staff.role,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newJti = crypto.randomUUID();
    const newRefreshToken = generateRefreshToken({ staff_user_id: staff.id, gym_id: staff.gym_id }, newJti);

    await query(
      `INSERT INTO refresh_tokens (staff_user_id, gym_id, token_jti, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [staff.id, staff.gym_id, newJti]
    );

    res.cookie('access_token', newAccessToken, cookieOptions(5 * 60 * 1000));
    res.cookie('refresh_token', newRefreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

    res.status(200).json({
      expires_in: 300,
      user: {
        id: staff.id,
        full_name: staff.full_name,
        email: staff.email,
        role: staff.role,
        gym_id: staff.gym_id,
      },
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ error: 'Invalid or expired refresh token.' });
      return;
    }
    logger.error('Token refresh failed', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const staffLogout = async (_req: Request, res: Response): Promise<void> => {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
  res.status(200).json({ message: 'Logged out successfully.' });
};

export const createStaffAccount = async (req: Request, res: Response): Promise<void> => {
  const { email, password, full_name, role } = req.body;
  const gym_id = req.staff?.gym_id;
  const creator_role = req.staff?.role;

  if (creator_role !== 'manager') {
    res.status(403).json({ error: 'Only gym managers can create staff accounts.' });
    return;
  }

  try {
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await query(
      `INSERT INTO staff_users (gym_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, role`,
      [gym_id, email, password_hash, full_name, role]
    );

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, req.staff?.staff_user_id, `Created staff account: ${full_name} (${role})`, req.ip]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (error: unknown) {
    const pgError = error as { code?: string; message: string };
    if (pgError.code === '23505') {
      res.status(400).json({ error: 'A staff account with this email already exists in your gym.' });
      return;
    }
    logger.error('Failed to create staff account', { requestId: (req as any).requestId, error: pgError.message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// ====================================================================
// FORGOT / RESET PASSWORD (staff_users)
// ====================================================================
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  // Always return the same generic response whether or not the email
  // exists, and regardless of how far we got — this endpoint must not be
  // usable to enumerate which emails have accounts.
  const genericOk = () => res.status(200).json({
    message: 'إذا كان البريد الإلكتروني مسجلاً لدينا، سيصلك رابط لإعادة تعيين كلمة المرور.',
  });

  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const frontendUrl = getFrontendUrl();
  if (!frontendUrl) {
    logger.error('Password reset unavailable: FRONTEND_URL must be a valid HTTPS URL in staging/production.');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT id, full_name FROM staff_users WHERE email = $1 AND is_active = true`,
      [email]
    );

    if (result.rows.length === 0) {
      await client.query('COMMIT');
      genericOk();
      return;
    }

    const staff = result.rows[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await client.query(
      `INSERT INTO password_reset_tokens (staff_user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [staff.id, tokenHash, expiresAt]
    );
    await client.query('COMMIT');

    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}&type=staff`;
    await sendPasswordResetEmail(email, resetLink, staff.full_name);

    genericOk();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('forgotPassword failed', { error: (error as Error).message });
    // Still respond generically — don't leak internal errors either.
    genericOk();
  } finally {
    client.release();
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
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
      `SELECT id, staff_user_id, expires_at, used_at FROM password_reset_tokens
       WHERE token_hash = $1 AND staff_user_id IS NOT NULL`,
      [tokenHash]
    );
    const row = result.rows[0];

    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(400).json({ error: 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية.' });
      return;
    }

    const passwordHash = await bcrypt.hash(new_password, 12);
    await client.query(`UPDATE staff_users SET password_hash = $1 WHERE id = $2`, [passwordHash, row.staff_user_id]);
    await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id]);
    // Force re-login everywhere: invalidate every existing refresh token for
    // this account, since the old password (and any session built on it)
    // should no longer be trusted once it's been reset.
    await client.query(`DELETE FROM refresh_tokens WHERE staff_user_id = $1`, [row.staff_user_id]);

    await client.query('COMMIT');
    res.status(200).json({ message: 'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('resetPassword failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// SESSION MANAGEMENT — List active sessions & revoke specific sessions
// ====================================================================

export const listSessions = async (req: Request, res: Response): Promise<void> => {
  const staff_user_id = req.staff?.staff_user_id;
  const gym_id = req.staff?.gym_id;
  if (!staff_user_id || !gym_id) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const result = await query(
      `SELECT id, token_jti, user_agent, ip_address, device_name, last_active_at, created_at
       FROM user_sessions
       WHERE staff_user_id = $1 AND gym_id = $2 AND revoked_at IS NULL
       ORDER BY last_active_at DESC`,
      [staff_user_id, gym_id]
    );
    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Failed to list sessions', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const revokeSession = async (req: Request, res: Response): Promise<void> => {
  const { jti } = req.params;
  const staff_user_id = req.staff?.staff_user_id;
  const gym_id = req.staff?.gym_id;
  if (!staff_user_id || !gym_id) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const result = await query(
      `UPDATE user_sessions SET revoked_at = NOW()
       WHERE token_jti = $1 AND staff_user_id = $2 AND gym_id = $3 AND revoked_at IS NULL
       RETURNING id`,
      [jti, staff_user_id, gym_id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Session not found or already revoked.' });
      return;
    }
    // Also revoke the corresponding refresh token
    await query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_jti = $1 AND staff_user_id = $2`,
      [jti, staff_user_id]
    ).catch(() => {});

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, staff_user_id, `Revoked session ${jti.slice(0, 8)}`, req.ip]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Failed to revoke session', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const revokeAllOtherSessions = async (req: Request, res: Response): Promise<void> => {
  const staff_user_id = req.staff?.staff_user_id;
  const currentJti = req.staff?.jti;
  const gym_id = req.staff?.gym_id;
  if (!staff_user_id || !gym_id) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const result = await query(
      `UPDATE user_sessions SET revoked_at = NOW()
       WHERE staff_user_id = $1 AND gym_id = $2
         AND token_jti != $3 AND revoked_at IS NULL
       RETURNING id`,
      [staff_user_id, gym_id, currentJti]
    );
    if (result.rows.length > 0) {
      await query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE staff_user_id = $1 AND token_jti != $2 AND revoked_at IS NULL`,
        [staff_user_id, currentJti]
      ).catch(() => {});
    }
    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, staff_user_id, `Revoked all other sessions (${result.rows.length})`, req.ip]
    );

    res.status(200).json({ success: true, revoked: result.rows.length });
  } catch (error) {
    logger.error('Failed to revoke all sessions', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};
