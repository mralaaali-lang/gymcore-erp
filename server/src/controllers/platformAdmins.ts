import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';
import { logPlatformAudit } from '../utils/platformAudit';

const PASSWORD_HASH_COST = 12;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDuplicateAdminIdentifier(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: string }).code === '23505';
}

function normalizeOptionalPhone(phone: unknown): string | null | undefined {
  if (phone === undefined) return undefined;
  if (phone === null) return null;
  const normalized = String(phone).trim();
  return normalized || null;
}

async function keepOneActiveSuperAdmin(client: Awaited<ReturnType<typeof getAdminClient>>, id: string): Promise<boolean> {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM platform_admins
     WHERE is_active = true AND role_type = 'super_admin' AND id <> $1`,
    [id]
  );
  return Number(result.rows[0]?.count ?? 0) > 0;
}

export const listPlatformAdmins = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT id, email, phone_number, full_name, is_active, role_type, last_login_at, created_at
       FROM platform_admins ORDER BY created_at DESC`
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listPlatformAdmins failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

export const createPlatformAdmin = async (req: Request, res: Response): Promise<void> => {
  const { email, password, full_name, role_type } = req.body;
  const phoneNumber = normalizeOptionalPhone(req.body.phone_number);
  if (!email || !password || !full_name) {
    res.status(400).json({ error: 'email, password, and full_name are required.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters.' });
    return;
  }

  const client = await getAdminClient();
  try {
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_COST);
    const result = await client.query(
      `INSERT INTO platform_admins (email, phone_number, password_hash, full_name, role_type, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, email, phone_number, full_name, role_type, is_active, created_at`,
      [String(email).trim().toLowerCase(), phoneNumber ?? null, passwordHash, full_name, role_type || 'support_admin']
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'CREATE', tableName: 'platform_admins', recordId: result.rows[0].id, newValues: result.rows[0], req });
    res.status(201).json({ data: result.rows[0] });
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    if (isDuplicateAdminIdentifier(error)) {
      res.status(409).json({ error: 'An admin with this email or phone number already exists.' });
      return;
    }
    logger.error('createPlatformAdmin failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

export const updatePlatformAdmin = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { email, password, full_name, is_active, role_type } = req.body;
  const phoneNumber = normalizeOptionalPhone(req.body.phone_number);
  const client = await getAdminClient();

  try {
    // Serialize role/status changes so concurrent requests cannot deactivate the last super admin.
    await client.query('LOCK TABLE platform_admins IN SHARE ROW EXCLUSIVE MODE');
    const currentResult = await client.query(
      `SELECT id, email, is_active, role_type FROM platform_admins WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Admin not found.' });
      return;
    }

    const nextRole = role_type ?? current.role_type;
    const nextActive = is_active ?? current.is_active;
    const removesSuperAdminAccess = current.is_active && current.role_type === 'super_admin'
      && (!nextActive || nextRole !== 'super_admin');
    if (removesSuperAdminAccess && !(await keepOneActiveSuperAdmin(client, id))) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'At least one active super admin must remain.' });
      return;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const add = (column: string, value: unknown) => {
      sets.push(`${column} = $${idx++}`);
      params.push(value);
    };

    if (email !== undefined) add('email', String(email).trim().toLowerCase());
    if (req.body.phone_number !== undefined) add('phone_number', phoneNumber ?? null);
    if (full_name !== undefined) add('full_name', full_name);
    if (is_active !== undefined) add('is_active', is_active);
    if (role_type !== undefined) add('role_type', role_type);
    if (password !== undefined) add('password_hash', await bcrypt.hash(password, PASSWORD_HASH_COST));

    if (sets.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'No fields to update.' });
      return;
    }

    const result = await client.query(
      `UPDATE platform_admins SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, email, phone_number, full_name, is_active, role_type`,
      [...params, id]
    );

    const credentialsOrAccessChanged = email !== undefined || req.body.phone_number !== undefined || password !== undefined
      || is_active !== undefined || role_type !== undefined;
    if (credentialsOrAccessChanged) {
      await client.query(
        `UPDATE platform_admin_sessions
         SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE platform_admin_id = $1 AND revoked_at IS NULL`,
        [id]
      );
    }

    await client.query('COMMIT');
    await logPlatformAudit({
      action: 'UPDATE', tableName: 'platform_admins', recordId: id,
      oldValues: current,
      newValues: { ...result.rows[0], password_rotated: password !== undefined, sessions_revoked: credentialsOrAccessChanged },
      req,
    });
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    if (isDuplicateAdminIdentifier(error)) {
      res.status(409).json({ error: 'An admin with this email or phone number already exists.' });
      return;
    }
    logger.error('updatePlatformAdmin failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

/** DELETE removes access but preserves the admin row and its audit references. */
export const deletePlatformAdmin = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await getAdminClient();
  try {
    await client.query('LOCK TABLE platform_admins IN SHARE ROW EXCLUSIVE MODE');
    const currentResult = await client.query(
      `SELECT id, email, is_active, role_type FROM platform_admins WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Admin not found.' });
      return;
    }

    if (current.is_active && current.role_type === 'super_admin'
      && !(await keepOneActiveSuperAdmin(client, id))) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'At least one active super admin must remain.' });
      return;
    }

    await client.query(`UPDATE platform_admins SET is_active = false WHERE id = $1`, [id]);
    await client.query(
      `UPDATE platform_admin_sessions
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE platform_admin_id = $1 AND revoked_at IS NULL`,
      [id]
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'DEACTIVATE', tableName: 'platform_admins', recordId: id, oldValues: current, newValues: { is_active: false }, req });
    res.json({ data: { message: 'Admin access deactivated; account history was preserved.' } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('deletePlatformAdmin failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};
