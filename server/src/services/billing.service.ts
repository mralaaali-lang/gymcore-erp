/**
 * billing.service.ts — Billing engine for GymCore ERP
 * Handles invoice creation, calculation, tax, payment linking, and reports.
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface InvoiceCreateInput {
  gym_id: string;
  tenant_id?: string;
  billing_period_start: string;
  billing_period_end: string;
  plan_id?: string;
  plan_name?: string;
  base_amount: number;
  tax_rate?: number;
  tax_amount?: number;
  discount_amount?: number;
  coupon_id?: string;
  currency?: string;
  due_date: string;
  notes?: string;
  created_by?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  gym_id: string;
  tenant_id: string | null;
  billing_period_start: string;
  billing_period_end: string;
  plan_id: string | null;
  plan_name: string | null;
  base_amount: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  status: string;
  due_date: string;
  paid_at: string | null;
  paid_amount: number;
  payment_method: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_revenue: number;
  pending_invoices: number;
  overdue_invoices: number;
  paid_invoices: number;
  month_over_month_growth: number;
  collection_rate: number;
}

/**
 * Generate a unique invoice number with gym prefix
 */
function generateInvoiceNumber(gym_id: string): string {
  const prefix = gym_id.slice(0, 8).toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${prefix}-${timestamp}-${random}`;
}

/**
 * Create a new invoice
 */
export async function createInvoice(input: InvoiceCreateInput): Promise<Invoice> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invoiceNumber = generateInvoiceNumber(input.gym_id);
    const taxAmount = input.tax_amount ?? Math.round(input.base_amount * (input.tax_rate ?? 0) * 100) / 100;
    const discountAmount = input.discount_amount ?? 0;
    const totalAmount = Math.round((input.base_amount + taxAmount - discountAmount) * 100) / 100;

    const result = await client.query(
      `INSERT INTO billing_invoices (
        id, invoice_number, gym_id, tenant_id, billing_period_start, billing_period_end,
        plan_id, plan_name, base_amount, tax_amount, discount_amount, total_amount,
        currency, status, due_date, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        uuidv4(), invoiceNumber, input.gym_id, input.tenant_id ?? null,
        input.billing_period_start, input.billing_period_end,
        input.plan_id ?? null, input.plan_name ?? null,
        input.base_amount, taxAmount, discountAmount, totalAmount,
        input.currency ?? 'EGP', 'pending', input.due_date,
        input.notes ?? null, input.created_by ?? null,
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get invoice by ID
 */
export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  const result = await pool.query(
    'SELECT * FROM billing_invoices WHERE id = $1',
    [invoiceId]
  );
  return result.rows[0] ?? null;
}

/**
 * Get invoices for a gym with optional filters
 */
export async function getInvoices(filters: {
  gym_id?: string;
  status?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}): Promise<{ invoices: Invoice[]; total: number; page: number; limit: number }> {
  const { gym_id, status, from_date, to_date, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM billing_invoices WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (gym_id) {
    query += ` AND gym_id = $${paramIndex++}`;
    params.push(gym_id);
  }
  if (status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(status);
  }
  if (from_date) {
    query += ` AND billing_period_start >= $${paramIndex++}`;
    params.push(from_date);
  }
  if (to_date) {
    query += ` AND billing_period_end <= $${paramIndex++}`;
    params.push(to_date);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM billing_invoices WHERE 1=1` +
    [gym_id, status, from_date, to_date].reduce((sql, val, i) => {
      if (val) {
        const field = ['gym_id', 'status', 'billing_period_start', 'billing_period_end'][i];
        const op = field === 'billing_period_start' ? '>=' : field === 'billing_period_end' ? '<=' : '=';
        return sql + ` AND ${field} ${op} $${i + 1}`;
      }
      return sql;
    }, '')
  , gym_id ? [gym_id] : []);

  // Simpler count query
  let countQuery = 'SELECT COUNT(*) as total FROM billing_invoices WHERE 1=1';
  const countParams: unknown[] = [];
  let countIdx = 1;
  if (gym_id) { countQuery += ` AND gym_id = $${countIdx++}`; countParams.push(gym_id); }
  if (status) { countQuery += ` AND status = $${countIdx++}`; countParams.push(status); }
  if (from_date) { countQuery += ` AND billing_period_start >= $${countIdx++}`; countParams.push(from_date); }
  if (to_date) { countQuery += ` AND billing_period_end <= $${countIdx++}`; countParams.push(to_date); }
  const countResult2 = await pool.query(countQuery, countParams);

  return {
    invoices: result.rows,
    total: parseInt(countResult2.rows[0].total, 10),
    page,
    limit,
  };
}

/**
 * Update invoice status
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  status: string,
  paidAmount?: number,
  paymentMethod?: string,
  paymentReference?: string
): Promise<Invoice | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const setParts: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: unknown[] = [];
    let paramIndex = 1;

    setParts.push(`status = $${paramIndex++}`);
    params.push(status);

    if (paidAmount !== undefined) {
      setParts.push(`paid_amount = $${paramIndex++}`);
      params.push(paidAmount);
      setParts.push(`paid_at = CURRENT_TIMESTAMP`);
    }
    if (paymentMethod) {
      setParts.push(`payment_method = $${paramIndex++}`);
      params.push(paymentMethod);
    }
    if (paymentReference) {
      setParts.push(`payment_reference = $${paramIndex++}`);
      params.push(paymentReference);
    }

    const query = `UPDATE billing_invoices SET ${setParts.join(', ')} WHERE id = $${paramIndex++} RETURNING *`;
    params.push(invoiceId);

    const result = await client.query(query, params);
    await client.query('COMMIT');
    return result.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(gym_id?: string): Promise<DashboardStats> {
  let baseQuery = 'SELECT * FROM billing_invoices WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (gym_id) {
    baseQuery += ` AND gym_id = $${paramIndex++}`;
    params.push(gym_id);
  }

  const result = await pool.query(baseQuery, params);
  const invoices = result.rows;

  const totalRevenue = invoices
    .filter((inv: Invoice) => inv.status === 'paid' || inv.status === 'partial')
    .reduce((sum: number, inv: Invoice) => sum + (inv.paid_amount || 0), 0);

  const pendingInvoices = invoices.filter((inv: Invoice) => inv.status === 'pending').length;
  const overdueInvoices = invoices.filter((inv: Invoice) => inv.status === 'overdue').length;
  const paidInvoices = invoices.filter((inv: Invoice) => inv.status === 'paid').length;

  // Collection rate
  const totalInvoiced = invoices.reduce((sum: number, inv: Invoice) => sum + inv.total_amount, 0);
  const collectionRate = totalInvoiced > 0 ? Math.round((totalRevenue / totalInvoiced) * 10000) / 100 : 0;

  return {
    total_revenue: totalRevenue,
    pending_invoices: pendingInvoices,
    overdue_invoices: overdueInvoices,
    paid_invoices: paidInvoices,
    month_over_month_growth: 0, // TODO: implement month-over-month comparison
    collection_rate: collectionRate,
  };
}
