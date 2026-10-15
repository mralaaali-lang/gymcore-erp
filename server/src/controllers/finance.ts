import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import logger from '../config/logger';

// §34ث (UTC): every "today / this-month" money figure used to be bucketed by
// UTC CURRENT_DATE while gyms.timezone is 'Africa/Cairo' — the first three
// Cairo hours of any day landed on the previous day. These helpers resolve the
// gym's timezone once per request and build timestamptz boundaries from it.
const DEFAULT_TZ = 'Africa/Cairo';
async function getGymTz(gym_id: string | undefined): Promise<string> {
  if (!gym_id) return DEFAULT_TZ;
  const r = await query(`SELECT COALESCE(timezone, $2) AS tz FROM gyms WHERE id = $1`, [gym_id, DEFAULT_TZ]);
  return r.rows[0]?.tz || DEFAULT_TZ;
}
// SQL fragments — $2 is always the gym timezone string.
const TZ_TODAY = `((CURRENT_TIMESTAMP AT TIME ZONE $2)::date)::timestamp AT TIME ZONE $2`;
const TZ_YDAY = `(((CURRENT_TIMESTAMP AT TIME ZONE $2)::date) - 1)::timestamp AT TIME ZONE $2`;
const TZ_MONTH = `(date_trunc('month', ((CURRENT_TIMESTAMP AT TIME ZONE $2)::date)::timestamp)) AT TIME ZONE $2`;

// §34ث: ledger rows are attributed to the gym's currently-open cashbox shift
// so the drawer can be reconciled against actual cash movement.
const OPEN_SESSION = `
  (SELECT id FROM cashbox_sessions WHERE gym_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1)`;

// Cash rules (honest for pre-058 data): expenses without a recorded method are
// cash; payments count only when method is exactly 'cash'. Refunds (068) leave
// the drawer too but are bucketed apart so summaries can break them out.
const CASH_IN = `ft.type = 'payment' AND ft.payment_method = 'cash'`;
const CASH_OUT = `ft.type = 'expense' AND (ft.payment_method IS NULL OR ft.payment_method = 'cash')`;
const CASH_REFUND = `ft.type = 'refund' AND (ft.payment_method IS NULL OR ft.payment_method = 'cash')`;

// === PAYMENTS (financial_transactions — type='payment') ===
// §34ث: the list used to fake `NULL::text AS member_name` and the insert
// dropped member_id/payment_method even though the schema required them.
// Migration 058 added the columns; now they are stored and joined for real.
// §43 — the payments screen sends ?from=YYYY-MM-DD&to=YYYY-MM-DD&method=...
// Range boundaries are computed in the GYM timezone (§34ث rule), never UTC.
// Cards (range sums) respect only the date range — the method filter narrows
// the table, not the money cards. member_phone joins live now (058 members).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RANGE_CLAUSE =
  ` AND ($2::date IS NULL OR ft.created_at >= ($2::date)::timestamp AT TIME ZONE $3)` +
  ` AND ($4::date IS NULL OR ft.created_at < (($4::date) + 1)::timestamp AT TIME ZONE $3)`;

export const listPayments = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const offset = (page - 1) * limit;
  const from = ISO_DATE.test(String(req.query.from || '')) ? String(req.query.from) : null;
  const to = ISO_DATE.test(String(req.query.to || '')) ? String(req.query.to) : null;
  const methodQ = String(req.query.method || '');
  const method = methodQ && methodQ !== 'all' ? methodQ.slice(0, 30) : null;
  try {
    const tz = await getGymTz(gym_id);
    // Global + this-month aggregates (kept for the BillingOverview tabs).
    const agg = await query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(amount), 0) AS total_sum,
              COUNT(*) FILTER (WHERE created_at >= ${TZ_MONTH})::int AS month_count,
              COALESCE(SUM(amount) FILTER (WHERE created_at >= ${TZ_MONTH}), 0) AS month_sum
       FROM financial_transactions WHERE gym_id=$1 AND type='payment'`, [gym_id, tz]);
    const a = agg.rows[0] || {};
    // §43 — date-range aggregates drive the four summary cards.
    const range = await query(
      `SELECT COUNT(*)::int AS range_count,
              COALESCE(SUM(ft.amount), 0) AS range_sum,
              COALESCE(SUM(ft.amount) FILTER (WHERE ft.payment_method = 'cash'), 0) AS range_cash,
              COALESCE(SUM(ft.amount) FILTER (WHERE ft.payment_method IN ('bank', 'bank_transfer')), 0) AS range_bank,
              COALESCE(SUM(ft.amount) FILTER (WHERE ft.payment_method = 'vodafone_cash'), 0) AS range_vodafone
       FROM financial_transactions ft
       WHERE ft.gym_id=$1 AND ft.type='payment'${RANGE_CLAUSE}`,
      [gym_id, from, tz, to]);
    // "+N عملية" chip: what landed today (gyms ask for a same-day pulse).
    const today = await query(
      `SELECT COUNT(*)::int AS today_count FROM financial_transactions
       WHERE gym_id=$1 AND type='payment' AND created_at >= ${TZ_TODAY}`, [gym_id, tz]);
    const r = range.rows[0] || {};
    // Filtered feed + its own count for pagination (newest first).
    const countQ = await query(
      `SELECT COUNT(*)::int AS total FROM financial_transactions ft
       WHERE ft.gym_id=$1 AND ft.type='payment'${RANGE_CLAUSE}
         AND ($5::text IS NULL OR ft.payment_method = $5)`,
      [gym_id, from, tz, to, method]);
    const total = Number(countQ.rows[0]?.total || 0);
    const data = await query(
      // §43 — phones live in phone_encrypted (trg_members_encrypt); the
      // established read pattern is decrypt_sensitive (attendance/customer360).
      `SELECT ft.*, m.full_name AS member_name, decrypt_sensitive(m.phone_encrypted) AS member_phone
       FROM financial_transactions ft
       LEFT JOIN members m ON m.id = ft.member_id
       WHERE ft.gym_id=$1 AND ft.type='payment'${RANGE_CLAUSE}
         AND ($5::text IS NULL OR ft.payment_method = $5)
       ORDER BY ft.created_at DESC LIMIT $6 OFFSET $7`,
      [gym_id, from, tz, to, method, limit, offset]);
    res.json({
      data: data.rows,
      pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
      stats: {
        total_count: total,
        total_sum: Number(a.total_sum),
        month_count: Number(a.month_count || 0),
        month_sum: Number(a.month_sum),
        range_count: Number(r.range_count || 0),
        range_sum: Number(r.range_sum),
        range_cash: Number(r.range_cash),
        range_bank: Number(r.range_bank),
        range_vodafone: Number(r.range_vodafone),
        today_count: Number(today.rows[0]?.today_count || 0),
      },
    });
  } catch (e: any) { logger.error('listPayments failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createPayment = async (req: Request, res: Response) => {
  const { member_id, amount, description, payment_method } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  try {
    // Tenant check: refuse to book a payment against another gym's member.
    const member = await query(`SELECT id FROM members WHERE id=$1 AND gym_id=$2`, [member_id, gym_id]);
    if (member.rows.length === 0) {
      res.status(400).json({ error: 'Member not found in this gym' });
      return;
    }
    const r = await query(
      `INSERT INTO financial_transactions (gym_id, type, amount, description, staff_user_id, member_id, payment_method, cash_session_id)
       VALUES ($1,'payment',$2,$3,$4,$5,$6,${OPEN_SESSION}) RETURNING *`,
      [gym_id, amount, description, staff_user_id, member_id, payment_method || 'cash']);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createPayment failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === EXPENSES (financial_transactions — type='expense') ===
// §44 — the expenses screen sends ?from=YYYY-MM-DD&to=YYYY-MM-DD and reads
// time-based stats (range sum/count, today, month) for its four cards.
// Same §34ث rule as §43: every boundary is computed in the GYM timezone.
// There is deliberately no method filter here — expenses leave the drawer
// as cash/register payouts and the screen stays simpler than payments.
export const listExpenses = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 100));
  const offset = (page - 1) * limit;
  const from = ISO_DATE.test(String(req.query.from || '')) ? String(req.query.from) : null;
  const to = ISO_DATE.test(String(req.query.to || '')) ? String(req.query.to) : null;
  try {
    const tz = await getGymTz(gym_id);
    // All-time + month aggregates (kept for the older consumers).
    const agg = await query(
      `SELECT COUNT(*)::int AS total_count,
              COALESCE(SUM(amount),0) AS total_sum,
              COALESCE(SUM(amount) FILTER (WHERE created_at >= ${TZ_MONTH}),0) AS month_sum,
              COUNT(*) FILTER (WHERE created_at >= ${TZ_MONTH})::int AS month_count,
              COALESCE(SUM(amount) FILTER (WHERE created_at >= ${TZ_TODAY}),0) AS today_sum,
              COUNT(*) FILTER (WHERE created_at >= ${TZ_TODAY})::int AS today_count
       FROM financial_transactions WHERE gym_id=$1 AND type='expense'`, [gym_id, tz]);
    const a = agg.rows[0] || {};
    // §44 — the applied date range drives the «إجمالي الفترة» card.
    const range = await query(
      `SELECT COUNT(*)::int AS range_count, COALESCE(SUM(ft.amount),0) AS range_sum
       FROM financial_transactions ft
       WHERE ft.gym_id=$1 AND ft.type='expense'${RANGE_CLAUSE}`,
      [gym_id, from, tz, to]);
    const r = range.rows[0] || {};
    const data = await query(
      `SELECT ft.*, ec.name AS category_name, su.full_name AS staff_name
       FROM financial_transactions ft
       LEFT JOIN expense_categories ec ON ft.category_id=ec.id
       LEFT JOIN staff_users su ON su.id = ft.staff_user_id
       WHERE ft.gym_id=$1 AND ft.type='expense'${RANGE_CLAUSE}
       ORDER BY ft.created_at DESC LIMIT $5 OFFSET $6`,
      [gym_id, from, tz, to, limit, offset]);
    res.json({
      data: data.rows,
      pagination: { page, limit, total: Number(r.range_count || 0), total_pages: Math.max(1, Math.ceil(Number(r.range_count || 0) / limit)) },
      // avg lives server-side too — the card must not divide client-side
      // against a page of rows (the §34ث mistake this replaces).
      stats: {
        total_count: Number(a.total_count || 0),
        total_sum: Number(a.total_sum),
        month_count: Number(a.month_count || 0),
        month_sum: Number(a.month_sum),
        today_sum: Number(a.today_sum),
        today_count: Number(a.today_count || 0),
        range_count: Number(r.range_count || 0),
        range_sum: Number(r.range_sum),
        range_avg: Number(r.range_count || 0) > 0 ? Number(r.range_sum) / Number(r.range_count) : 0,
      },
    });
  } catch (e: any) { logger.error('listExpenses failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createExpense = async (req: Request, res: Response) => {
  const { amount, description, category_id, payment_method, date } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  try {
    // §34ث: method was silently dropped — every payout looked like a wallet
    // ghost in the drawer. Default stays 'cash' (the register reality).
    // §44: optional ISO date → created_at is that day's start in the gym
    // timezone, so the §34ث range boundaries count it under the right day.
    if (date) {
      const tz = await getGymTz(gym_id);
      const r = await query(
        `INSERT INTO financial_transactions (gym_id, type, amount, description, category_id, staff_user_id, payment_method, cash_session_id, created_at)
         VALUES ($1,'expense',$2,$3,$4,$5,$6,${OPEN_SESSION}, ($7::date)::timestamp AT TIME ZONE $8) RETURNING *`,
        [gym_id, amount, description || null, category_id || null, staff_user_id, payment_method || 'cash', date, tz]);
      return res.status(201).json({ data: r.rows[0] });
    }
    const r = await query(`INSERT INTO financial_transactions (gym_id, type, amount, description, category_id, staff_user_id, payment_method, cash_session_id)
       VALUES ($1,'expense',$2,$3,$4,$5,$6,${OPEN_SESSION}) RETURNING *`, [gym_id, amount, description || null, category_id || null, staff_user_id, payment_method || 'cash']);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createExpense failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === EXPENSE CATEGORIES ===
export const listExpenseCategories = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT * FROM expense_categories WHERE gym_id=$1 ORDER BY name`, [gym_id]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listExpenseCategories failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === SALES (POS Orders) ===
export const listSales = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;
  try {
    const count = await query(`SELECT COUNT(*) FROM pos_orders WHERE gym_id=$1`, [gym_id]);
    const data = await query(`SELECT po.*, su.full_name AS staff_name, m.full_name AS member_name FROM pos_orders po LEFT JOIN staff_users su ON po.staff_user_id=su.id LEFT JOIN members m ON po.member_id=m.id WHERE po.gym_id=$1 ORDER BY po.created_at DESC LIMIT $2 OFFSET $3`, [gym_id, limit, offset]);
    res.json({ data: data.rows, pagination: { page, limit, total: parseInt(count.rows[0].count) } });
  } catch (e: any) { logger.error('listSales failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createSale = async (req: Request, res: Response) => {
  const { member_id, items, payment_method } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const order = await client.query(`INSERT INTO pos_orders (gym_id, staff_user_id, member_id, payment_method, total_amount) VALUES ($1,$2,$3,$4,0) RETURNING *`, [gym_id, staff_user_id, member_id || null, payment_method || 'cash']);
    const orderId = order.rows[0].id;
    let total = 0;
    for (const item of items || []) {
      const prod = await client.query(`SELECT selling_price FROM products WHERE id=$1 AND gym_id=$2`, [item.product_id, gym_id]);
      if (prod.rows.length === 0) { await client.query('ROLLBACK'); res.status(400).json({ error: `Product ${item.product_id} not found` }); return; }
      const price = prod.rows[0].selling_price;
      await client.query(`INSERT INTO pos_order_items (order_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`, [orderId, item.product_id, item.quantity, price]);
      await client.query(`UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id=$2 AND gym_id=$3`, [item.quantity, item.product_id, gym_id]);
      total += price * item.quantity;
    }
    await client.query(`UPDATE pos_orders SET total_amount=$1 WHERE id=$2`, [total, orderId]);
    // §34ث: POS revenue must reach the finance ledger in the SAME transaction —
    // before this, sales lived only in pos_orders and every money aggregate
    // that read financial_transactions silently understated revenue.
    if (total > 0) {
      await client.query(
        `INSERT INTO financial_transactions (gym_id, type, amount, description, staff_user_id, member_id, payment_method, pos_order_id, cash_session_id)
         VALUES ($1,'payment',$2,$3,$4,$5,$6,$7,
           (SELECT id FROM cashbox_sessions WHERE gym_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1))`,
        [gym_id, total, `مبيعات نقطة البيع #${orderId.slice(0, 8)}`, staff_user_id, member_id || null, payment_method || 'cash', orderId]);
    }
    await client.query('COMMIT');
    const full = await query(`SELECT po.*, su.full_name AS staff_name FROM pos_orders po LEFT JOIN staff_users su ON po.staff_user_id=su.id WHERE po.id=$1`, [orderId]);
    res.status(201).json({ data: full.rows[0] });
  } catch (e: any) { await client.query('ROLLBACK'); logger.error('createSale failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
  finally { client.release(); }
};

// === PURCHASES ===
export const listPurchases = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const data = await query(`SELECT p.*, s.name AS supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id=s.id WHERE p.gym_id=$1 ORDER BY p.created_at DESC`, [gym_id]);
    res.json({ data: data.rows });
  } catch (e: any) { logger.error('listPurchases failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createPurchase = async (req: Request, res: Response) => {
  const { supplier_id, items, payment_method, notes } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const purch = await client.query(`INSERT INTO purchases (gym_id, supplier_id, staff_user_id, payment_method, status, notes, total_amount) VALUES ($1,$2,$3,$4,'completed',$5,0) RETURNING *`, [gym_id, supplier_id || null, staff_user_id, payment_method || 'cash', notes || null]);
    const purchaseId = purch.rows[0].id;
    let total = 0;
    for (const item of items || []) {
      await client.query(`INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`, [purchaseId, item.product_id, item.quantity, item.unit_price]);
      await client.query(`UPDATE products SET stock_quantity = stock_quantity + $1, purchase_price = $2 WHERE id=$3 AND gym_id=$4`, [item.quantity, item.unit_price, item.product_id, gym_id]);
      total += item.unit_price * item.quantity;
    }
    await client.query(`UPDATE purchases SET total_amount=$1 WHERE id=$2`, [total, purchaseId]);
    await client.query('COMMIT');
    res.status(201).json({ data: purch.rows[0] });
  } catch (e: any) { await client.query('ROLLBACK'); logger.error('createPurchase failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
  finally { client.release(); }
};

// === SUPPLIERS ===
export const listSuppliers = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try { const r = await query(`SELECT * FROM suppliers WHERE gym_id=$1 ORDER BY name`, [gym_id]); res.json({ data: r.rows }); }
  catch (e: any) { logger.error('listSuppliers failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createSupplier = async (req: Request, res: Response) => {
  const { name, phone, email, address, notes } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`INSERT INTO suppliers (gym_id, name, phone, email, address, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [gym_id, name, phone, email, address, notes]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createSupplier failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === DEBTS ===
// §45 — member_debts has no kind column and there is no credit-sale pipeline
// (POS books the full total instantly as revenue). The screen's classification
// is therefore DERIVED from where the row actually came from: subscriptions.ts
// links subscription_id and writes a «رصيد باقة …» reason; the only sale-shaped
// reasons carry «نقطة البيع #…» (a #S invoice number); manual freeze entries
// say «تجميد»; everything else is 'other'.
const DEBT_KIND_CASE = `CASE
  WHEN md.reason ILIKE '%برايفت%' THEN 'pt'
  WHEN md.subscription_id IS NOT NULL OR md.reason ILIKE '%باقة%' THEN 'subscription'
  WHEN md.reason ILIKE '%تجميد%' THEN 'freeze'
  WHEN md.reason ILIKE '%نقطة البيع%' OR md.reason LIKE '%#%' THEN 'sale'
  ELSE 'other' END`;

// The collection screen lists unpaid debts only; paid-off rows leave the list.
const DEBT_UNPAID = `md.gym_id = $1 AND md.status = 'active' AND md.remaining_amount > 0`;

// Same param shape everywhere: $2=kind, $3=status(pending|partial), $4=%q%.
// Status is DERIVED, never stored: paid>0 && remaining>0 => 'partial' (§45).
const DEBT_FILTERS = ` AND ($2::text IS NULL OR ${DEBT_KIND_CASE} = $2)
  AND ($3::text IS NULL OR ($3 = 'pending' AND md.remaining_amount = md.original_amount)
       OR ($3 = 'partial' AND md.remaining_amount < md.original_amount))
  AND ($4::text IS NULL OR m.full_name ILIKE $4 OR decrypt_sensitive(m.phone_encrypted) ILIKE $4)`;

export const listDebts = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 100));
  const offset = (page - 1) * limit;
  const kindQ = String(req.query.kind || '');
  const kind = ['subscription', 'sale', 'freeze', 'pt', 'other'].includes(kindQ) ? kindQ : null;
  const statusQ = String(req.query.status || '');
  const status = statusQ === 'pending' || statusQ === 'partial' ? statusQ : null;
  const qRaw = String(req.query.q || '').trim().slice(0, 60);
  const qLike = qRaw ? `%${qRaw}%` : null;
  try {
    // Four summary cards — honest aggregates over ALL unpaid debts (§34ث rule:
    // server-side sums; the page must not re-add rows). Filters narrow the
    // table only, exactly like the §43 payments cards.
    const stats = await query(
      `SELECT COALESCE(SUM(t.remaining_amount), 0) AS total_due,
              COALESCE(SUM(t.remaining_amount) FILTER (WHERE t.kind = 'subscription'), 0) AS subscription_due,
              COALESCE(SUM(t.remaining_amount) FILTER (WHERE t.kind = 'sale'), 0) AS sale_due,
              COUNT(*)::int AS debt_count
       FROM (SELECT md.remaining_amount, ${DEBT_KIND_CASE} AS kind
             FROM member_debts md WHERE ${DEBT_UNPAID}) t`, [gym_id]);
    const s = stats.rows[0] || {};
    const countQ = await query(
      `SELECT COUNT(*)::int AS total FROM member_debts md
       JOIN members m ON m.id = md.member_id
       WHERE ${DEBT_UNPAID}${DEBT_FILTERS}`, [gym_id, kind, status, qLike]);
    const total = Number(countQ.rows[0]?.total || 0);
    const data = await query(
      `SELECT md.*, m.full_name AS member_name, decrypt_sensitive(m.phone_encrypted) AS member_phone,
              (md.original_amount - md.remaining_amount) AS paid_amount,
              CASE WHEN md.remaining_amount < md.original_amount THEN 'partial' ELSE 'pending' END AS payment_status,
              ${DEBT_KIND_CASE} AS debt_kind
       FROM member_debts md
       JOIN members m ON m.id = md.member_id
       WHERE ${DEBT_UNPAID}${DEBT_FILTERS}
       ORDER BY md.created_at DESC LIMIT $5 OFFSET $6`,
      [gym_id, kind, status, qLike, limit, offset]);
    res.json({
      data: data.rows,
      pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
      stats: {
        total_due: Number(s.total_due),
        subscription_due: Number(s.subscription_due),
        sale_due: Number(s.sale_due),
        debt_count: Number(s.debt_count || 0),
      },
    });
  } catch (e: any) { logger.error('listDebts failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createDebt = async (req: Request, res: Response) => {
  const { member_id, amount, due_date, reason } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    // §45 — tenant check (same rule as createPayment): never book a debt on
    // another gym's member.
    const member = await query(`SELECT id FROM members WHERE id=$1 AND gym_id=$2`, [member_id, gym_id]);
    if (member.rows.length === 0) {
      res.status(400).json({ error: 'Member not found in this gym' });
      return;
    }
    const r = await query(`INSERT INTO member_debts (gym_id, member_id, original_amount, remaining_amount, due_date, reason) VALUES ($1,$2,$3,$3,$4,$5) RETURNING *`, [gym_id, member_id, amount, due_date, reason]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createDebt failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// §45 — debt settlement is now a real two-leg collection inside ONE transaction:
// the row is locked FOR UPDATE, the paid amount is clamped to what is actually
// owed (the old version silently swallowed over-payment), remaining is
// recomputed, and the money is booked as a genuine payment row in the ledger
// attributed to the open cash shift (§34ث rule). Partial payment is a first-class
// outcome — the screen derives the «سداد جزئي» status from paid>0 & remaining>0.
export const payDebt = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, note } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const debt = await client.query(
      `SELECT md.remaining_amount, md.member_id, m.full_name AS member_name
       FROM member_debts md JOIN members m ON m.id = md.member_id
       WHERE md.id=$1 AND md.gym_id=$2 AND md.status='active' AND md.remaining_amount > 0
       FOR UPDATE OF md`, [id, gym_id]);
    if (debt.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Debt not found or already paid' });
      return;
    }
    const row = debt.rows[0];
    const remaining = Number(row.remaining_amount);
    const paid = Math.min(remaining, Math.max(0, Number(amount)));
    if (!(paid > 0)) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Amount must be greater than zero' });
      return;
    }
    const newRemaining = remaining - paid;
    const newStatus = newRemaining <= 0 ? 'paid' : 'active';
    await client.query(`UPDATE member_debts SET remaining_amount=$1, status=$2, updated_at=NOW() WHERE id=$3`,
      [newRemaining, newStatus, id]);
    const desc = `سداد دين — ${row.member_name}${note ? ` — ${String(note).slice(0, 200)}` : ''}`.slice(0, 500);
    // OPEN_SESSION expands a $1-shaped subquery and here $1 is gym_id — the same
    // cash-session attribution createPayment uses (§34ث).
    await client.query(
      `INSERT INTO financial_transactions (gym_id, type, amount, description, staff_user_id, member_id, payment_method, cash_session_id)
       VALUES ($1,'payment',$2,$3,$4,$5,'cash',${OPEN_SESSION}) RETURNING id`,
      [gym_id, paid, desc, staff_user_id, row.member_id]);
    await client.query('COMMIT');
    res.json({ success: true, paid, remaining: newRemaining, status: newStatus });
  } catch (e: any) {
    try { await client.query('ROLLBACK'); } catch { /* already aborted */ }
    logger.error('payDebt failed', { error: e.message }); res.status(500).json({ error: 'Internal error' });
  } finally { client.release(); }
};

// === CASHBOX ===
// §34ث: sessions used to carry free-typed opening/closing numbers with no
// relation to actual cash movement. Now every ledger row is attributed to the
// open shift (cash_session_id), so the list states the EXPECTED drawer and the
// difference against the counted closing balance.
export const listCashboxSessions = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  // سجل الشيفتات: فلاتر من/إلى/موظف + مسلسل تاريخي ثابت + تفصيل طرق الدفع.
  // shift_no ترقيم تاريخي لكل الصالة (ROW_NUMBER قبل الفلترة) فلا يتزحزح.
  // طرق الدفع: كل الطرق المسجلة (نقدي/فيزا=بطاقة+فيزا/محفظة=محفظة+فودافون/انستاباي=انستاباي+تحويل).
  const from = ISO_DATE.test(String(req.query.from || '')) ? String(req.query.from) : null;
  const to = ISO_DATE.test(String(req.query.to || '')) ? String(req.query.to) : null;
  const staffQ = String(req.query.staff_id || '');
  const staffOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffQ);
  const staffId = staffOk ? staffQ : null;
  try {
    const tz = await getGymTz(gym_id);
    const r = await query(
      `WITH numbered AS (
         SELECT cs.*,
                ROW_NUMBER() OVER (PARTITION BY cs.gym_id ORDER BY cs.opened_at, cs.id) AS shift_no
         FROM cashbox_sessions cs WHERE cs.gym_id = $1
       )
       SELECT n.*, su.full_name AS staff_name,
              x.cash_in, x.cash_out, x.refunds,
              m.income_total, m.m_cash, m.m_visa, m.m_wallet, m.m_instapay, m.expense_total,
              n.opening_balance + x.cash_in - x.cash_out - x.refunds AS expected_balance,
              CASE WHEN n.closing_balance IS NOT NULL
                   THEN n.closing_balance - (n.opening_balance + x.cash_in - x.cash_out - x.refunds)
                   ELSE NULL END AS difference
       FROM numbered n
       LEFT JOIN staff_users su ON su.id = n.staff_user_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(ft.amount) FILTER (WHERE ${CASH_IN}), 0) AS cash_in,
                COALESCE(SUM(ft.amount) FILTER (WHERE ${CASH_OUT}), 0) AS cash_out,
                COALESCE(SUM(ft.amount) FILTER (WHERE ${CASH_REFUND}), 0) AS refunds
         FROM financial_transactions ft
         WHERE ft.cash_session_id = n.id
       ) x ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment'), 0) AS income_total,
                COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment' AND ft.payment_method = 'cash'), 0) AS m_cash,
                COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment' AND ft.payment_method IN ('card', 'visa')), 0) AS m_visa,
                COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment' AND ft.payment_method IN ('wallet', 'vodafone_cash')), 0) AS m_wallet,
                COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment' AND ft.payment_method IN ('instapay', 'bank')), 0) AS m_instapay,
                COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'expense'), 0) AS expense_total
         FROM financial_transactions ft
         WHERE ft.cash_session_id = n.id
       ) m ON TRUE
       WHERE ($2::date IS NULL OR (n.opened_at AT TIME ZONE $4)::date >= $2::date)
         AND ($3::date IS NULL OR (n.opened_at AT TIME ZONE $4)::date <= $3::date)
         AND ($5::uuid IS NULL OR n.staff_user_id = $5::uuid)
       ORDER BY n.opened_at DESC`, [gym_id, from, to, tz, staffId]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listCashbox failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// Per-session cash movements (the reconciliation detail behind expected_balance).
export const listSessionLedger = async (req: Request, res: Response) => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    // §34ث — return the session with the SAME reconciliation fields as the list
    // (staff name, cash in/out, expected, difference) so the ledger modal never
    // shows a raw half-populated row.
    const session = await query(
      `SELECT cs.*, su.full_name AS staff_name,
              x.cash_in, x.cash_out, x.refunds,
              cs.opening_balance + x.cash_in - x.cash_out - x.refunds AS expected_balance,
              CASE WHEN cs.closing_balance IS NOT NULL
                   THEN cs.closing_balance - (cs.opening_balance + x.cash_in - x.cash_out - x.refunds)
                   ELSE NULL END AS difference
       FROM cashbox_sessions cs
       LEFT JOIN staff_users su ON cs.staff_user_id = su.id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(ft.amount) FILTER (WHERE ${CASH_IN}), 0) AS cash_in,
                COALESCE(SUM(ft.amount) FILTER (WHERE ${CASH_OUT}), 0) AS cash_out,
                COALESCE(SUM(ft.amount) FILTER (WHERE ${CASH_REFUND}), 0) AS refunds
         FROM financial_transactions ft
         WHERE ft.cash_session_id = cs.id
       ) x ON TRUE
       WHERE cs.id=$1 AND cs.gym_id=$2`, [id, gym_id]);
    if (session.rows.length === 0) { res.status(404).json({ error: 'Session not found' }); return; }
    const rows = await query(
      `SELECT ft.id, ft.type, ft.amount, ft.description, ft.payment_method, ft.created_at,
              COALESCE(m.full_name, su.full_name) AS party
       FROM financial_transactions ft
       LEFT JOIN members m ON m.id = ft.member_id
       LEFT JOIN staff_users su ON su.id = ft.staff_user_id
       WHERE ft.cash_session_id = $1 AND ft.gym_id = $2
       ORDER BY ft.created_at DESC LIMIT 500`, [id, gym_id]);
    res.json({ data: { session: session.rows[0], rows: rows.rows } });
  } catch (e: any) { logger.error('listSessionLedger failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const openCashbox = async (req: Request, res: Response) => {
  const { opening_balance, notes } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  try {
    // §34ث: one open shift per gym — otherwise cash attribution is meaningless.
    const open = await query(`SELECT id FROM cashbox_sessions WHERE gym_id=$1 AND status='open'`, [gym_id]);
    if (open.rows.length > 0) {
      res.status(400).json({ error: 'توجد وردية مفتوحة بالفعل — أغلقها قبل فتح وردية جديدة' });
      return;
    }
    const r = await query(`INSERT INTO cashbox_sessions (gym_id, staff_user_id, opening_balance, notes) VALUES ($1,$2,$3,$4) RETURNING *`, [gym_id, staff_user_id, opening_balance || 0, notes || null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('openCashbox failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const closeCashbox = async (req: Request, res: Response) => {
  const { id, closing_balance, notes } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    // §34ث fix: $4 must be typed — Postgres cannot infer a bare NULL parameter
    // inside `IS NOT NULL` ("could not determine data type of parameter $4").
    const r = await query(`UPDATE cashbox_sessions SET closed_at=NOW(), closing_balance=$1, status='closed', notes=CASE WHEN $4::text IS NOT NULL THEN COALESCE(notes,'') || ' | ' || $4::text ELSE notes END WHERE id=$2 AND gym_id=$3 RETURNING *`, [closing_balance, id, gym_id, notes]);
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('closeCashbox failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === REPORTS ===
export const getFinanceSummary = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const tz = await getGymTz(gym_id);
    // §34ث: monthly_sales was an ORDER COUNT rendered as revenue (and SalesPage
    // subtracted money totals from it). It is now the real POS sum; the count
    // travels separately. Revenue/expenses/today-strips use gym-local bounds.
    const [revenue, expenses, debtsTotal, sales, todayRev, yesterdayRev, todaySales] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE gym_id=$1 AND type='payment' AND created_at >= ${TZ_MONTH}`, [gym_id, tz]),
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE gym_id=$1 AND type='expense' AND created_at >= ${TZ_MONTH}`, [gym_id, tz]),
      query(`SELECT COALESCE(SUM(remaining_amount),0) AS total FROM member_debts WHERE gym_id=$1 AND status='active'`, [gym_id]),
      query(`SELECT COALESCE(SUM(total_amount),0) AS sum, COUNT(*)::int AS count FROM pos_orders WHERE gym_id=$1 AND created_at >= ${TZ_MONTH}`, [gym_id, tz]),
      // §24 today-strip: payments collected today vs the same figure yesterday
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE gym_id=$1 AND type='payment' AND created_at >= ${TZ_TODAY}`, [gym_id, tz]),
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE gym_id=$1 AND type='payment' AND created_at >= ${TZ_YDAY} AND created_at < ${TZ_TODAY}`, [gym_id, tz]),
      // §35ت — dashboard "مبيعات" card: today's real POS takings (gym-local day)
      query(`SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*)::int AS count FROM pos_orders WHERE gym_id=$1 AND created_at >= ${TZ_TODAY}`, [gym_id, tz]),
    ]);
    // كروت الخزنة: عدّادات اليوم + المرتجعات (شهر/يوم) — حقول مضافة بلا مساس بالقديم.
    const [mRefund, tRefund, tPayCount, tExp] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE gym_id=$1 AND type='refund' AND created_at >= ${TZ_MONTH}`, [gym_id, tz]),
      query(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*)::int AS count FROM financial_transactions WHERE gym_id=$1 AND type='refund' AND created_at >= ${TZ_TODAY}`, [gym_id, tz]),
      query(`SELECT COUNT(*)::int AS count FROM financial_transactions WHERE gym_id=$1 AND type='payment' AND created_at >= ${TZ_TODAY}`, [gym_id, tz]),
      query(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*)::int AS count FROM financial_transactions WHERE gym_id=$1 AND type='expense' AND created_at >= ${TZ_TODAY}`, [gym_id, tz]),
    ]);
    res.json({ data: {
      monthly_revenue: revenue.rows[0].total,
      monthly_expenses: expenses.rows[0].total,
      monthly_refunds: mRefund.rows[0].total,
      outstanding_debts: debtsTotal.rows[0].total,
      monthly_sales_sum: sales.rows[0].sum,
      monthly_sales_count: sales.rows[0].count,
      net_month: Number(revenue.rows[0].total) - Number(expenses.rows[0].total),
      today_revenue: todayRev.rows[0].total,
      yesterday_revenue: yesterdayRev.rows[0].total,
      today_sales_sum: todaySales.rows[0].total,
      today_sales_count: todaySales.rows[0].count,
      today_payment_count: tPayCount.rows[0].count,
      today_expense_sum: tExp.rows[0].total,
      today_expense_count: tExp.rows[0].count,
      today_refund_sum: tRefund.rows[0].total,
      today_refund_count: tRefund.rows[0].count,
      timezone: tz,
    } });
  } catch (e: any) { logger.error('getFinanceSummary failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === §34ث CASHBOOK (daily cash journal, grouped by GYM-local day) ===
export const getCashbook = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const days = Math.min(365, Math.max(1, parseInt(req.query.days as string) || 30));
  try {
    const tz = await getGymTz(gym_id);
    const r = await query(
      `WITH days AS (
         SELECT (CURRENT_TIMESTAMP AT TIME ZONE $2)::date - generate_series(0, $3::int - 1) AS d
       ),
       moves AS (
         SELECT (ft.created_at AT TIME ZONE $2)::date AS d,
                CASE WHEN ${CASH_IN} THEN ft.amount ELSE 0 END AS cash_in,
                CASE WHEN ${CASH_OUT} THEN ft.amount ELSE 0 END AS cash_out,
                CASE WHEN ${CASH_REFUND} THEN ft.amount ELSE 0 END AS refunds
         FROM financial_transactions ft
         WHERE ft.gym_id = $1
           AND (ft.type='payment' OR ft.type='expense' OR ft.type='refund')
           AND ft.created_at >= ((CURRENT_TIMESTAMP AT TIME ZONE $2)::date - $3::int)::timestamp AT TIME ZONE $2
       )
       SELECT to_char(days.d, 'YYYY-MM-DD') AS date,
              COALESCE(SUM(m.cash_in), 0) AS cash_in,
              COALESCE(SUM(m.cash_out), 0) AS cash_out,
              COALESCE(SUM(m.refunds), 0) AS refunds,
              COALESCE(SUM(m.cash_in), 0) - COALESCE(SUM(m.cash_out), 0) - COALESCE(SUM(m.refunds), 0) AS net
       FROM days LEFT JOIN moves m ON m.d = days.d
       GROUP BY days.d ORDER BY days.d`, [gym_id, tz, days]);
    const rows = r.rows.map((x) => ({ date: x.date, cash_in: Number(x.cash_in), cash_out: Number(x.cash_out), refunds: Number(x.refunds), net: Number(x.net) }));
    const totals = rows.reduce((t, x) => ({ cash_in: t.cash_in + x.cash_in, cash_out: t.cash_out + x.cash_out, refunds: t.refunds + x.refunds }), { cash_in: 0, cash_out: 0, refunds: 0 });
    res.status(200).json({ data: {
      days,
      timezone: tz,
      rows,
      totals: { cash_in: totals.cash_in, cash_out: totals.cash_out, refunds: totals.refunds, net: totals.cash_in - totals.cash_out - totals.refunds },
    } });
  } catch (e: any) { logger.error('getCashbook failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === حركات الخزنة (يوم/بحث متقدم): صفوف فردية بحدود زمنية بعملة الصالة ===
// One endpoint serves the day tables AND the advanced search modal: optional
// from/to (default = all time, capped), optional text search over description
// + member name, optional type filter. Range counts/sums travel alongside.
export const listMovements = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const from = ISO_DATE.test(String(req.query.from || '')) ? String(req.query.from) : null;
  const to = ISO_DATE.test(String(req.query.to || '')) ? String(req.query.to) : null;
  const typeQ = String(req.query.type || 'all');
  const type = ['payment', 'expense', 'refund'].includes(typeQ) ? typeQ : null;
  const search = String(req.query.search || '').trim().slice(0, 60);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string, 10) || 200));
  try {
    const tz = await getGymTz(gym_id);
    const typeClause = type ? ` AND ft.type = '${type}'` : ``;
    const searchClause = search
      ? ` AND (ft.description ILIKE $5 OR m.full_name ILIKE $5)`
      : ``;
    const sparams: unknown[] = search ? [`%${search}%`] : [];
    const stats = await query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(ft.amount) FILTER (WHERE ft.type='payment'), 0) AS in_sum,
              COALESCE(SUM(ft.amount) FILTER (WHERE ft.type='expense'), 0) AS out_sum,
              COALESCE(SUM(ft.amount) FILTER (WHERE ft.type='refund'), 0) AS refund_sum
       FROM financial_transactions ft
       LEFT JOIN members m ON m.id = ft.member_id
       WHERE ft.gym_id=$1${RANGE_CLAUSE}${typeClause}${searchClause}`,
      [gym_id, from, tz, to, ...sparams]);
    const rows = await query(
      `SELECT ft.id, ft.type, ft.amount, ft.description, ft.payment_method, ft.created_at,
              m.full_name AS member_name
       FROM financial_transactions ft
       LEFT JOIN members m ON m.id = ft.member_id
       WHERE ft.gym_id=$1${RANGE_CLAUSE}${typeClause}${searchClause}
       ORDER BY ft.created_at DESC LIMIT ${limit}`,
      [gym_id, from, tz, to, ...sparams]);
    const s = stats.rows[0] || {};
    res.json({
      data: rows.rows,
      stats: {
        count: Number(s.count || 0),
        in_sum: Number(s.in_sum || 0),
        out_sum: Number(s.out_sum || 0),
        refund_sum: Number(s.refund_sum || 0),
      },
    });
  } catch (e: any) { logger.error('listMovements failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === المرتجعات: رد مبلغ لعضو (نوع مستقل بلا خلط مع المصروفات) ===
export const createRefund = async (req: Request, res: Response) => {  const { member_id, amount, description, payment_method } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  try {
    if (member_id) {
      const member = await query(`SELECT id FROM members WHERE id=$1 AND gym_id=$2 AND deleted_at IS NULL`, [member_id, gym_id]);
      if (member.rows.length === 0) {
        res.status(400).json({ error: 'Member not found in this gym' });
        return;
      }
    }
    const r = await query(
      `INSERT INTO financial_transactions (gym_id, type, amount, description, staff_user_id, member_id, payment_method, cash_session_id)
       VALUES ($1,'refund',$2,$3,$4,$5,$6,${OPEN_SESSION}) RETURNING *`,
      [gym_id, amount, description, staff_user_id, member_id || null, payment_method || 'cash']);
    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1,$2,$3,$4)`,
      [gym_id, staff_user_id, `Refund ${amount} to ${member_id ? `member ${member_id}` : 'walk-in'}: ${description}`, req.ip]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createRefund failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === تقرير الشيفت: نموذج الإقفال (معلومات + ملخص + طرق دفع + تفصيل عمليات) ===
// نافذة الشيفت = opened_at حتى closed_at (أو الآن للمفتوحة).
// الرواتب من دفتر الرواتب في نطاق التواريخ؛ المصروفات العامة = كل المصروفات
// عدا فئة الرواتب (اسم الفئة يحوي «راتب») حتى لا تُحسب مرتين.
export const getShiftReport = async (req: Request, res: Response) => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) {
    res.status(400).json({ error: 'Invalid session id.' });
    return;
  }
  try {
    const tz = await getGymTz(gym_id);
    const s = await query(
      `WITH numbered AS (
         SELECT cs.*,
                ROW_NUMBER() OVER (PARTITION BY cs.gym_id ORDER BY cs.opened_at, cs.id) AS shift_no
         FROM cashbox_sessions cs WHERE cs.gym_id = $1
       )
       SELECT n.*, su.full_name AS staff_name,
              x.cash_in, x.cash_out, x.refunds,
              m.income_total, m.m_cash, m.m_visa, m.m_wallet, m.m_instapay, m.expense_total,
              n.opening_balance + x.cash_in - x.cash_out - x.refunds AS expected_balance,
              CASE WHEN n.closing_balance IS NOT NULL
                   THEN n.closing_balance - (n.opening_balance + x.cash_in - x.cash_out - x.refunds)
                   ELSE NULL END AS difference
       FROM numbered n
       LEFT JOIN staff_users su ON su.id = n.staff_user_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(ft.amount) FILTER (WHERE ${CASH_IN}), 0) AS cash_in,
                COALESCE(SUM(ft.amount) FILTER (WHERE ${CASH_OUT}), 0) AS cash_out,
                COALESCE(SUM(ft.amount) FILTER (WHERE ${CASH_REFUND}), 0) AS refunds
         FROM financial_transactions ft
         WHERE ft.cash_session_id = n.id
       ) x ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment'), 0) AS income_total,
                COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment' AND ft.payment_method = 'cash'), 0) AS m_cash,
                COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment' AND ft.payment_method IN ('card', 'visa')), 0) AS m_visa,
                COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment' AND ft.payment_method IN ('wallet', 'vodafone_cash')), 0) AS m_wallet,
                COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment' AND ft.payment_method IN ('instapay', 'bank')), 0) AS m_instapay,
                COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'expense'), 0) AS expense_total
         FROM financial_transactions ft
         WHERE ft.cash_session_id = n.id
       ) m ON TRUE
       WHERE n.id = $2 AND n.gym_id = $1`, [gym_id, id]);
    if (s.rows.length === 0) { res.status(404).json({ error: 'Session not found' }); return; }
    const session = s.rows[0];
    const ops = await query(
      `SELECT
         COUNT(*) FILTER (WHERE ft.type = 'payment' AND ft.pos_order_id IS NULL)::int AS subs_count,
         COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment' AND ft.pos_order_id IS NULL), 0) AS subs_sum,
         COUNT(*) FILTER (WHERE ft.type = 'payment' AND ft.pos_order_id IS NOT NULL)::int AS sales_count,
         COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'payment' AND ft.pos_order_id IS NOT NULL), 0) AS sales_sum,
         COUNT(*) FILTER (WHERE ft.type = 'expense' AND (ec.name IS NULL OR ec.name NOT ILIKE '%راتب%'))::int AS gen_exp_count,
         COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'expense' AND (ec.name IS NULL OR ec.name NOT ILIKE '%راتب%')), 0) AS gen_exp_sum,
         COUNT(*) FILTER (WHERE ft.type = 'refund')::int AS refund_count,
         COALESCE(SUM(ft.amount) FILTER (WHERE ft.type = 'refund'), 0) AS refund_sum
       FROM financial_transactions ft
       LEFT JOIN expense_categories ec ON ec.id = ft.category_id
       WHERE ft.cash_session_id = $1 AND ft.gym_id = $2`, [id, gym_id]);
    const sal = await query(
      `SELECT COUNT(*)::int AS pay_count,
              COALESCE(SUM(base_salary_paid + commissions_paid), 0) AS pay_sum
       FROM payroll_ledger
       WHERE gym_id = $1 AND payment_date::timestamp AT TIME ZONE $3 >= (SELECT opened_at FROM cashbox_sessions WHERE id = $2)
         AND payment_date::timestamp AT TIME ZONE $3 <= COALESCE((SELECT closed_at FROM cashbox_sessions WHERE id = $2), NOW())`,
      [gym_id, id, tz]);
    res.json({ data: { session, ops: ops.rows[0], salaries: sal.rows[0] } });
  } catch (e: any) { logger.error('getShiftReport failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};
