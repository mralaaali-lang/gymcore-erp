import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';
import { logPlatformAudit } from '../utils/platformAudit';

/** Safely extract error message from unknown error type */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * §46 — كوبونات الخصم في وجه السوبر-أدمان.
 *
 * الصيغة القانونية هي صيغة 043 (`type` / `value` / `used_count` / `starts_at` /
 * `expires_at`) لأنها التي يعمل بها خصم الطلبات الحقيقي في `coupon.service.ts`.
 * أعمدة صيغة 022 (`discount_type` / `discount_value` / `current_uses` /
 * `valid_until`) لم تعد تُقرأ ولا تُكتب — migration 080 رحّل بياناتها إن كانت
 * موجودة، فالكود السابق كان يسقط 500 على أي قاعدة بنية 043 (وهي المحلية).
 *
 * الخصم على مستوى الباقة نفسه («قبل/بعد» في كارت الباقة) ليس كوبونًا وله
 * أعمدته ودواله في `platformBilling.ts` + `planPricing.service.ts`.
 */

const COUPON_COLUMNS = `id, code, description, type, value, max_uses, used_count,
  min_order_amount, min_plan_tier, max_discount_amount, starts_at, expires_at,
  is_active, platform_wide, gym_id, created_by, created_at, updated_at`;

/** قائمة بيضاء: لا اسم عمود يدخل SQL من جسم الطلب. */
const COUPON_EDITABLE = [
  'code', 'description', 'type', 'value', 'max_uses', 'min_order_amount',
  'min_plan_tier', 'max_discount_amount', 'starts_at', 'expires_at', 'is_active',
] as const;

const TIERS = ['basic', 'premium', 'enterprise'] as const;

/** نسبة مئوية فوق 100 معناها مبلغ سالب المنطق — تُرفض قبل أن تصل للفاتورة. */
function couponProblem(type: unknown, value: unknown): string | null {
  if (type !== 'percentage' && type !== 'fixed_amount') {
    return 'type must be "percentage" or "fixed_amount".';
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 'value must be a non-negative number.';
  if (type === 'percentage' && n > 100) return 'نسبة الخصم لازم تكون بين 0 و100.';
  return null;
}

export const listCoupons = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT ${COUPON_COLUMNS} FROM billing_coupons ORDER BY created_at DESC LIMIT 200`
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listCoupons failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const createCoupon = async (req: Request, res: Response): Promise<void> => {
  const {
    code, description, type, value, max_uses, min_order_amount,
    min_plan_tier, max_discount_amount, starts_at, expires_at, is_active,
  } = req.body ?? {};
  if (!code || !type || value === undefined || value === null) {
    res.status(400).json({ error: 'code, type, and value are required.', code: 'MISSING_FIELDS' });
    return;
  }
  const problem = couponProblem(type, value);
  if (problem) {
    res.status(400).json({ error: problem, code: 'INVALID_COUPON' });
    return;
  }
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `INSERT INTO billing_coupons
         (code, description, type, value, max_uses, used_count, min_order_amount,
          min_plan_tier, max_discount_amount, starts_at, expires_at, is_active,
          platform_wide, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, coalesce($9, NOW()), $10,
               coalesce($11, true), true, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING ${COUPON_COLUMNS}`,
      [
        String(code).trim().toUpperCase(), description || null, type, value,
        max_uses ?? null, min_order_amount ?? 0, min_plan_tier ?? null,
        max_discount_amount ?? null, starts_at ?? null, expires_at ?? null,
        is_active, req.platformAdmin?.platform_admin_id ?? null,
      ]
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'CREATE', tableName: 'billing_coupons', recordId: result.rows[0].id, newValues: result.rows[0], req });
    res.status(201).json({ data: result.rows[0] });
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    const pgError = error as { code?: string; message: string };
    if (pgError.code === '23505') {
      res.status(409).json({ error: 'A coupon with this code already exists.', code: 'COUPON_EXISTS' });
      return;
    }
    logger.error('createCoupon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

/** PUT /billing/coupons/:id — تعديل أي حقل أُرسل؛ والـ null يمسح الحقل. */
export const updateCoupon = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { id } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const existingResult = await client.query(
      `SELECT ${COUPON_COLUMNS} FROM billing_coupons WHERE id = $1`, [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      res.status(404).json({ error: 'Coupon not found.', code: 'NOT_FOUND' });
      await client.query('COMMIT');
      return;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const addCol = (col: string, value: unknown) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };
    for (const field of COUPON_EDITABLE) {
      if (body[field] === undefined) continue;
      const value = field === 'code' && body[field] !== null
        ? String(body[field]).trim().toUpperCase()
        : body[field];
      addCol(field, value === '' ? null : value);
    }
    if (sets.length === 0) {
      res.status(400).json({ error: 'No editable field was sent.', code: 'EMPTY_UPDATE' });
      await client.query('COMMIT');
      return;
    }

    // التحقق على الحالة النهائية بعد الدمج، لا على ما وصل وحده
    const merged = { ...existing, ...body };
    const problem = couponProblem(merged.type, merged.value);
    if (problem) {
      res.status(400).json({ error: problem, code: 'INVALID_COUPON' });
      await client.query('COMMIT');
      return;
    }

    params.push(id);
    const result = await client.query(
      `UPDATE billing_coupons SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${params.length} RETURNING ${COUPON_COLUMNS}`,
      params
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'UPDATE', tableName: 'billing_coupons', recordId: id, oldValues: existing, newValues: result.rows[0], req });
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    if (getErrorMessage(error).includes('billing_coupons_code_key')) {
      res.status(409).json({ error: 'A coupon with this code already exists.', code: 'COUPON_EXISTS' });
      return;
    }
    logger.error('updateCoupon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

/** PATCH /billing/coupons/:id/toggle — تفعيل/تعطيل، وبلا body يقلب الحالة. */
export const toggleCoupon = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { id } = req.params;
    const requested = req.body?.active;
    const result = await client.query(
      `UPDATE billing_coupons
         SET is_active = CASE WHEN $1::text IS NULL THEN NOT is_active ELSE ($1::text)::boolean END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING ${COUPON_COLUMNS}`,
      [requested === undefined ? null : String(Boolean(requested)), id]
    );
    const coupon = result.rows[0];
    if (!coupon) {
      await client.query('COMMIT');
      res.status(404).json({ error: 'Coupon not found.', code: 'NOT_FOUND' });
      return;
    }
    await client.query('COMMIT');
    await logPlatformAudit({
      action: coupon.is_active ? 'ACTIVATE' : 'DEACTIVATE',
      tableName: 'billing_coupons', recordId: id,
      newValues: { is_active: coupon.is_active, code: coupon.code }, req,
    });
    res.json({ data: coupon });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('toggleCoupon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const deleteCoupon = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await getAdminClient();
  try {
    // كوبون استُخدم أو سُجّل على فاتورة لا يُمحى: أرقام الفواتير تاريخ مقدّس.
    const refs = await client.query(
      `SELECT
         (SELECT count(*)::int FROM billing_invoices WHERE coupon_id = $1) AS invoices,
         (SELECT count(*)::int FROM billing_coupon_usage WHERE coupon_id = $1) AS usages`,
      [id]
    );
    const { invoices, usages } = refs.rows[0];
    const found = await client.query('SELECT code, is_active FROM billing_coupons WHERE id = $1', [id]);
    if (!found.rows.length) {
      await client.query('COMMIT');
      res.status(404).json({ error: 'Coupon not found.', code: 'NOT_FOUND' });
      return;
    }
    if (invoices > 0 || usages > 0) {
      const disabled = await client.query(
        `UPDATE billing_coupons SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 RETURNING ${COUPON_COLUMNS}`, [id]
      );
      await client.query('COMMIT');
      await logPlatformAudit({
        action: 'DEACTIVATE', tableName: 'billing_coupons', recordId: id,
        oldValues: { is_active: found.rows[0].is_active },
        newValues: { is_active: false, invoices, usages }, req,
      });
      res.json({
        data: {
          id, deleted: false, deactivated: true, invoices, usages,
          message: `الكوبون مستخدم في ${invoices} فاتورة و${usages} مرة — عُطّل بدل الحذف.`,
        },
      });
      return;
    }
    const result = await client.query('DELETE FROM billing_coupons WHERE id = $1 RETURNING code', [id]);
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'DELETE', tableName: 'billing_coupons', recordId: id, oldValues: { code: result.rows[0].code }, req });
    res.json({ data: { id, deleted: true, deactivated: false, message: `Coupon ${result.rows[0].code} deleted.` } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('deleteCoupon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const validateCoupon = async (req: Request, res: Response): Promise<void> => {
  const { code, plan_tier } = req.body ?? {};
  if (!code) { res.status(400).json({ error: 'Coupon code is required.' }); return; }
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT ${COUPON_COLUMNS} FROM billing_coupons
        WHERE code = $1
          AND is_active = true
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (max_uses IS NULL OR used_count < max_uses)`,
      [String(code).trim().toUpperCase()]
    );
    await client.query('COMMIT');
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Invalid or expired coupon.' });
      return;
    }
    const coupon = result.rows[0];
    if (coupon.min_plan_tier && plan_tier) {
      if (TIERS.indexOf(plan_tier) < TIERS.indexOf(coupon.min_plan_tier)) {
        res.status(400).json({ error: `Coupon requires at least the ${coupon.min_plan_tier} plan.` });
        return;
      }
    }
    res.json({ data: coupon });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('validateCoupon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};
