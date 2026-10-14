import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';

/** Safely extract error message from unknown error type */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ====================================================================
// §36: الوحدات والإضافات — كتالوج billing_addons + إسناد gym_addons
// كل القراءة والكتابة من شاشة السوبر-أدمن فقط.
// ====================================================================

// GET /billing/addons — الكتالوج كامل مع عدد الإسنادات السارية لكل إضافة
export const listAddons = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT ba.*,
              (SELECT count(*)::int FROM gym_addons ga
                WHERE ga.addon_id = ba.id AND ga.status = 'active'
                  AND (ga.expires_at IS NULL OR ga.expires_at >= NOW())) AS live_assignments
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

// DELETE /billing/addons/:id —soft إن كان عليها إسنادات، hard بصفتها فارغة
export const deleteAddon = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await getAdminClient();
  try {
    const used = await client.query(
      `SELECT count(*)::int AS n FROM gym_addons WHERE addon_id = $1 AND status = 'active'`,
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

// GET /gyms/:id/addons — كل الإسنادات (سارية وملغاة) مع بيانات الكتالوج
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
      `SELECT ga.*, ba.code, ba.name, ba.name_ar, ba.module_keys, ba.limit_column, ba.limit_amount,
              ba.price_monthly AS catalog_price_monthly, ba.price_yearly AS catalog_price_yearly,
              (ga.expires_at IS NOT NULL AND ga.expires_at < NOW()) AS is_expired
       FROM gym_addons ga
       JOIN billing_addons ba ON ba.id = ga.addon_id
       WHERE ga.gym_id = $1
       ORDER BY ga.status = 'active' DESC, ga.created_at DESC`,
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

// POST /gyms/:id/addons — إسناد بسعر مخفّض اختياري
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
    const gym = await client.query('SELECT id FROM gyms WHERE id = $1', [gymId]);
    if (gym.rows.length === 0) {
      await client.query('COMMIT');
      res.status(404).json({ error: 'Gym not found.' });
      return;
    }
    const addonRes = addon_id
      ? await client.query('SELECT * FROM billing_addons WHERE id = $1', [addon_id])
      : await client.query('SELECT * FROM billing_addons WHERE code = $1', [String(code).trim()]);
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

    const chosenCycle = cycle === 'yearly' ? 'yearly' : 'monthly';
    // السعر الافتراضي من الكتالوج حسب الدورة؛ price_charged صريح يتقدم (تخفيض السوبر-أدمن)
    const catalogPrice = Number(
      chosenCycle === 'yearly' ? addon.price_yearly : addon.price_monthly
    ) || Number(addon.price) || 0;
    const finalPrice = price_charged !== undefined ? Number(price_charged) : catalogPrice;

    const result = await client.query(
      `INSERT INTO gym_addons (gym_id, addon_id, price_charged, cycle, status, expires_at, notes, granted_by)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7)
       RETURNING *`,
      [gymId, addon.id, finalPrice, chosenCycle, expires_at || null, notes || null, req.platformAdmin?.platform_admin_id || null]
    );
    await client.query('COMMIT');
    res.status(201).json({ data: result.rows[0] });
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'This addon is already assigned to the gym.' });
      return;
    }
    Sentry.captureException(error);
    logger.error('grantGymAddon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// PUT /gyms/:gymId/addons/:assignmentId — تعديل سعر/تاريخ انتهاء/ملاحظة سند ساري
export const updateGymAddon = async (req: Request, res: Response): Promise<void> => {
  const { gymId, assignmentId } = req.params;
  const { price_charged, expires_at, notes } = req.body;

  if (price_charged !== undefined && !(Number(price_charged) >= 0)) {
    res.status(400).json({ error: 'price_charged must be a non-negative number.' });
    return;
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (price_charged !== undefined) add('price_charged', Number(price_charged));
  if (expires_at !== undefined) add('expires_at', expires_at || null);
  if (notes !== undefined) add('notes', notes || null);
  if (sets.length === 0) {
    res.status(400).json({ error: 'No fields provided to update.' });
    return;
  }

  const client = await getAdminClient();
  try {
    const result = await client.query(
      `UPDATE gym_addons SET ${sets.join(', ')}
       WHERE id = $${params.length + 1} AND gym_id = $${params.length + 2} AND status = 'active'
       RETURNING *`,
      [...params, assignmentId, gymId]
    );
    await client.query('COMMIT');
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Active assignment not found for this gym.' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateGymAddon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// POST /gyms/:gymId/addons/:assignmentId/cancel — إلغاء مع إبقاء الأثر
export const cancelGymAddon = async (req: Request, res: Response): Promise<void> => {
  const { gymId, assignmentId } = req.params;
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `UPDATE gym_addons SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1 AND gym_id = $2 AND status = 'active'
       RETURNING *`,
      [assignmentId, gymId]
    );
    await client.query('COMMIT');
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Active assignment not found for this gym.' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('cancelGymAddon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};
