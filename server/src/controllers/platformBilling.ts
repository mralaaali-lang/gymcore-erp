import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';
import { logPlatformAudit } from '../utils/platformAudit';
import {
  resolvePlanPricing,
  pricingProblem,
  discountPercent,
  type PlanPricingPatch,
  type ResolvedPlanPricing,
} from '../services/planPricing.service';

/** Safely extract error message from unknown error type */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// §46 — الحقول القابلة للتحرير على الباقة (نفس الأسماء في الواجهة والـschema)
const PLAN_EDITABLE_FIELDS = [
  'name', 'name_ar', 'badge', 'badge_ar', 'max_staff', 'max_members', 'max_gyms',
] as const;

/** الحقول المالية فقط — تُفصل عن بقية الحقول لأن لها منطق اتساق خاص. */
function pricingPatchOf(body: Record<string, unknown>): PlanPricingPatch {
  const keys: Array<keyof PlanPricingPatch> = [
    'price_monthly', 'price_yearly',
    'list_price_monthly', 'list_price_yearly',
    'discounted_price_monthly', 'discounted_price_yearly',
    'discount_active',
  ];
  const patch: PlanPricingPatch = {};
  for (const key of keys) {
    if (body[key] !== undefined) (patch as Record<string, unknown>)[key] = body[key];
  }
  return patch;
}

/**
 * طبقة الخصم لا تُكتب أبدًا يدويًا في SQL: تُحلَّ كل الأعمدة المالية معًا من
 * الدالة النقية، فيستحيل أن يُكتب `price_*` قيمة تخالف `discount_active`.
 */
function pricingColumns(pricing: ResolvedPlanPricing): Record<string, unknown> {
  return {
    price_monthly: pricing.price_monthly,
    price_yearly: pricing.price_yearly,
    list_price_monthly: pricing.list_price_monthly,
    list_price_yearly: pricing.list_price_yearly,
    discounted_price_monthly: pricing.discounted_price_monthly,
    discounted_price_yearly: pricing.discounted_price_yearly,
    discount_active: pricing.discount_active,
  };
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

/** سطر الباقة الحالي —كل عمليات الكتابة تبدأ منه حتى تُحلَّ الأسعار بمعرفة الحالة المخزّنة. */
async function loadPlan(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }, id: string) {
  const result = await client.query('SELECT * FROM billing_plans WHERE id = $1 AND deleted_at IS NULL', [id]);
  return result.rows[0] ?? null;
}

/** الكروت المالية المحسوبة التي تُرد مع كل باقة (لا تُخزَّن — مشتقة دائمًا). */
function withPlanDerived(plan: any) {
  const pricing = resolvePlanPricing(plan);
  // خصم السنوي مقابل الشهري×12 (قاعدة 065: شهران مجانًا)
  let annual_discount_percent = 0;
  if (Number(plan.price_monthly) > 0 && Number(plan.price_yearly) > 0) {
    const annualIfMonthly = Number(plan.price_monthly) * 12;
    annual_discount_percent = Math.max(0, Math.round((1 - Number(plan.price_yearly) / annualIfMonthly) * 100));
  }
  const hasDiscount = Boolean(plan.discount_active)
    && (plan.discounted_price_monthly !== null || plan.discounted_price_yearly !== null);
  return {
    ...plan,
    annual_discount_percent,
    discount_percent: discountPercent(pricing),
    has_discount: hasDiscount,
  };
}

export const listBillingPlans = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    // §46: افتراضيًا الكتالوج النشط فقط (شاشات الإبرام وإضافة صالة لا يصح أن
    // تعرض باقات معطّلة)، ومع ?include_archived=true تظهر القديمة التي لا تزال
    // تحمل عقودًا سارية حتى تظل مقروءة في سجل التدقيق.
    const includeArchived = ['true', '1'].includes(String(req.query.include_archived ?? ''));
    const result = await client.query(
      `SELECT * FROM billing_plans
        WHERE deleted_at IS NULL
          ${includeArchived ? '' : 'AND is_active'}
        ORDER BY is_active DESC, price_yearly ASC, price_monthly ASC`
    );
    await client.query('COMMIT');
    res.json({ data: result.rows.map(withPlanDerived) });
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
    const body = req.body as Record<string, any>;
    const { name, name_ar, badge, badge_ar, max_staff, max_members, max_gyms, features } = body;
    if (!name || !name_ar) {
      res.status(400).json({ error: 'name and name_ar are required' });
      await client.query('COMMIT');
      return;
    }
    const pricing = resolvePlanPricing({}, pricingPatchOf(body));
    const problem = pricingProblem(pricing);
    if (problem) {
      res.status(400).json({ error: problem, code: 'INVALID_PRICING' });
      await client.query('COMMIT');
      return;
    }
    const staff = max_staff ?? 5;
    const gyms = max_gyms ?? 1;
    const result = await client.query(
      `INSERT INTO billing_plans
         (name, name_ar, price_monthly, price_yearly,
          list_price_monthly, list_price_yearly,
          discounted_price_monthly, discounted_price_yearly, discount_active,
          max_staff, max_members, max_gyms, max_employees, max_branches,
          features, highlights, highlights_en, badge, badge_ar, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        name, name_ar, pricing.price_monthly, pricing.price_yearly,
        pricing.list_price_monthly, pricing.list_price_yearly,
        pricing.discounted_price_monthly, pricing.discounted_price_yearly, pricing.discount_active,
        staff, max_members ?? 100, gyms, staff, gyms,
        JSON.stringify(features ?? { modules: {} }),
        JSON.stringify(body.highlights ?? []),
        JSON.stringify(body.highlights_en ?? []),
        badge ?? null, badge_ar ?? null,
        body.is_active === undefined ? true : Boolean(body.is_active),
      ]
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'CREATE', tableName: 'billing_plans', recordId: result.rows[0].id, newValues: result.rows[0], req });
    res.status(201).json({ data: withPlanDerived(result.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    if (getErrorMessage(error).includes('idx_billing_plans_name')) {
      res.status(409).json({ error: 'A plan with this name already exists.', code: 'PLAN_NAME_TAKEN' });
      return;
    }
    logger.error('createBillingPlan failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const updateBillingPlan = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { id } = req.params;
    const body = req.body as Record<string, any>;
    const existing = await loadPlan(client, id);
    if (!existing) {
      res.status(404).json({ error: 'Plan not found' });
      await client.query('COMMIT');
      return;
    }
    const pricing = resolvePlanPricing(existing, pricingPatchOf(body));
    const problem = pricingProblem(pricing);
    if (problem) {
      res.status(400).json({ error: problem, code: 'INVALID_PRICING' });
      await client.query('COMMIT');
      return;
    }

    // البناء ديناميكي لكن الأعمدة من قوائم حرفية ثابتة — لا حقل من body يدخل SQL نصًا.
    const sets: string[] = [];
    const params: unknown[] = [];
    const addCol = (col: string, value: unknown) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };

    for (const field of PLAN_EDITABLE_FIELDS) {
      if (body[field] !== undefined) addCol(field, body[field]);
    }
    if (body.features !== undefined) addCol('features', JSON.stringify(body.features));
    if (body.highlights !== undefined) addCol('highlights', JSON.stringify(body.highlights));
    if (body.highlights_en !== undefined) addCol('highlights_en', JSON.stringify(body.highlights_en));
    if (body.is_active !== undefined) addCol('is_active', body.is_active === true || body.is_active === 'true');
    for (const [col, value] of Object.entries(pricingColumns(pricing))) addCol(col, value);
    // الأعمدة القديمة المكررة للحدود (036) تظل مرآة صحيحة: planGuard يقرأ max_branches
    // من billing_plans، فلو تحرّك max_gyms وحده تبقى الحدود متضاربة.
    if (body.max_staff !== undefined) addCol('max_employees', body.max_staff);
    if (body.max_gyms !== undefined) addCol('max_branches', body.max_gyms);

    params.push(id);
    const result = await client.query(`UPDATE billing_plans SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'UPDATE', tableName: 'billing_plans', recordId: id, oldValues: existing, newValues: result.rows[0], req });
    res.json({ data: withPlanDerived(result.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateBillingPlan failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// §46 — خصم الباقة: إنشاء/تعديل، تفعيل/تعطيل، حذف
// ====================================================================

/** POST /billing/plans/:id/discount — يقيم أو يعدّل خصم الباقة (السعران + حالة التفعيل). */
export const setPlanDiscount = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { id } = req.params;
    const body = req.body as Record<string, any>;
    const existing = await loadPlan(client, id);
    if (!existing) {
      res.status(404).json({ error: 'Plan not found' });
      await client.query('COMMIT');
      return;
    }
    const pricing = resolvePlanPricing(existing, {
      list_price_monthly: body.list_price_monthly,
      list_price_yearly: body.list_price_yearly,
      discounted_price_monthly: body.discounted_price_monthly,
      discounted_price_yearly: body.discounted_price_yearly,
      discount_active: body.active === undefined ? true : Boolean(body.active),
    });
    const problem = pricingProblem(pricing);
    if (problem) {
      res.status(400).json({ error: problem, code: 'INVALID_DISCOUNT' });
      await client.query('COMMIT');
      return;
    }
    const result = await client.query(
      `UPDATE billing_plans SET
         list_price_monthly = $1, list_price_yearly = $2,
         discounted_price_monthly = $3, discounted_price_yearly = $4,
         discount_active = $5, price_monthly = $6, price_yearly = $7
       WHERE id = $8 RETURNING *`,
      [
        pricing.list_price_monthly, pricing.list_price_yearly,
        pricing.discounted_price_monthly, pricing.discounted_price_yearly,
        pricing.discount_active, pricing.price_monthly, pricing.price_yearly, id,
      ]
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'UPDATE', tableName: 'billing_plans', recordId: id, oldValues: existing, newValues: result.rows[0], req });
    res.json({ data: withPlanDerived(result.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('setPlanDiscount failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

/** PATCH /billing/plans/:id/discount/toggle — بلا body يقلب الحالة، ومع `active` يحدّدها. */
export const togglePlanDiscount = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { id } = req.params;
    const existing = await loadPlan(client, id);
    if (!existing) {
      res.status(404).json({ error: 'Plan not found' });
      await client.query('COMMIT');
      return;
    }
    const requested = req.body?.active;
    const nextActive = requested === undefined ? !existing.discount_active : Boolean(requested);
    if (nextActive && existing.discounted_price_monthly === null && existing.discounted_price_yearly === null) {
      res.status(400).json({
        error: 'لا يوجد سعر مخفّض لهذه الباقة — أضف «السعر الآن» أولًا.',
        code: 'NO_DISCOUNT_PRICE',
      });
      await client.query('COMMIT');
      return;
    }
    const pricing = resolvePlanPricing(existing, { discount_active: nextActive });
    const problem = pricingProblem(pricing);
    if (problem) {
      res.status(400).json({ error: problem, code: 'INVALID_DISCOUNT' });
      await client.query('COMMIT');
      return;
    }
    const result = await client.query(
      `UPDATE billing_plans SET
         discount_active = $1, price_monthly = $2, price_yearly = $3
       WHERE id = $4 RETURNING *`,
      [pricing.discount_active, pricing.price_monthly, pricing.price_yearly, id]
    );
    await client.query('COMMIT');
    await logPlatformAudit({
      action: pricing.discount_active ? 'ACTIVATE' : 'DEACTIVATE',
      tableName: 'billing_plans', recordId: id,
      oldValues: { discount_active: existing.discount_active, price_monthly: existing.price_monthly, price_yearly: existing.price_yearly },
      newValues: { discount_active: pricing.discount_active, price_monthly: pricing.price_monthly, price_yearly: pricing.price_yearly },
      req,
    });
    res.json({ data: withPlanDerived(result.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('togglePlanDiscount failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

/** DELETE /billing/plans/:id/discount — يحذف الخصم ويعيد الباقة لسعرها الكامل (الباقة نفسها تبقى). */
export const deletePlanDiscount = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { id } = req.params;
    const existing = await loadPlan(client, id);
    if (!existing) {
      res.status(404).json({ error: 'Plan not found' });
      await client.query('COMMIT');
      return;
    }
    // السعر الكامل المرجعي هو price القادم؛ وحيث لا يوجد سعر كامل (خصم أُدخل
    // بدون مرجع) يبقى السعر الحالي كما هو بدل أن يُصفَّر.
    const fullMonthly = existing.list_price_monthly ?? existing.price_monthly;
    const fullYearly = existing.list_price_yearly ?? existing.price_yearly;
    const result = await client.query(
      `UPDATE billing_plans SET
         price_monthly = $1, price_yearly = $2,
         list_price_monthly = NULL, list_price_yearly = NULL,
         discounted_price_monthly = NULL, discounted_price_yearly = NULL,
         discount_active = false
       WHERE id = $3 RETURNING *`,
      [fullMonthly, fullYearly, id]
    );
    await client.query('COMMIT');
    await logPlatformAudit({
      action: 'DELETE', tableName: 'billing_plans', recordId: id,
      oldValues: {
        list_price_monthly: existing.list_price_monthly, list_price_yearly: existing.list_price_yearly,
        discounted_price_monthly: existing.discounted_price_monthly, discounted_price_yearly: existing.discounted_price_yearly,
        discount_active: existing.discount_active,
      },
      newValues: { discount_active: false, price_monthly: fullMonthly, price_yearly: fullYearly },
      req,
    });
    res.json({ data: withPlanDerived(result.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('deletePlanDiscount failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const deleteBillingPlan = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { id } = req.params;
    const existing = await loadPlan(client, id);
    if (!existing) {
      res.status(404).json({ error: 'Plan not found' });
      await client.query('COMMIT');
      return;
    }
    // حذف فعلي مستحيل ما دام هناك عقد/فاتورة/صالة تشير للباقة — الأرقام التاريخية
    // مقدسة. الحل: تعطيل (تخرج من الإبرام ومن إضافة صالة) وتبقى في «المؤرشفة».
    const refs = await client.query(
      `SELECT
         (SELECT count(*)::int FROM platform_contracts WHERE plan_id = $1 AND status = 'active') AS live_contracts,
         (SELECT count(*)::int FROM billing_invoices   WHERE plan_id = $1) AS invoices,
         (SELECT count(*)::int FROM gyms               WHERE plan_id = $1) AS gyms`,
      [id]
    );
    const { live_contracts, invoices, gyms } = refs.rows[0];
    if (live_contracts > 0 || invoices > 0 || gyms > 0) {
      const disabled = await client.query(
        'UPDATE billing_plans SET is_active = false WHERE id = $1 RETURNING *', [id]
      );
      await client.query('COMMIT');
      await logPlatformAudit({
        action: 'DEACTIVATE', tableName: 'billing_plans', recordId: id,
        oldValues: { is_active: existing.is_active },
        newValues: { is_active: false, live_contracts, invoices, gyms }, req,
      });
      res.json({
        data: {
          id, deleted: false, deactivated: true, live_contracts, invoices, gyms,
        },
        message: `الباقة عليها ${live_contracts} عقد سارٍ و${gyms} صالة — عُطّلت بدل الحذف حتى لا تتغير أرقام تاريخية.`,
      });
      return;
    }
    const result = await client.query('DELETE FROM billing_plans WHERE id = $1 RETURNING id, name', [id]);
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'DELETE', tableName: 'billing_plans', recordId: id, oldValues: existing, req });
    res.json({ data: { id: result.rows[0].id, deleted: true, deactivated: false } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    if (getErrorMessage(error).includes('foreign key')) {
      res.status(409).json({ error: 'Plan is referenced by contracts or invoices — cancel them first.', code: 'PLAN_IN_USE' });
      return;
    }
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
