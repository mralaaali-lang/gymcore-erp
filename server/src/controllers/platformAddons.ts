import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { PoolClient } from 'pg';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';
import { logPlatformAudit } from '../utils/platformAudit';

/** Safely extract error message from unknown error type */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ====================================================================
// §36 → §40: الوحدات والإضافات — الكتالوج في billing_addons، والتشغيل
// الفعلي عبر بنود عقود المنصة (platform_contract_addons). إسناد gym_addons
// اليدوي مُوقف (migration 068): قراءات وكتابة هذه المسارات تتم على بنود
// العقد الساري، مع تسجيل كل تغيير في platform_audit_logs.
// ====================================================================

// GET /billing/addons — الكتالوج كامل مع عدد البنود السارية في العقود
export const listAddons = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT ba.*,
              (SELECT count(*)::int FROM platform_contract_addons pca
                JOIN platform_contracts c ON c.id = pca.contract_id
                WHERE pca.addon_id = ba.id AND pca.status = 'active' AND c.status = 'active'
                  AND (pca.expires_at IS NULL OR pca.expires_at >= CURRENT_DATE)) AS live_assignments
       FROM billing_addons ba
       ORDER BY ba.is_active DESC, ba.price_monthly ASC, ba.created_at ASC`
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listAddons failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// POST /billing/addons
export const createAddon = async (req: Request, res: Response): Promise<void> => {
  const { code, name, name_ar, module_keys, limit_column, limit_amount, price_monthly, price_yearly } = req.body;
  if (!code || !name || !name_ar) {
    res.status(400).json({ error: 'code, name and name_ar are required.' });
    return;
  }
  const keys = Array.isArray(module_keys) ? module_keys : [];
  if (keys.some((k: unknown) => typeof k !== 'string' || !k.trim())) {
    res.status(400).json({ error: 'module_keys must be an array of non-empty strings.' });
    return;
  }
  if (limit_column && !['max_members', 'max_staff'].includes(limit_column)) {
    res.status(400).json({ error: 'limit_column must be max_members or max_staff.' });
    return;
  }
  if (limit_column && !(Number.isInteger(limit_amount) && (limit_amount as number) > 0)) {
    res.status(400).json({ error: 'limit_amount must be a positive integer when limit_column is set.' });
    return;
  }
  if (!keys.length && !limit_column) {
    res.status(400).json({ error: 'An addon must either enable module_keys or raise a limit.' });
    return;
  }

  const client = await getAdminClient();
  try {
    const result = await client.query(
      `INSERT INTO billing_addons (code, name, name_ar, pricing_type, price, module_keys, limit_column, limit_amount, price_monthly, price_yearly)
       VALUES ($1, $2, $3, 'subscription', $4, $5::jsonb, $6, $7, $4, $8)
       RETURNING *`,
      [code.trim(), name.trim(), name_ar.trim(), Number(price_monthly) || 0,
       JSON.stringify(keys), limit_column || null, limit_amount || null, Number(price_yearly) || 0]
    );
    await client.query('COMMIT');
    res.status(201).json({ data: result.rows[0] });
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Addon code already exists.' });
      return;
    }
    Sentry.captureException(error);
    logger.error('createAddon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// PUT /billing/addons/:id — تعديل جزئي (أسعار/اسم/تفعيل)
export const updateAddon = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, name_ar, module_keys, limit_column, limit_amount, price_monthly, price_yearly, is_active } = req.body;

  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (name !== undefined) add('name', String(name).trim());
  if (name_ar !== undefined) add('name_ar', String(name_ar).trim());
  if (module_keys !== undefined) add('module_keys', JSON.stringify(Array.isArray(module_keys) ? module_keys : []));
  if (limit_column !== undefined) add('limit_column', limit_column || null);
  if (limit_amount !== undefined) add('limit_amount', limit_amount || null);
  if (price_monthly !== undefined) add('price_monthly', Number(price_monthly) || 0);
  if (price_yearly !== undefined) add('price_yearly', Number(price_yearly) || 0);
  if (is_active !== undefined) add('is_active', !!is_active);

  if (sets.length === 0) {
    res.status(400).json({ error: 'No fields provided to update.' });
    return;
  }

  const client = await getAdminClient();
  try {
    const result = await client.query(
      `UPDATE billing_addons SET ${sets.join(', ')} WHERE id = $${params.length + 1} RETURNING *`,
      [...params, id]
    );
    await client.query('COMMIT');
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Addon not found.' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateAddon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// DELETE /billing/addons/:id —soft إن كان عليها بنود سارية، hard بصفتها فارغة
export const deleteAddon = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await getAdminClient();
  try {
    const used = await client.query(
      `SELECT count(*)::int AS n FROM platform_contract_addons pca
        JOIN platform_contracts c ON c.id = pca.contract_id
       WHERE pca.addon_id = $1 AND pca.status = 'active' AND c.status = 'active'`,
      [id]
    );
    if (used.rows[0].n > 0) {
      await client.query(
        `UPDATE billing_addons SET is_active = false WHERE id = $1`,
        [id]
      );
      await client.query('COMMIT');
      res.json({ data: { soft_deleted: true, live_assignments: used.rows[0].n } });
      return;
    }
    const result = await client.query(`DELETE FROM billing_addons WHERE id = $1 RETURNING id`, [id]);
    await client.query('COMMIT');
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Addon not found.' });
      return;
    }
    res.json({ data: { deleted: true } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('deleteAddon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// §40 write-through: نقاط /gyms/:id/addons تعمل الآن على بنود عقد الصالة
// الساري (منصات العقود بديلة عن إسناد gym_addons اليدوي).
// ====================================================================

async function activeContractOf(client: PoolClient, gymId: string): Promise<{ id: string; cycle: string } | null> {
  const r = await client.query(
    `SELECT id, cycle FROM platform_contracts WHERE gym_id = $1 AND status = 'active'`,
    [gymId]
  );
  return r.rows[0] ?? null;
}

/** شكل بند العقد بنفس أعمدة السند القديم حتى لا ينكسر التاب الحالي */
const GYM_ADDON_ITEM_SELECT = `
  SELECT pca.id, c.gym_id, pca.contract_id, pca.addon_id,
         pca.unit_price AS price_charged, pca.unit_price, pca.quantity,
         pca.cycle, pca.status, pca.started_at, pca.expires_at,
         pca.cancelled_at, pca.notes, pca.created_at, pca.updated_at,
         ba.code, ba.name, ba.name_ar, ba.module_keys, ba.limit_column, ba.limit_amount,
         ba.price_monthly AS catalog_price_monthly, ba.price_yearly AS catalog_price_yearly,
         (pca.expires_at IS NOT NULL AND pca.expires_at < CURRENT_DATE) AS is_expired
  FROM platform_contract_addons pca
  JOIN platform_contracts c ON c.id = pca.contract_id
  JOIN billing_addons ba ON ba.id = pca.addon_id
  WHERE c.gym_id = $1`;

// GET /gyms/:id/addons — بنود عقد الصالة الساري (سارية وملغاة)
export const listGymAddons = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await getAdminClient();
  try {
    const gym = await client.query('SELECT id FROM gyms WHERE id = $1', [id]);
    if (gym.rows.length === 0) {
      await client.query('COMMIT');
      res.status(404).json({ error: 'Gym not found.' });
      return;
    }
    const result = await client.query(
      `${GYM_ADDON_ITEM_SELECT} ORDER BY pca.status = 'active' DESC, pca.created_at DESC`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listGymAddons failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// POST /gyms/:id/addons — إضافة بند إلى عقد الصالة الساري بسعر اختياري
// body: { addon_id | code, cycle?, price_charged?, expires_at?, notes? }
export const grantGymAddon = async (req: Request, res: Response): Promise<void> => {
  const { id: gymId } = req.params;
  const { addon_id, code, cycle, price_charged, expires_at, notes } = req.body;

  if (cycle !== undefined && !['monthly', 'yearly'].includes(cycle)) {
    res.status(400).json({ error: 'cycle must be monthly or yearly.' });
    return;
  }
  if (price_charged !== undefined && !(Number(price_charged) >= 0)) {
    res.status(400).json({ error: 'price_charged must be a non-negative number.' });
    return;
  }

  const client = await getAdminClient();
  try {
    const contract = await activeContractOf(client, gymId);
    if (!contract) {
      await client.query('COMMIT');
      res.status(400).json({ error: 'The gym has no active contract — sign one first from Billing > Contracts.', code: 'NO_CONTRACT' });
      return;
    }
    const addonRes = addon_id
      ? await client.query('SELECT * FROM billing_addons WHERE id = $1', [addon_id])
      : await client.query('SELECT * FROM billing_addons WHERE code = $1', [String(code ?? '').trim()]);
    if (addonRes.rows.length === 0) {
      await client.query('COMMIT');
      res.status(404).json({ error: 'Addon not found.' });
      return;
    }
    const addon = addonRes.rows[0];
    if (!addon.is_active) {
      await client.query('COMMIT');
      res.status(400).json({ error: 'Addon is inactive in the catalog.' });
      return;
    }
    const dup = await client.query(
      `SELECT id FROM platform_contract_addons WHERE contract_id = $1 AND addon_id = $2 AND status = 'active'`,
      [contract.id, addon.id]
    );
    if (dup.rows.length) {
      await client.query('COMMIT');
      res.status(409).json({ error: 'This addon is already an active line on the contract.', code: 'ITEM_EXISTS' });
      return;
    }

    const chosenCycle = cycle === 'yearly' ? 'yearly' : 'monthly';
    const catalogPrice = Number(
      chosenCycle === 'yearly' ? addon.price_yearly : addon.price_monthly
    ) || Number(addon.price) || 0;
    const finalPrice = price_charged !== undefined ? Number(price_charged) : catalogPrice;

    const inserted = await client.query(
      `INSERT INTO platform_contract_addons (contract_id, addon_id, quantity, unit_price, cycle, status, started_at, expires_at, notes, added_by)
       VALUES ($1, $2, 1, $3, $4, 'active', CURRENT_DATE, $5, $6, $7)
       RETURNING id`,
      [contract.id, addon.id, finalPrice, chosenCycle,
       expires_at ? String(expires_at).slice(0, 10) : null, notes || null,
       req.platformAdmin?.platform_admin_id || null]
    );
    const row = await client.query(`${GYM_ADDON_ITEM_SELECT} AND pca.id = $2`, [gymId, inserted.rows[0].id]);
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'GRANT', tableName: 'platform_contract_addons', recordId: inserted.rows[0].id, newValues: row.rows[0], req });
    res.status(201).json({ data: row.rows[0] });
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'This addon is already an active line on the contract.' });
      return;
    }
    Sentry.captureException(error);
    logger.error('grantGymAddon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// PUT /gyms/:gymId/addons/:itemId — تعديل سعر/تاريخ انتهاء/ملاحظة بند ساري
export const updateGymAddon = async (req: Request, res: Response): Promise<void> => {
  const { gymId, itemId } = req.params;
  const { price_charged, unit_price, quantity, expires_at, notes } = req.body;

  const price = price_charged !== undefined ? price_charged : unit_price;
  if (price !== undefined && !(Number(price) >= 0)) {
    res.status(400).json({ error: 'price_charged must be a non-negative number.' });
    return;
  }

  const client = await getAdminClient();
  try {
    const before = await client.query(
      `SELECT pca.* FROM platform_contract_addons pca
       JOIN platform_contracts c ON c.id = pca.contract_id
       WHERE pca.id = $1 AND c.gym_id = $2 AND pca.status = 'active' FOR UPDATE`,
      [itemId, gymId]
    );
    if (before.rows.length === 0) {
      await client.query('COMMIT');
      res.status(404).json({ error: 'Active contract item not found for this gym.' });
      return;
    }
    await client.query(
      `UPDATE platform_contract_addons SET
         unit_price = coalesce($2::numeric, unit_price),
         quantity = coalesce($3::int, quantity),
         expires_at = CASE WHEN $4::text = '' THEN NULL ELSE coalesce($4::date, expires_at) END,
         notes = coalesce($5::text, notes)
       WHERE id = $1`,
      [itemId,
       price !== undefined ? Number(price) : null,
       quantity !== undefined ? parseInt(String(quantity), 10) || null : null,
       expires_at === undefined ? null : (expires_at ? String(expires_at).slice(0, 10) : ''),
       notes ?? null]
    );
    const row = await client.query(`${GYM_ADDON_ITEM_SELECT} AND pca.id = $2`, [gymId, itemId]);
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'UPDATE', tableName: 'platform_contract_addons', recordId: itemId, oldValues: before.rows[0], newValues: row.rows[0], req });
    res.json({ data: row.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateGymAddon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// POST /gyms/:gymId/addons/:itemId/cancel — إيقاف البند مع إبقاء الأثر
export const cancelGymAddon = async (req: Request, res: Response): Promise<void> => {
  const { gymId, itemId } = req.params;
  const client = await getAdminClient();
  try {
    const before = await client.query(
      `SELECT pca.* FROM platform_contract_addons pca
       JOIN platform_contracts c ON c.id = pca.contract_id
       WHERE pca.id = $1 AND c.gym_id = $2 AND pca.status = 'active' FOR UPDATE`,
      [itemId, gymId]
    );
    if (before.rows.length === 0) {
      await client.query('COMMIT');
      res.status(404).json({ error: 'Active contract item not found for this gym.' });
      return;
    }
    await client.query(
      `UPDATE platform_contract_addons SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
      [itemId]
    );
    const row = await client.query(`${GYM_ADDON_ITEM_SELECT} AND pca.id = $2`, [gymId, itemId]);
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'REVOKE', tableName: 'platform_contract_addons', recordId: itemId, oldValues: before.rows[0], newValues: row.rows[0], req });
    res.json({ data: row.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('cancelGymAddon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};
