import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import logger from '../config/logger';

// === PAYMENTS (financial_transactions — type='payment') ===
// §34ث: the list used to fake `NULL::text AS member_name` and the insert
// dropped member_id/payment_method even though the schema required them.
// Migration 058 added the columns; now they are stored and joined for real.
export const listPayments = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;
  try {
    const agg = await query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(amount), 0) AS total_sum,
              COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::int AS month_count,
              COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)), 0) AS month_sum
       FROM financial_transactions WHERE gym_id=$1 AND type='payment'`, [gym_id]);
    const a = agg.rows[0] || {};
    const total = Number(a.total || 0);
    const data = await query(
      `SELECT ft.*, m.full_name AS member_name
       FROM financial_transactions ft
       LEFT JOIN members m ON m.id = ft.member_id
       WHERE ft.gym_id=$1 AND ft.type='payment'
       ORDER BY ft.created_at DESC LIMIT $2 OFFSET $3`, [gym_id, limit, offset]);
    res.json({
      data: data.rows,
      pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
      stats: { total_count: total, total_sum: Number(a.total_sum), month_count: Number(a.month_count || 0), month_sum: Number(a.month_sum) },
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
      `INSERT INTO financial_transactions (gym_id, type, amount, description, staff_user_id, member_id, payment_method)
       VALUES ($1,'payment',$2,$3,$4,$5,$6) RETURNING *`,
      [gym_id, amount, description, staff_user_id, member_id, payment_method || 'cash']);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createPayment failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === EXPENSES (financial_transactions — type='expense') ===
export const listExpenses = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const data = await query(`SELECT ft.*, ec.name AS category_name FROM financial_transactions ft LEFT JOIN expense_categories ec ON ft.category_id=ec.id WHERE ft.gym_id=$1 AND ft.type='expense' ORDER BY ft.created_at DESC`, [gym_id]);
    res.json({ data: data.rows });
  } catch (e: any) { logger.error('listExpenses failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createExpense = async (req: Request, res: Response) => {
  const { amount, description, category_id } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  try {
    const r = await query(`INSERT INTO financial_transactions (gym_id, type, amount, description, category_id, staff_user_id) VALUES ($1,'expense',$2,$3,$4,$5) RETURNING *`, [gym_id, amount, description, category_id, staff_user_id]);
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
export const listDebts = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT md.*, m.full_name AS member_name, decrypt_sensitive(m.phone_encrypted) as phone_number FROM member_debts md JOIN members m ON md.member_id=m.id WHERE md.gym_id=$1 ORDER BY md.created_at DESC`, [gym_id]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listDebts failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createDebt = async (req: Request, res: Response) => {
  const { member_id, amount, due_date, reason } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`INSERT INTO member_debts (gym_id, member_id, original_amount, remaining_amount, due_date, reason) VALUES ($1,$2,$3,$3,$4,$5) RETURNING *`, [gym_id, member_id, amount, due_date, reason]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createDebt failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const payDebt = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const debt = await query(`SELECT remaining_amount FROM member_debts WHERE id=$1 AND gym_id=$2`, [id, gym_id]);
    if (debt.rows.length === 0) { res.status(404).json({ error: 'Debt not found' }); return; }
    const newRemaining = Math.max(0, debt.rows[0].remaining_amount - amount);
    const status = newRemaining <= 0 ? 'paid' : 'active';
    await query(`UPDATE member_debts SET remaining_amount=$1, status=$2, updated_at=NOW() WHERE id=$3`, [newRemaining, status, id]);
    res.json({ success: true, remaining: newRemaining });
  } catch (e: any) { logger.error('payDebt failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === CASHBOX ===
export const listCashboxSessions = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT cs.*, su.full_name AS staff_name FROM cashbox_sessions cs LEFT JOIN staff_users su ON cs.staff_user_id=su.id WHERE cs.gym_id=$1 ORDER BY cs.opened_at DESC`, [gym_id]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listCashbox failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const openCashbox = async (req: Request, res: Response) => {
  const { opening_balance, notes } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  try {
    const r = await query(`INSERT INTO cashbox_sessions (gym_id, staff_user_id, opening_balance, notes) VALUES ($1,$2,$3,$4) RETURNING *`, [gym_id, staff_user_id, opening_balance || 0, notes || null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('openCashbox failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const closeCashbox = async (req: Request, res: Response) => {
  const { id, closing_balance, notes } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`UPDATE cashbox_sessions SET closed_at=NOW(), closing_balance=$1, status='closed', notes=CASE WHEN $4 IS NOT NULL THEN notes || ' | ' || $4 ELSE notes END WHERE id=$2 AND gym_id=$3 RETURNING *`, [closing_balance, id, gym_id, notes]);
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('closeCashbox failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === REPORTS ===
export const getFinanceSummary = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const [revenue, expenses, debtsTotal, salesCount, todayRev, yesterdayRev] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE gym_id=$1 AND type='payment' AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`, [gym_id]),
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE gym_id=$1 AND type='expense' AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`, [gym_id]),
      query(`SELECT COALESCE(SUM(remaining_amount),0) AS total FROM member_debts WHERE gym_id=$1 AND status='active'`, [gym_id]),
      query(`SELECT COUNT(*) AS count FROM pos_orders WHERE gym_id=$1 AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`, [gym_id]),
      // §24 today-strip: payments collected today vs the same figure yesterday
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE gym_id=$1 AND type='payment' AND created_at >= CURRENT_DATE`, [gym_id]),
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE gym_id=$1 AND type='payment' AND created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE`, [gym_id]),
    ]);
    res.json({ data: { monthly_revenue: revenue.rows[0].total, monthly_expenses: expenses.rows[0].total, outstanding_debts: debtsTotal.rows[0].total, monthly_sales: salesCount.rows[0].count, today_revenue: todayRev.rows[0].total, yesterday_revenue: yesterdayRev.rows[0].total } });
  } catch (e: any) { logger.error('getFinanceSummary failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};
