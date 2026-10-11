import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';

/** Safely extract error message from unknown error type */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const listCoupons = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT * FROM billing_coupons ORDER BY created_at DESC LIMIT 100`
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
  const { code, description, discount_type, discount_value, max_uses, max_discount_amount, min_plan_tier, valid_until, min_amount, first_purchase_only } = req.body;
  if (!code || !discount_type || discount_value === undefined) {
    res.status(400).json({ error: 'code, discount_type, and discount_value are required.' });
    return;
  }
  if (!['percentage', 'fixed'].includes(discount_type)) {
    res.status(400).json({ error: 'discount_type must be "percentage" or "fixed".' });
    return;
  }
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `INSERT INTO billing_coupons (code, description, discount_type, discount_value, max_uses, max_discount_amount, min_plan_tier, valid_until, min_amount, first_purchase_only, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [code.toUpperCase(), description || null, discount_type, discount_value, max_uses || 1,
       max_discount_amount || null, min_plan_tier || null, valid_until || null,
       min_amount || null, first_purchase_only || false,
       req.platformAdmin?.platform_admin_id]
    );
    await client.query('COMMIT');
    res.status(201).json({ data: result.rows[0] });
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    const pgError = error as { code?: string; message: string };
    if (pgError.code === '23505') {
      res.status(400).json({ error: 'A coupon with this code already exists.' });
      return;
    }
    logger.error('createCoupon failed', { error: pgError.message });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const deleteCoupon = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await getAdminClient();
  try {
    const result = await client.query('DELETE FROM billing_coupons WHERE id = $1 RETURNING code', [id]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(404).json({ error: 'Coupon not found.' });
      return;
    }
    await client.query('COMMIT');
    res.json({ data: { message: `Coupon ${result.rows[0].code} deleted.` } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('deleteCoupon failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const validateCoupon = async (req: Request, res: Response): Promise<void> => {
  const { code, plan_tier } = req.body;
  if (!code) { res.status(400).json({ error: 'Coupon code is required.' }); return; }
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT * FROM billing_coupons WHERE code = $1 AND is_active = true AND (valid_until IS NULL OR valid_until > NOW()) AND current_uses < max_uses`,
      [code.toUpperCase()]
    );
    await client.query('COMMIT');
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Invalid or expired coupon.' });
      return;
    }
    const coupon = result.rows[0];
    if (coupon.min_plan_tier && plan_tier) {
      const tiers = ['basic', 'professional', 'enterprise'];
      if (tiers.indexOf(plan_tier) < tiers.indexOf(coupon.min_plan_tier)) {
        res.status(400).json({ error: `Coupon requires at least ${coupon.min_plan_tier} plan.` });
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
