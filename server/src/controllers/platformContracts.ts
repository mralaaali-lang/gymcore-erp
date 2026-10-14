import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';
import { logPlatformAudit } from '../utils/platformAudit';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * §40 — عقود المنصة (مصدر الحقيقة التعاقدية بدل إسناد gym_addons اليدوي).
 * عقد واحد سارٍ لكل صالة (قيد جزئي)، بنود وحدات فوقه، وفواتير دورية منسوبة له.
 * كل كتابة: (1) داخل نفس transaction العميل، (2) تُسجَّل في platform_audit_logs
 * بقيم old/new، (3) تُحدِّث مرآة gyms.plan_id عبر trigger العقد (068).
 */

const CYCLES = ['monthly', 'yearly'] as const;
type Cycle = (typeof CYCLES)[number];

function cycleInterval(cycle: Cycle): string {
  return cycle === 'yearly' ? '1 year' : '1 month';
}

async function planPrice(client: PoolClient, planId: string, cycle: Cycle): Promise<number | null> {
  const r = await client.query(
    `SELECT ${cycle === 'yearly' ? 'price_yearly' : 'price_monthly'} AS price
     FROM billing_plans WHERE id = $1 AND deleted_at IS NULL`,
    [planId]
  );
  return r.rows[0] ? Number(r.rows[0].price) : null;
}

const CONTRACT_FULL_SELECT = `
  SELECT c.id, c.gym_id, g.name AS gym_name, g.subdomain,
         c.plan_id, p.name AS plan_name, p.name_ar AS plan_name_ar,
         c.cycle, c.price, c.currency, c.status,
         c.start_date, c.renewal_date, c.auto_renew, c.notes,
         c.created_by, pa.email AS created_by_email,
         c.cancelled_at, c.created_at, c.updated_at,
         gym_effective_features(c.gym_id) AS effective_features,
         (SELECT count(*)::int FROM platform_contract_addons pca
           WHERE pca.contract_id = c.id AND pca.status = 'active') AS live_items,
         (SELECT coalesce(sum(unit_price * quantity), 0)::numeric(12,2) FROM platform_contract_addons pca
           WHERE pca.contract_id = c.id AND pca.status = 'active') AS items_total
  FROM platform_contracts c
  JOIN gyms g ON g.id = c.gym_id
  JOIN billing_plans p ON p.id = c.plan_id
  LEFT JOIN platform_admins pa ON pa.id = c.created_by`;

// قاعدة بند واحد: قائمة الأعمدة والانضمامات بلا WHERE/ORDER حتى تُركَّب
// عليها شروط مختلفة (عقد كامل أو بند مفرد) دون كسر الصيغة.
const ITEM_SELECT_BASE = `
  SELECT pca.id, pca.contract_id, pca.addon_id,
         ba.name, ba.name_ar, ba.code, ba.limit_column, ba.limit_amount,
         pca.quantity, pca.unit_price,
         (pca.unit_price * pca.quantity)::numeric(12,2) AS line_total,
         pca.cycle, pca.status, pca.started_at, pca.expires_at,
         pca.cancelled_at, pca.notes, pca.created_at, pca.updated_at
  FROM platform_contract_addons pca
  JOIN billing_addons ba ON ba.id = pca.addon_id`;

const ITEM_SELECT = `${ITEM_SELECT_BASE}
  WHERE pca.contract_id = $1
  ORDER BY pca.status = 'active' DESC, pca.created_at ASC`;

function bad(res: Response, status: number, error: string, code?: string): void {
  res.status(status).json(code ? { error, code } : { error });
}

// FOR UPDATE لا يعمل عبر LEFT JOINs (قائمة العقد الكاملة)، فنقفل السطر
// نفسه أولًا ثم نقرأ اللقطة الكاملة بلا قفل — نفس المعاملة فلا نافذة سباق.
async function lockContract(client: PoolClient, id: string): Promise<string | null> {
  const r = await client.query(
    `SELECT status FROM platform_contracts WHERE id = $1 FOR UPDATE`, [id]
  );
  return r.rows.length ? r.rows[0].status : null;
}

// ====================================================================
// GET /billing/contracts?gym_id=&status=&search=
// ====================================================================
export const listContracts = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { gym_id, status, search } = req.query;
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (gym_id) { clauses.push(`c.gym_id = $${params.length + 1}`); params.push(gym_id); }
    if (status && ['active', 'cancelled'].includes(String(status))) {
      clauses.push(`c.status = $${params.length + 1}`); params.push(String(status));
    }
    if (search) {
      clauses.push(`(g.name ILIKE $${params.length + 1} OR g.subdomain ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const contracts = await client.query(
      `${CONTRACT_FULL_SELECT} ${where} ORDER BY c.status = 'active' DESC, c.created_at DESC LIMIT 200`,
      params
    );
    res.json({ data: contracts.rows });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listContracts failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// GET /billing/contracts/:id — العقد + بنوده + فواتيره
// ====================================================================
export const getContract = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const c = await client.query(`${CONTRACT_FULL_SELECT} WHERE c.id = $1`, [req.params.id]);
    if (!c.rows.length) { bad(res, 404, 'Contract not found.', 'NOT_FOUND'); await client.query('COMMIT'); return; }
    const items = await client.query(ITEM_SELECT, [req.params.id]);
    const invoices = await client.query(
      `SELECT id, invoice_number, billing_period_start, billing_period_end,
              base_amount, total_amount, currency, status, due_date, paid_at,
              payment_method, notes, created_at
       FROM billing_invoices WHERE contract_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ data: { contract: c.rows[0], items: items.rows, invoices: invoices.rows } });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('getContract failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// POST /billing/contracts — إبرام عقد (409 إن وُجد عقد سارٍ)
// ====================================================================
export const createContract = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { gym_id, plan_id, cycle = 'monthly', price, currency, auto_renew = true, start_date, notes } = req.body as {
      gym_id: string; plan_id: string; cycle?: Cycle; price?: number; currency?: string;
      auto_renew?: boolean; start_date?: string; notes?: string;
    };
    if (!CYCLES.includes(cycle)) { bad(res, 400, 'cycle must be monthly or yearly.', 'INVALID_CYCLE'); await client.query('COMMIT'); return; }

    const gym = await client.query('SELECT id, name, currency FROM gyms WHERE id = $1', [gym_id]);
    if (!gym.rows.length) { bad(res, 404, 'Gym not found.', 'GYM_NOT_FOUND'); await client.query('COMMIT'); return; }
    const existing = await client.query(
      `SELECT id FROM platform_contracts WHERE gym_id = $1 AND status = 'active'`, [gym_id]
    );
    if (existing.rows.length) {
      bad(res, 409, 'This gym already has an active contract. Cancel or amend it first.', 'CONTRACT_EXISTS');
      await client.query('COMMIT'); return;
    }
    const catalogPrice = await planPrice(client, plan_id, cycle);
    if (catalogPrice === null) { bad(res, 404, 'Billing plan not found.', 'PLAN_NOT_FOUND'); await client.query('COMMIT'); return; }

    const finalPrice = price !== undefined && price !== null ? Number(price) : catalogPrice;
    if (!Number.isFinite(finalPrice) || finalPrice < 0) { bad(res, 400, 'price must be a non-negative number.', 'INVALID_PRICE'); await client.query('COMMIT'); return; }
    const start = start_date || new Date().toISOString().slice(0, 10);
    const inserted = await client.query(
      `INSERT INTO platform_contracts (gym_id, plan_id, cycle, price, currency, status, start_date, renewal_date, auto_renew, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, 'active', $6::date, ($6::date + $7::interval)::date, $8, $9, $10)
       RETURNING id`,
      [gym_id, plan_id, cycle, finalPrice,
       currency || gym.rows[0].currency || 'EGP',
       start, cycleInterval(cycle), !!auto_renew, notes || null,
       req.platformAdmin?.platform_admin_id ?? null]
    );
    await client.query('COMMIT');
    const id = inserted.rows[0].id;
    const full = await getAdminClient();
    try {
      const row = await full.query(`${CONTRACT_FULL_SELECT} WHERE c.id = $1`, [id]);
      await logPlatformAudit({ action: 'CREATE', tableName: 'platform_contracts', recordId: id, newValues: row.rows[0], req });
      res.status(201).json({ data: row.rows[0] });
    } finally { full.release(); }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (getErrorMessage(error).includes('uq_contracts_one_active_per_gym')) {
      bad(res, 409, 'This gym already has an active contract.', 'CONTRACT_EXISTS'); return;
    }
    Sentry.captureException(error);
    logger.error('createContract failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// PATCH /billing/contracts/:id — تعديل بند مالي/تجديد/ملاحظات (يُسجَّل old/new)
// ====================================================================
export const updateContract = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const lockedStatus = await lockContract(client, req.params.id);
    if (lockedStatus === null) { bad(res, 404, 'Contract not found.', 'NOT_FOUND'); await client.query('COMMIT'); return; }
    if (lockedStatus !== 'active') { bad(res, 400, 'Only active contracts can be amended.', 'NOT_ACTIVE'); await client.query('COMMIT'); return; }
    const before = await client.query(`${CONTRACT_FULL_SELECT} WHERE c.id = $1`, [req.params.id]);

    const { price, renewal_date, auto_renew, notes, cycle } = req.body as {
      price?: number; renewal_date?: string; auto_renew?: boolean; notes?: string; cycle?: Cycle;
    };
    if (cycle && !CYCLES.includes(cycle)) { bad(res, 400, 'cycle must be monthly or yearly.', 'INVALID_CYCLE'); await client.query('COMMIT'); return; }
    if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
      bad(res, 400, 'price must be a non-negative number.', 'INVALID_PRICE'); await client.query('COMMIT'); return;
    }

    await client.query(
      `UPDATE platform_contracts SET
         price = coalesce($2::numeric, price),
         renewal_date = coalesce($3::date, renewal_date),
         auto_renew = coalesce($4::boolean, auto_renew),
         notes = coalesce($5::text, notes),
         cycle = coalesce($6::varchar, cycle)
       WHERE id = $1`,
      [req.params.id,
       price !== undefined ? Number(price) : null,
       renewal_date || null,
       auto_renew === undefined ? null : !!auto_renew,
       notes ?? null,
       cycle || null]
    );
    const after = await client.query(`${CONTRACT_FULL_SELECT} WHERE c.id = $1`, [req.params.id]);
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'UPDATE', tableName: 'platform_contracts', recordId: req.params.id, oldValues: before.rows[0], newValues: after.rows[0], req });
    res.json({ data: after.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateContract failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// POST /billing/contracts/:id/cancel — إنهاء العقد وبنوده ساريًا
// ====================================================================
export const cancelContract = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const lockedStatus = await lockContract(client, req.params.id);
    if (lockedStatus === null) { bad(res, 404, 'Contract not found.', 'NOT_FOUND'); await client.query('COMMIT'); return; }
    if (lockedStatus !== 'active') { bad(res, 400, 'Contract is already cancelled.', 'ALREADY_CANCELLED'); await client.query('COMMIT'); return; }
    const before = await client.query(`${CONTRACT_FULL_SELECT} WHERE c.id = $1`, [req.params.id]);
    const reason = (req.body?.reason as string) || null;

    await client.query(
      `UPDATE platform_contracts SET status='cancelled', cancelled_at=now(),
              notes = coalesce(notes || CASE WHEN $2::text IS NULL THEN '' ELSE ' | إلغاء: ' || $2 END, 'إلغاء: ' || coalesce($2,''))
       WHERE id = $1`,
      [req.params.id, reason]
    );
    await client.query(
      `UPDATE platform_contract_addons SET status='cancelled', cancelled_at=now()
       WHERE contract_id = $1 AND status='active'`,
      [req.params.id]
    );
    const after = await client.query(`${CONTRACT_FULL_SELECT} WHERE c.id = $1`, [req.params.id]);
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'CANCEL', tableName: 'platform_contracts', recordId: req.params.id, oldValues: before.rows[0], newValues: { reason, contract: after.rows[0] }, req });
    res.json({ data: after.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('cancelContract failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// POST /billing/contracts/:id/renew — تمديد دورة (وباختيار فاتورة مؤجلة)
// ====================================================================
export const renewContract = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const lockedStatus = await lockContract(client, req.params.id);
    if (lockedStatus === null) { bad(res, 404, 'Contract not found.', 'NOT_FOUND'); await client.query('COMMIT'); return; }
    if (lockedStatus !== 'active') { bad(res, 400, 'Only active contracts can be renewed.', 'NOT_ACTIVE'); await client.query('COMMIT'); return; }
    const before = await client.query(`${CONTRACT_FULL_SELECT} WHERE c.id = $1`, [req.params.id]);
    const periods = Math.min(Math.max(parseInt(String(req.body?.periods), 10) || 1, 1), 24);
    const contract = before.rows[0];

    const renewed = await client.query(
      `UPDATE platform_contracts SET
         renewal_date = (coalesce(renewal_date, start_date)::date
           + make_interval(months => CASE WHEN cycle = 'monthly' THEN $2::int ELSE 0 END,
                           years  => CASE WHEN cycle = 'yearly'  THEN $2::int ELSE 0 END))::date
       WHERE id = $1
       RETURNING id, renewal_date`,
      [req.params.id, String(periods)]
    );
    const row = await client.query(`${CONTRACT_FULL_SELECT} WHERE c.id = $1`, [req.params.id]);
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'RENEW', tableName: 'platform_contracts', recordId: req.params.id, oldValues: { renewal_date: contract.renewal_date }, newValues: { renewal_date: renewed.rows[0].renewal_date, periods }, req });

    if (req.body?.issue_invoice === true) {
      const inv = await issueInvoiceForContract(req, req.params.id);
      if ('error' in inv) { res.status(inv.status).json({ error: inv.message }); return; }
      res.json({ data: { contract: row.rows[0], invoice: inv.invoice } });
      return;
    }
    res.json({ data: row.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('renewContract failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// فاتورة دورية للعقد: الباقة + البنود السارية
// ====================================================================
async function nextInvoiceNumber(client: PoolClient): Promise<string> {
  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  const r = await client.query(
    `SELECT count(*)::int + 1 AS seq FROM billing_invoices WHERE invoice_number LIKE $1`,
    [`GC-${month}-%`]
  );
  return `GC-${month}-${String(r.rows[0].seq).padStart(4, '0')}`;
}

async function issueInvoiceForContract(
  req: Request,
  contractId: string
): Promise<{ invoice: Record<string, unknown> } | { error: true; status: number; message: string }> {
  const client = await getAdminClient();
  try {
    const c = await client.query(
      `SELECT c.*, g.name AS gym_name, p.name AS plan_name
       FROM platform_contracts c
       JOIN gyms g ON g.id = c.gym_id
       JOIN billing_plans p ON p.id = c.plan_id
       WHERE c.id = $1 AND c.status='active' FOR UPDATE`,
      [contractId]
    );
    if (!c.rows.length) { await client.query('COMMIT'); return { error: true, status: 404, message: 'Active contract not found.' }; }
    const contract = c.rows[0];
    const items = await client.query(ITEM_SELECT, [contractId]);
    const activeItems = items.rows.filter((i) => i.status === 'active');

    const periodStart: string = contract.renewal_date || contract.start_date;
    const periodEnd = (await client.query(
      `SELECT (($1::date + $2::interval))::date AS d`,
      [periodStart, cycleInterval(contract.cycle as Cycle)]
    )).rows[0].d;

    const number = await nextInvoiceNumber(client);
    const total = Number(contract.price) + activeItems.reduce((s, i) => s + Number(i.line_total), 0);
    const inv = await client.query(
      `INSERT INTO billing_invoices
         (invoice_number, gym_id, contract_id, billing_period_start, billing_period_end,
          plan_id, plan_name, base_amount, total_amount, currency, status, due_date)
       VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10,'pending',
               (CURRENT_DATE + INTERVAL '14 days'))
       RETURNING id, invoice_number, total_amount, due_date`,
      [number, contract.gym_id, contractId, periodStart, periodEnd,
       contract.plan_id, contract.plan_name, contract.price, total, contract.currency]
    );
    const invoiceId = inv.rows[0].id;
    let sort = 0;
    await client.query(
      `INSERT INTO billing_line_items (invoice_id, description, quantity, unit_price, amount, sort_order)
       VALUES ($1, $2, 1, $3, $3, $4)`,
      [invoiceId, `باقة ${contract.plan_name} (${contract.cycle})`, contract.price, sort++]
    );
    for (const item of activeItems) {
      await client.query(
        `INSERT INTO billing_line_items (invoice_id, description, quantity, unit_price, amount, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [invoiceId, item.name_ar || item.name, item.quantity, item.unit_price, item.line_total, sort++]
      );
    }
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'ISSUE', tableName: 'billing_invoices', recordId: invoiceId, newValues: { contract_id: contractId, invoice_number: number, total_amount: total }, req });
    return { invoice: { ...inv.rows[0], contract_id: contractId } };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// POST /billing/contracts/:id/invoices
export const issueContractInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const inv = await issueInvoiceForContract(req, req.params.id);
    if ('error' in inv) { res.status(inv.status).json({ error: inv.message }); return; }
    res.status(201).json({ data: inv.invoice });
  } catch (error) {
    Sentry.captureException(error);
    logger.error('issueContractInvoice failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// POST /billing/invoices/:id/mark-paid — تحصيل يدوي موثَّق
export const markInvoicePaid = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const before = await client.query(
      `SELECT id, invoice_number, status, total_amount, currency, contract_id
       FROM billing_invoices WHERE id = $1 FOR UPDATE`, [req.params.id]
    );
    if (!before.rows.length) { bad(res, 404, 'Invoice not found.', 'NOT_FOUND'); await client.query('COMMIT'); return; }
    if (before.rows[0].status !== 'pending' && before.rows[0].status !== 'overdue') {
      bad(res, 400, `Invoice is already ${before.rows[0].status}.`, 'BAD_STATE'); await client.query('COMMIT'); return;
    }
    const method = (req.body?.payment_method as string) || 'manual';
    const reference = (req.body?.payment_reference as string) || null;
    const after = await client.query(
      `UPDATE billing_invoices SET status='paid', paid_at=now(), paid_amount=total_amount,
              payment_method=$2, payment_reference=$3
       WHERE id = $1
       RETURNING id, invoice_number, status, paid_at, payment_method, payment_reference`,
      [req.params.id, method, reference]
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'MARK_PAID', tableName: 'billing_invoices', recordId: req.params.id, oldValues: before.rows[0], newValues: after.rows[0], req });
    res.json({ data: after.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('markInvoicePaid failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// بنود العقود
// ====================================================================

// POST /billing/contracts/:id/items
export const addContractItem = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const c = await client.query(
      `SELECT id, gym_id, cycle, status FROM platform_contracts WHERE id = $1 FOR UPDATE`, [req.params.id]
    );
    if (!c.rows.length) { bad(res, 404, 'Contract not found.', 'NOT_FOUND'); await client.query('COMMIT'); return; }
    if (c.rows[0].status !== 'active') { bad(res, 400, 'Cannot add items to a cancelled contract.', 'NOT_ACTIVE'); await client.query('COMMIT'); return; }
    const { addon_id, quantity = 1, unit_price, cycle, expires_at, notes } = req.body as {
      addon_id: string; quantity?: number; unit_price?: number; cycle?: Cycle; expires_at?: string; notes?: string;
    };
    const q = parseInt(String(quantity), 10) || 1;
    if (q < 1 || q > 100) { bad(res, 400, 'quantity must be between 1 and 100.', 'INVALID_QUANTITY'); await client.query('COMMIT'); return; }
    const itemCycle: Cycle = cycle || c.rows[0].cycle;
    if (!CYCLES.includes(itemCycle)) { bad(res, 400, 'cycle must be monthly or yearly.', 'INVALID_CYCLE'); await client.query('COMMIT'); return; }

    const addon = await client.query(
      `SELECT id, name, is_active, price_monthly, price_yearly FROM billing_addons WHERE id = $1`, [addon_id]
    );
    if (!addon.rows.length || !addon.rows[0].is_active) { bad(res, 404, 'Addon not found or inactive.', 'ADDON_NOT_FOUND'); await client.query('COMMIT'); return; }
    const dup = await client.query(
      `SELECT id FROM platform_contract_addons WHERE contract_id=$1 AND addon_id=$2 AND status='active'`,
      [req.params.id, addon_id]
    );
    if (dup.rows.length) { bad(res, 409, 'This addon is already an active line on the contract.', 'ITEM_EXISTS'); await client.query('COMMIT'); return; }

    const finalUnit = unit_price !== undefined && unit_price !== null
      ? Number(unit_price)
      : Number(itemCycle === 'yearly' ? addon.rows[0].price_yearly : addon.rows[0].price_monthly);
    if (!Number.isFinite(finalUnit) || finalUnit < 0) { bad(res, 400, 'unit_price must be a non-negative number.', 'INVALID_PRICE'); await client.query('COMMIT'); return; }

    const ins = await client.query(
      `INSERT INTO platform_contract_addons (contract_id, addon_id, quantity, unit_price, cycle, status, started_at, expires_at, notes, added_by)
       VALUES ($1,$2,$3,$4,$5,'active',CURRENT_DATE, $6::date, $7, $8)
       RETURNING id`,
      [req.params.id, addon_id, q, finalUnit, itemCycle, expires_at || null, notes || null,
       req.platformAdmin?.platform_admin_id ?? null]
    );
    await client.query('COMMIT');
    const items = await getAdminClient();
    try {
      const row = await items.query(`${ITEM_SELECT_BASE} WHERE pca.id = $1`, [ins.rows[0].id]);
      await logPlatformAudit({ action: 'GRANT', tableName: 'platform_contract_addons', recordId: ins.rows[0].id, newValues: { contract_id: req.params.id, ...row.rows[0] }, req });
      res.status(201).json({ data: row.rows[0] });
    } finally { items.release(); }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('addContractItem failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// POST /billing/contract-items/:id/cancel
export const cancelContractItem = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const before = await client.query(
      `SELECT pca.*, ba.name FROM platform_contract_addons pca JOIN billing_addons ba ON ba.id=pca.addon_id
       WHERE pca.id = $1 FOR UPDATE`, [req.params.id]
    );
    if (!before.rows.length) { bad(res, 404, 'Contract item not found.', 'NOT_FOUND'); await client.query('COMMIT'); return; }
    if (before.rows[0].status !== 'active') { bad(res, 400, 'Item is already cancelled.', 'ALREADY_CANCELLED'); await client.query('COMMIT'); return; }
    const after = await client.query(
      `UPDATE platform_contract_addons SET status='cancelled', cancelled_at=now(),
              notes = coalesce(notes || CASE WHEN $2::text IS NULL THEN '' ELSE ' | إيقاف: ' || $2 END, notes)
       WHERE id = $1
       RETURNING id, contract_id, addon_id, status, cancelled_at`,
      [req.params.id, (req.body?.reason as string) || null]
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'REVOKE', tableName: 'platform_contract_addons', recordId: req.params.id, oldValues: before.rows[0], newValues: after.rows[0], req });
    res.json({ data: after.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('cancelContractItem failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// PATCH /billing/contract-items/:id — تعديل سعر/كمية/انتهاء
export const updateContractItem = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const before = await client.query(`SELECT * FROM platform_contract_addons WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!before.rows.length) { bad(res, 404, 'Contract item not found.', 'NOT_FOUND'); await client.query('COMMIT'); return; }
    if (before.rows[0].status !== 'active') { bad(res, 400, 'Only active items can be amended.', 'NOT_ACTIVE'); await client.query('COMMIT'); return; }
    const { quantity, unit_price, expires_at, notes } = req.body as {
      quantity?: number; unit_price?: number; expires_at?: string | null; notes?: string;
    };
    if (quantity !== undefined && (parseInt(String(quantity), 10) < 1 || parseInt(String(quantity), 10) > 100)) {
      bad(res, 400, 'quantity must be between 1 and 100.', 'INVALID_QUANTITY'); await client.query('COMMIT'); return;
    }
    if (unit_price !== undefined && (!Number.isFinite(Number(unit_price)) || Number(unit_price) < 0)) {
      bad(res, 400, 'unit_price must be a non-negative number.', 'INVALID_PRICE'); await client.query('COMMIT'); return;
    }
    const after = await client.query(
      `UPDATE platform_contract_addons SET
         quantity = coalesce($2::int, quantity),
         unit_price = coalesce($3::numeric, unit_price),
         expires_at = CASE WHEN $4::text = '' THEN NULL ELSE coalesce($4::date, expires_at) END,
         notes = coalesce($5::text, notes)
       WHERE id = $1 RETURNING *`,
      [req.params.id,
       quantity !== undefined ? parseInt(String(quantity), 10) : null,
       unit_price !== undefined ? Number(unit_price) : null,
       expires_at === undefined ? null : (expires_at ?? ''),
       notes ?? null]
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'UPDATE', tableName: 'platform_contract_addons', recordId: req.params.id, oldValues: before.rows[0], newValues: after.rows[0], req });
    res.json({ data: after.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateContractItem failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};
