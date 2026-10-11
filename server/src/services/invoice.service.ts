/**
 * invoice.service.ts — Invoice generation, PDF/print, email dispatch
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Generate a printable invoice summary (HTML)
 */
export async function generateInvoiceHTML(invoiceId: string): Promise<string> {
  const result = await pool.query(
    `SELECT i.*, g.name AS gym_name, g.address_country,
            p.name AS plan_name, p.price AS plan_price
     FROM billing_invoices i
     LEFT JOIN gyms g ON i.gym_id = g.id
     LEFT JOIN billing_plans p ON i.plan_id = p.id
     WHERE i.id = $1`,
    [invoiceId]
  );

  const invoice = result.rows[0];
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const lineItems = await pool.query(
    'SELECT * FROM billing_line_items WHERE invoice_id = $1 ORDER BY sort_order',
    [invoiceId]
  );

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    body { font-family: 'Cairo', sans-serif; direction: rtl; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    h1 { color: #1e293b; font-size: 24px; }
    .info { color: #64748b; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: right; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; }
    .total { font-size: 18px; font-weight: bold; text-align: left; padding-top: 16px; }
    .status { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-paid { background: #d1fae5; color: #065f46; }
    .status-overdue { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>فاتورة ضريبية</h1>
      <p class="info">Invoice #: ${invoice.invoice_number}</p>
      <p class="info">Date: ${new Date(invoice.created_at).toLocaleDateString('ar-EG')}</p>
    </div>
    <div>
      <p class="info"><strong>Gym:</strong> ${invoice.gym_name}</p>
      <p class="info">${invoice.address_country || ''}</p>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>Description</th><th>Quantity</th><th>Unit Price</th><th>Amount</th></tr>
    </thead>
    <tbody>
      ${lineItems.rows.map((item: any) => `
        <tr>
          <td>${item.description}</td>
          <td>${item.quantity}</td>
          <td>${item.unit_price} ${invoice.currency}</td>
          <td>${item.amount} ${invoice.currency}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="total">
    <p>Base Amount: ${invoice.base_amount} ${invoice.currency}</p>
    <p>Tax: ${invoice.tax_amount} ${invoice.currency}</p>
    <p>Discount: ${invoice.discount_amount} ${invoice.currency}</p>
    <p><strong>Total: ${invoice.total_amount} ${invoice.currency}</strong></p>
    <p>Status: <span class="status status-${invoice.status}">${invoice.status}</span></p>
  </div>
</body>
</html>`;
}

/**
 * Send invoice via email (placeholder - uses existing email service)
 */
export async function sendInvoiceEmail(invoiceId: string, toEmail: string): Promise<boolean> {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

  const html = await generateInvoiceHTML(invoiceId);

  // Use existing email service
  try {
    const { sendPasswordResetEmail } = await import('../services/email');
    await sendPasswordResetEmail(toEmail, `Invoice #${invoice.invoice_number}`, `Invoice ${invoice.invoice_number}`);
    return true;
  } catch (err) {
    console.error('Failed to send invoice email:', err);
    return false;
  }
}

/**
 * Cancel an invoice
 */
export async function cancelInvoice(invoiceId: string, reason: string): Promise<any> {
  const result = await pool.query(
    `UPDATE billing_invoices
     SET status = 'cancelled', notes = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [invoiceId, reason]
  );
  return result.rows[0] ?? null;
}

/**
 * Get invoice by ID for service use
 */
async function getInvoiceById(invoiceId: string) {
  const result = await pool.query('SELECT * FROM billing_invoices WHERE id = $1', [invoiceId]);
  return result.rows[0] ?? null;
}
