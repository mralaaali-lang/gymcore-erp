import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';

/** Safely extract error message from unknown error type */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const initiateFawryPayment = async (req: Request, res: Response): Promise<void> => {
  const { gym_id, amount, invoice_id } = req.body;
  if (!gym_id || !amount) {
    res.status(400).json({ error: 'gym_id and amount are required.' });
    return;
  }
  // In production, this would call Fawry API.
  // For now, we simulate a successful payment reference.
  const fawryRefNumber = `FWR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const client = await getAdminClient();
  try {
    if (invoice_id) {
      await client.query(
        `UPDATE billing_invoices SET payment_method = 'fawry', fawry_ref_number = $1, status = 'paid', paid_at = NOW() WHERE id = $2`,
        [fawryRefNumber, invoice_id]
      );
    }
    await client.query('COMMIT');
    res.json({
      data: {
        fawry_ref_number: fawryRefNumber,
        payment_url: `https://atfawry.com/pay/${fawryRefNumber}`,
        amount,
        message: 'Payment initiated successfully.',
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('initiateFawryPayment failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// BILLING PLANS & INVOICES
// ====================================================================
export const listBillingPlans = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query('SELECT * FROM billing_plans ORDER BY price_monthly ASC');
    const rows = result.rows.map((plan: any) => {
      // Compute annual discount percentage dynamically
      let annual_discount_percent = 0;
      if (plan.price_monthly > 0 && plan.price_yearly > 0) {
        const annualIfMonthly = plan.price_monthly * 12;
        annual_discount_percent = Math.round((1 - plan.price_yearly / annualIfMonthly) * 100);
        if (annual_discount_percent < 0) annual_discount_percent = 0;
      }
      return { ...plan, annual_discount_percent };
    });
    await client.query('COMMIT');
    res.json({ data: rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listBillingPlans failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const createBillingPlan = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, features } = req.body;
    if (!name || !name_ar) {
      res.status(400).json({ error: 'name and name_ar are required' });
      return;
    }
    const result = await client.query(
      `INSERT INTO billing_plans (name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, features)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, name_ar, price_monthly || 0, price_yearly || 0, max_staff || 5, max_members || 100, max_gyms || 1, JSON.stringify(features || [])]
    );
    await client.query('COMMIT');
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('createBillingPlan failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const updateBillingPlan = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { id } = req.params;
    const { name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, features, is_active } = req.body;
    const result = await client.query(
      `UPDATE billing_plans SET
        name = COALESCE($1, name),
        name_ar = COALESCE($2, name_ar),
        price_monthly = COALESCE($3, price_monthly),
        price_yearly = COALESCE($4, price_yearly),
        max_staff = COALESCE($5, max_staff),
        max_members = COALESCE($6, max_members),
        max_gyms = COALESCE($7, max_gyms),
        features = COALESCE($8, features::text)::jsonb,
        is_active = COALESCE($9, is_active)
       WHERE id = $10 RETURNING *`,
      [name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, features ? JSON.stringify(features) : null, is_active, id]
    );
    await client.query('COMMIT');
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateBillingPlan failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const deleteBillingPlan = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { id } = req.params;
    const result = await client.query('DELETE FROM billing_plans WHERE id = $1 RETURNING id', [id]);
    await client.query('COMMIT');
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    res.json({ data: { id: result.rows[0].id, deleted: true } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('deleteBillingPlan failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const listInvoices = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { status, limit: qLimit } = req.query;
    const limit = Math.min(parseInt(qLimit as string) || 50, 200);
    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let i = 1;
    if (status) {
      whereClause += ` AND i.status = $${i++}`;
      params.push(status);
    }
    const result = await client.query(
      `SELECT i.*, g.name AS gym_name, p.name AS plan_name
       FROM billing_invoices i
       LEFT JOIN gyms g ON g.id = i.gym_id
       LEFT JOIN billing_plans p ON p.id = i.plan_id
       ${whereClause} ORDER BY i.created_at DESC LIMIT $${i}`,
      [...params, limit]
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listInvoices failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const getBillingSummary = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0)::numeric(10,2) AS paid_total,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0)::numeric(10,2) AS pending_total,
        COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue_count
      FROM billing_invoices
    `);
    const plans = await client.query('SELECT COUNT(*)::int AS total FROM billing_plans WHERE is_active');
    const activeGyms = await client.query('SELECT COUNT(*)::int AS total FROM gyms WHERE is_active');
    await client.query('COMMIT');
    res.json({ data: { ...result.rows[0], plans: plans.rows[0].total, active_gyms: activeGyms.rows[0].total } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
     logger.error('getBillingSummary failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// CUSTOM PLANS (per-gym tailored plan)
// ====================================================================
export const createCustomPlan = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { gym_id, name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, features, trial_days, notes } = req.body;
    if (!gym_id || !name) {
      res.status(400).json({ error: 'gym_id and name are required' });
      return;
    }
    // Deactivate any previous custom plan for this gym
    await client.query(`UPDATE billing_plans SET is_active = false WHERE id IN (
      SELECT plan_id FROM gym_custom_plans WHERE gym_id = $1
    )`, [gym_id]);

    const result = await client.query(
      `INSERT INTO billing_plans (name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, features, is_active, is_custom)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, true)
       RETURNING *`,
      [name, name_ar, price_monthly || 0, price_yearly || 0, max_staff || 5, max_members || 100, max_gyms || 1, JSON.stringify(features || [])]
    );
    const plan = result.rows[0];
    // Insert into gym_custom_plans linking table
    await client.query(
      `INSERT INTO gym_custom_plans (gym_id, plan_id, trial_days, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [gym_id, plan.id, trial_days || 0, notes || null, (req as any).admin?.id || null]
    );
    await client.query('COMMIT');
    res.status(201).json({ data: { ...plan, gym_id, trial_days: trial_days || 0 } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('createCustomPlan failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const listCustomPlans = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(`
      SELECT p.*, gcp.gym_id, gcp.trial_days, gcp.notes, gcp.created_at AS assigned_at,
             g.name AS gym_name
      FROM gym_custom_plans gcp
      JOIN billing_plans p ON p.id = gcp.plan_id
      JOIN gyms g ON g.id = gcp.gym_id
      WHERE p.is_custom = true
      ORDER BY gcp.created_at DESC
    `);
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listCustomPlans failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// TRIAL PERIOD MANAGEMENT
// ====================================================================
export const setTrialPeriod = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { gym_id, trial_days, plan_id } = req.body;
    if (!gym_id || trial_days === undefined) {
      res.status(400).json({ error: 'gym_id and trial_days are required' });
      return;
    }
    // Update or insert into gym_trials table
    const result = await client.query(`
      INSERT INTO gym_trials (gym_id, plan_id, trial_days, trial_start, trial_end)
      VALUES ($1, $2, $3, NOW(), NOW() + ($3 || ' days')::interval)
      ON CONFLICT (gym_id) DO UPDATE SET
        plan_id = COALESCE($2, gym_trials.plan_id),
        trial_days = $3,
        trial_start = NOW(),
        trial_end = NOW() + ($3 || ' days')::interval,
        updated_at = NOW()
      RETURNING *
    `, [gym_id, plan_id || null, trial_days]);
    await client.query('COMMIT');
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('setTrialPeriod failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const listTrials = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(`
      SELECT gt.*, g.name AS gym_name, bp.name AS plan_name, bp.name_ar AS plan_name_ar
      FROM gym_trials gt
      JOIN gyms g ON g.id = gt.gym_id
      LEFT JOIN billing_plans bp ON bp.id = gt.plan_id
      ORDER BY gt.trial_end ASC
    `);
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listTrials failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// AUTO UPGRADE / DOWNGRADE RULES
// ====================================================================
export const setAutoUpgradeRule = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { gym_id, rule_type, threshold_metric, threshold_value, target_plan_id, action, enabled } = req.body;
    if (!gym_id || !rule_type || !threshold_metric || !threshold_value || !target_plan_id) {
      res.status(400).json({ error: 'gym_id, rule_type, threshold_metric, threshold_value, target_plan_id are required' });
      return;
    }
    const result = await client.query(`
      INSERT INTO auto_upgrade_rules (gym_id, rule_type, threshold_metric, threshold_value, target_plan_id, action, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (gym_id, rule_type) DO UPDATE SET
        threshold_metric = $3, threshold_value = $4, target_plan_id = $5,
        action = COALESCE($6, auto_upgrade_rules.action),
        enabled = COALESCE($7, auto_upgrade_rules.enabled),
        updated_at = NOW()
      RETURNING *
    `, [gym_id, rule_type, threshold_metric, threshold_value, target_plan_id, action || 'upgrade', enabled ?? true]);
    await client.query('COMMIT');
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('setAutoUpgradeRule failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const listAutoUpgradeRules = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(`
      SELECT aur.*, g.name AS gym_name, bp.name AS target_plan_name, bp.name_ar AS target_plan_name_ar
      FROM auto_upgrade_rules aur
      JOIN gyms g ON g.id = aur.gym_id
      LEFT JOIN billing_plans bp ON bp.id = aur.target_plan_id
      ORDER BY aur.created_at DESC
    `);
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listAutoUpgradeRules failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const deleteAutoUpgradeRule = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { id } = req.params;
    const result = await client.query('DELETE FROM auto_upgrade_rules WHERE id = $1 RETURNING id', [id]);
    await client.query('COMMIT');
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    res.json({ data: { id: result.rows[0].id, deleted: true } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('deleteAutoUpgradeRule failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const getPricingEngine = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT id, name, name_ar, price_monthly, price_yearly,
              max_members, max_employees, max_branches,
              features, is_active
         FROM billing_plans
        ORDER BY price_monthly ASC`
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('getPricingEngine failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};
