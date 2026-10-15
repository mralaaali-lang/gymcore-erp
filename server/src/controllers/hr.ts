import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query, getClient } from '../config/database';
import logger from '../config/logger';

// شئون الموظفين (HR): إجازات (الخصم لحظة الاعتماد) + حركات راتب
// (سلفة تُسدد بالتقسيط عبر المسير) + مسير شهري (مسودة←معتمد←مصروف)
// + عقود CON- متسلسلة لا تُعاد + تحضير يومي + حضور ذاتي بالـPIN.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const YYYY_MM = /^\d{4}-\d{2}$/;

// الرصيد المستخدم من طلبات معتمدة: سنوي/مرضي تراكمي، شهري داخل الشهر
async function leaveUsed(
  q: { query: (t: string, p: unknown[]) => Promise<{ rows: any[] }> },
  gym_id: string | undefined, staffId: string, month: string
): Promise<{ annual: number; sick: number; monthly: number }> {
  const r = await q.query(
    `SELECT COALESCE(SUM(days) FILTER (WHERE leave_type = 'annual'), 0) AS annual,
            COALESCE(SUM(days) FILTER (WHERE leave_type = 'sick'), 0) AS sick,
            COALESCE(SUM(days) FILTER (WHERE leave_type = 'annual' AND to_char(start_date, 'YYYY-MM') <= $3 AND to_char(end_date, 'YYYY-MM') >= $3), 0) AS monthly
     FROM hr_leave_requests
     WHERE gym_id = $1 AND staff_user_id = $2 AND status = 'approved'`,
    [gym_id, staffId, month]
  );
  return {
    annual: Number(r.rows[0]?.annual ?? 0),
    sick: Number(r.rows[0]?.sick ?? 0),
    monthly: Number(r.rows[0]?.monthly ?? 0),
  };
}

// === LEAVES ===
export const listLeaves = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const status = String(req.query.status ?? '');
  const q = String(req.query.q ?? '').trim();
  try {
    const r = await query(
      `SELECT l.*, su.full_name AS staff_name, su.employee_code
       FROM hr_leave_requests l
       LEFT JOIN staff_users su ON su.id = l.staff_user_id
       WHERE l.gym_id = $1
         ${['pending', 'approved', 'rejected'].includes(status) ? 'AND l.status = $2' : ''}
         ${q ? `AND (su.full_name ILIKE $${['pending', 'approved', 'rejected'].includes(status) ? 3 : 2} OR su.employee_code ILIKE $${['pending', 'approved', 'rejected'].includes(status) ? 3 : 2})` : ''}
       ORDER BY l.created_at DESC LIMIT 200`,
      [gym_id, ...(['pending', 'approved', 'rejected'].includes(status) ? [status] : []), ...(q ? [`%${q}%`] : [])]
    );
    res.json({ data: r.rows.map((x) => ({ ...x, days: Number(x.days) })) });
  } catch (e: any) { logger.error('listLeaves failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const requestLeave = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const { staff_user_id, leave_type, start_date, end_date, notes } = req.body;
  if (!ISO_DATE.test(start_date || '') || !ISO_DATE.test(end_date || '') || end_date < start_date) {
    res.status(400).json({ error: 'Invalid leave dates.' });
    return;
  }
  try {
    const s = await query(`SELECT id FROM staff_users WHERE id = $1 AND gym_id = $2 AND is_active = true`, [staff_user_id, gym_id]);
    if (s.rows.length === 0) { res.status(400).json({ error: 'Staff not found or inactive.' }); return; }
    const days = Math.round((new Date(end_date).getTime() - new Date(start_date).getTime()) / 86400000) + 1;
    const r = await query(
      `INSERT INTO hr_leave_requests (gym_id, staff_user_id, leave_type, start_date, end_date, days, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [gym_id, staff_user_id, leave_type, start_date, end_date, days, (notes || '').trim() || null]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('requestLeave failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const decideLeave = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const approve = req.body?.approve === true;
  try {
    const cur = await query(
      `SELECT l.*, su.annual_leave_days, su.sick_leave_days, su.monthly_leave_days
       FROM hr_leave_requests l LEFT JOIN staff_users su ON su.id = l.staff_user_id
       WHERE l.id = $1 AND l.gym_id = $2`,
      [id, gym_id]
    );
    if (cur.rows.length === 0) { res.status(404).json({ error: 'Leave not found.' }); return; }
    const row = cur.rows[0];
    if (row.status !== 'pending') { res.status(400).json({ error: 'Already decided.' }); return; }
    if (!approve) {
      await query(`UPDATE hr_leave_requests SET status = 'rejected', decided_by = $1, decided_at = NOW() WHERE id = $2`,
        [req.staff?.staff_user_id, id]);
      res.json({ data: { id, status: 'rejected' } });
      return;
    }
    // الخصم لحظة الاعتماد: الرصيد يُفحص هنا لا عند الطلب
    if (row.leave_type !== 'unpaid') {
      const month = String(row.start_date).slice(0, 7);
      const used = await leaveUsed({ query }, gym_id, row.staff_user_id, month);
      const allowance = row.leave_type === 'annual'
        ? { have: Number(row.annual_leave_days ?? 0) - used.annual - used.monthly, label: 'السنوي' }
        : { have: Number(row.sick_leave_days ?? 0) - used.sick, label: 'المرضي' };
      const need = Number(row.days);
      // الشهري سقف إضافي للسنوية داخل الشهر
      if (row.leave_type === 'annual') {
        const monthlyHave = Number(row.monthly_leave_days ?? 0) - used.monthly;
        if (need > monthlyHave) {
          res.status(400).json({ error: `Monthly balance insufficient (left ${monthlyHave}).` });
          return;
        }
      }
      if (need > allowance.have) {
        res.status(400).json({ error: `${allowance.label} balance insufficient (left ${allowance.have}).` });
        return;
      }
    }
    await query(`UPDATE hr_leave_requests SET status = 'approved', decided_by = $1, decided_at = NOW() WHERE id = $2`,
      [req.staff?.staff_user_id, id]);
    res.json({ data: { id, status: 'approved' } });
  } catch (e: any) { logger.error('decideLeave failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const leaveBalances = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const raw = String(req.query.month ?? '').trim();
  const month = YYYY_MM.test(raw) ? raw : new Date().toISOString().slice(0, 7);
  try {
    const staff = await query(
      `SELECT id, full_name, employee_code, monthly_leave_days, annual_leave_days, sick_leave_days
       FROM staff_users WHERE gym_id = $1 AND is_active = true AND deleted_at IS NULL ORDER BY full_name`,
      [gym_id]
    );
    const out = [];
    for (const s of staff.rows) {
      const used = await leaveUsed({ query }, gym_id, s.id, month);
      const monthly = Number(s.monthly_leave_days ?? 0);
      out.push({
        staff_id: s.id, full_name: s.full_name, employee_code: s.employee_code,
        monthly_allowance: monthly, monthly_used: used.monthly,
        monthly_left: Math.max(0, monthly - used.monthly),
        annual_left: Math.max(0, Number(s.annual_leave_days ?? 0) - used.annual),
        sick_left: Math.max(0, Number(s.sick_leave_days ?? 0) - used.sick),
      });
    }
    res.json({ data: out, month });
  } catch (e: any) { logger.error('leaveBalances failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === ADJUSTMENTS ===
export const listAdjustments = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const month = YYYY_MM.test(String(req.query.month ?? '')) ? String(req.query.month) : new Date().toISOString().slice(0, 7);
  const kind = String(req.query.kind ?? '');
  const q = String(req.query.q ?? '').trim();
  try {
    const r = await query(
      `SELECT a.*, su.full_name AS staff_name, su.employee_code,
              (a.amount - a.repaid) AS outstanding
       FROM hr_adjustments a
       LEFT JOIN staff_users su ON su.id = a.staff_user_id
       WHERE a.gym_id = $1 AND a.month = $2
         ${['bonus', 'deduction', 'advance'].includes(kind) ? 'AND a.kind = $3' : ''}
         ${q ? `AND (su.full_name ILIKE $${['bonus', 'deduction', 'advance'].includes(kind) ? 4 : 3} OR su.employee_code ILIKE $${['bonus', 'deduction', 'advance'].includes(kind) ? 4 : 3})` : ''}
       ORDER BY a.created_at DESC`,
      [gym_id, month, ...(['bonus', 'deduction', 'advance'].includes(kind) ? [kind] : []), ...(q ? [`%${q}%`] : [])]
    );
    const sums = await query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'bonus'), 0) AS bonus,
              COALESCE(SUM(amount) FILTER (WHERE kind = 'deduction'), 0) AS deductions,
              COALESCE(SUM(amount - repaid) FILTER (WHERE kind = 'advance'), 0) AS advances
       FROM hr_adjustments WHERE gym_id = $1 AND month = $2`,
      [gym_id, month]
    );
    res.json({
      data: r.rows.map((x) => ({ ...x, amount: Number(x.amount), repaid: Number(x.repaid), outstanding: Number(x.outstanding) })),
      stats: { bonus: Number(sums.rows[0]?.bonus ?? 0), deductions: Number(sums.rows[0]?.deductions ?? 0), advances: Number(sums.rows[0]?.advances ?? 0) },
      month,
    });
  } catch (e: any) { logger.error('listAdjustments failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createAdjustment = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const { staff_user_id, kind, amount, installment, month, reason } = req.body;
  try {
    const s = await query(`SELECT id FROM staff_users WHERE id = $1 AND gym_id = $2 AND is_active = true`, [staff_user_id, gym_id]);
    if (s.rows.length === 0) { res.status(400).json({ error: 'Staff not found or inactive.' }); return; }
    const r = await query(
      `INSERT INTO hr_adjustments (gym_id, staff_user_id, kind, amount, installment, month, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [gym_id, staff_user_id, kind, amount, installment ?? null, month, (reason || '').trim() || null, req.staff?.staff_user_id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createAdjustment failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const deleteAdjustment = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`DELETE FROM hr_adjustments WHERE id = $1 AND gym_id = $2 RETURNING id`, [id, gym_id]);
    if (r.rows.length === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json({ data: { id, deleted: true } });
  } catch (e: any) { logger.error('deleteAdjustment failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// سداد سلفة يدوي (خارج المسير) — يُنقص المتبقي بلا حركة خزنة (التقسيط
// الشهري عبر المسير هو المسار الأساسي)
export const repayAdvance = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const amount = Number(req.body?.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: 'Invalid amount.' }); return; }
  try {
    const r = await query(
      `UPDATE hr_adjustments SET repaid = LEAST(repaid + $1, amount)
       WHERE id = $2 AND gym_id = $3 AND kind = 'advance' RETURNING id, amount, repaid, (amount - repaid) AS outstanding`,
      [amount, id, gym_id]
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Advance not found.' }); return; }
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('repayAdvance failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === PAYROLL RUNS ===
export const generatePayroll = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const month = String(req.body?.month || '');
  if (!YYYY_MM.test(month)) { res.status(400).json({ error: 'Invalid month.' }); return; }
  const client = await getClient();
  try {
    const existing = await client.query(`SELECT id, status FROM hr_payroll_runs WHERE gym_id = $1 AND month = $2`, [gym_id, month]);
    if (existing.rows.length > 0 && existing.rows[0].status !== 'draft') {
      res.status(409).json({ error: 'This month is already approved/paid — it cannot be regenerated.' });
      return;
    }
    await client.query('BEGIN');
    let runId: string;
    if (existing.rows.length > 0) {
      runId = existing.rows[0].id;
      await client.query(`DELETE FROM hr_payroll_items WHERE run_id = $1`, [runId]);
    } else {
      const ins = await client.query(
        `INSERT INTO hr_payroll_runs (gym_id, month, created_by) VALUES ($1,$2,$3) RETURNING id`,
        [gym_id, month, req.staff?.staff_user_id]
      );
      runId = ins.rows[0].id;
    }
    // قاعدة الالتقاط: النشطون وقت التوليد فقط (لا الموقوفين ولا المحذوفين)
    const staff = await client.query(
      `SELECT id, full_name, salary, housing_allowance, transport_allowance, other_allowance
       FROM staff_users WHERE gym_id = $1 AND is_active = true AND deleted_at IS NULL ORDER BY full_name`,
      [gym_id]
    );
    let total = 0;
    for (const s of staff.rows) {
      const adj = await client.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'bonus'), 0) AS bonus,
                COALESCE(SUM(amount) FILTER (WHERE kind = 'deduction'), 0) AS ded
         FROM hr_adjustments WHERE gym_id = $1 AND staff_user_id = $2 AND month = $3`,
        [gym_id, s.id, month]
      );
      const adv = await client.query(
        `SELECT COALESCE(SUM(LEAST(COALESCE(installment, amount - repaid), amount - repaid)), 0) AS inst
         FROM hr_adjustments
         WHERE gym_id = $1 AND staff_user_id = $2 AND kind = 'advance' AND (amount - repaid) > 0 AND month <= $3`,
        [gym_id, s.id, month]
      );
      const base = Number(s.salary ?? 0);
      const allow = Number(s.housing_allowance ?? 0) + Number(s.transport_allowance ?? 0) + Number(s.other_allowance ?? 0);
      const bonus = Number(adj.rows[0]?.bonus ?? 0);
      const ded = Number(adj.rows[0]?.ded ?? 0);
      const advDed = Number(adv.rows[0]?.inst ?? 0);
      const net = Math.max(0, Math.round((base + allow + bonus - ded - advDed) * 100) / 100);
      total += net;
      await client.query(
        `INSERT INTO hr_payroll_items (run_id, staff_user_id, staff_name, base, allowances, bonus, deductions, advance_deduction, net)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [runId, s.id, s.full_name, base, allow, bonus, ded, advDed, net]
      );
    }
    await client.query(`UPDATE hr_payroll_runs SET total_net = $1 WHERE id = $2`, [Math.round(total * 100) / 100, runId]);
    await client.query('COMMIT');
    res.status(201).json({ data: { id: runId, month, total_net: Math.round(total * 100) / 100 } });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    logger.error('generatePayroll failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
};

export const getPayroll = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const month = YYYY_MM.test(String(req.query.month ?? '')) ? String(req.query.month) : new Date().toISOString().slice(0, 7);
  try {
    const run = await query(`SELECT * FROM hr_payroll_runs WHERE gym_id = $1 AND month = $2`, [gym_id, month]);
    if (run.rows.length === 0) { res.json({ data: null, month }); return; }
    const items = await query(`SELECT * FROM hr_payroll_items WHERE run_id = $1 ORDER BY staff_name`, [run.rows[0].id]);
    const paid = await query(
      `SELECT COALESCE(SUM(net), 0) AS paid_sum, COUNT(*)::int AS paid_count FROM hr_payroll_items WHERE run_id = $1 AND status = 'paid'`,
      [run.rows[0].id]
    );
    res.json({
      data: {
        ...run.rows[0],
        total_net: Number(run.rows[0].total_net),
        items: items.rows.map((x) => ({ ...x, base: Number(x.base), allowances: Number(x.allowances), bonus: Number(x.bonus), deductions: Number(x.deductions), advance_deduction: Number(x.advance_deduction), net: Number(x.net) })),
        paid_sum: Number(paid.rows[0]?.paid_sum ?? 0),
        paid_count: Number(paid.rows[0]?.paid_count ?? 0),
      },
      month,
    });
  } catch (e: any) { logger.error('getPayroll failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const approvePayroll = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(
      `UPDATE hr_payroll_runs SET status = 'approved', approved_at = NOW()
       WHERE id = $1 AND gym_id = $2 AND status = 'draft'
       RETURNING id, month`,
      [id, gym_id]
    );
    if (r.rows.length === 0) { res.status(400).json({ error: 'Only drafts can be approved.' }); return; }
    await query(`UPDATE hr_payroll_items SET status = 'approved' WHERE run_id = $1`, [id]);
    res.json({ data: { id, status: 'approved' } });
  } catch (e: any) { logger.error('approvePayroll failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// الصرف: مسودة←معتمد←مصروف + حركة خزنة واحدة بإجمالي الصافي + تقسيط السلف
export const payPayroll = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const method = ['cash', 'card', 'bank'].includes(String(req.body?.payment_method || '')) ? String(req.body.payment_method) : 'cash';
  const client = await getClient();
  try {
    const run = await client.query(`SELECT * FROM hr_payroll_runs WHERE id = $1 AND gym_id = $2`, [id, gym_id]);
    if (run.rows.length === 0 || run.rows[0].status !== 'approved') {
      res.status(400).json({ error: 'Only approved runs can be paid.' });
      return;
    }
    await client.query('BEGIN');
    await client.query(`UPDATE hr_payroll_runs SET status = 'paid', paid_at = NOW() WHERE id = $1`, [id]);
    await client.query(`UPDATE hr_payroll_items SET status = 'paid' WHERE run_id = $1`, [id]);
    // تقسيط السلف المخصومة يُرحَّل للمسدد — الأقدم أولًا لكل موظف
    const debtors = await client.query(
      `SELECT staff_user_id, advance_deduction FROM hr_payroll_items
       WHERE run_id = $1 AND advance_deduction > 0 AND staff_user_id IS NOT NULL`,
      [id]
    );
    for (const d of debtors.rows) {
      let left = Number(d.advance_deduction);
      const open = await client.query(
        `SELECT id, amount, repaid FROM hr_adjustments
         WHERE gym_id = $1 AND staff_user_id = $2 AND kind = 'advance' AND (amount - repaid) > 0
         ORDER BY created_at ASC`,
        [gym_id, d.staff_user_id]
      );
      for (const a of open.rows) {
        if (left <= 0) break;
        const due = Number(a.amount) - Number(a.repaid);
        const take = Math.min(left, due);
        await client.query(`UPDATE hr_adjustments SET repaid = repaid + $1 WHERE id = $2`, [take, a.id]);
        left = Math.round((left - take) * 100) / 100;
      }
    }
    const total = Number(run.rows[0].total_net);
    if (total > 0) {
      await client.query(
        `INSERT INTO financial_transactions (gym_id, type, amount, description, staff_user_id, payment_method, cash_session_id)
         VALUES ($1,'expense',$2,$3,$4,$5,
           (SELECT id FROM cashbox_sessions WHERE gym_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1))`,
        [gym_id, total, `رواتب شهر ${run.rows[0].month}`, req.staff?.staff_user_id, method]
      );
    }
    await client.query('COMMIT');
    res.json({ data: { id, status: 'paid', total } });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    logger.error('payPayroll failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
};

export const deletePayrollRun = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`DELETE FROM hr_payroll_runs WHERE id = $1 AND gym_id = $2 AND status = 'draft' RETURNING id`, [id, gym_id]);
    if (r.rows.length === 0) { res.status(400).json({ error: 'Only drafts can be deleted.' }); return; }
    res.json({ data: { id, deleted: true } });
  } catch (e: any) { logger.error('deletePayrollRun failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === CONTRACTS (أرقام CON- متسلسلة لا تُعاد — الفجوات audit trail) ===
export const listContracts = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const q = String(req.query.q ?? '').trim();
  const status = String(req.query.status ?? '');
  const expiring = String(req.query.expiring ?? '') === '1';
  try {
    const r = await query(
      `SELECT c.*, su.full_name AS staff_name, su.employee_code
       FROM hr_contracts c
       LEFT JOIN staff_users su ON su.id = c.staff_user_id
       WHERE c.gym_id = $1
         ${['active', 'expired'].includes(status) ? 'AND c.status = $2' : ''}
         ${expiring ? `AND c.status = 'active' AND c.end_date IS NOT NULL AND c.end_date <= CURRENT_DATE + interval '30 days'` : ''}
         ${q ? `AND (su.full_name ILIKE $${['active', 'expired'].includes(status) ? 3 : 2} OR su.employee_code ILIKE $${['active', 'expired'].includes(status) ? 3 : 2} OR c.contract_no ILIKE $${['active', 'expired'].includes(status) ? 3 : 2})` : ''}
       ORDER BY c.created_at DESC LIMIT 200`,
      [gym_id, ...(['active', 'expired'].includes(status) ? [status] : []), ...(q ? [`%${q}%`] : [])]
    );
    res.json({ data: r.rows.map((x) => ({ ...x, salary: Number(x.salary) })) });
  } catch (e: any) { logger.error('listContracts failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createContract = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const { staff_user_id, contract_type, start_date, end_date, salary, notes } = req.body;
  try {
    const s = await query(`SELECT id FROM staff_users WHERE id = $1 AND gym_id = $2 AND is_active = true`, [staff_user_id, gym_id]);
    if (s.rows.length === 0) { res.status(400).json({ error: 'Staff not found or inactive.' }); return; }
    if (end_date && end_date <= start_date) { res.status(400).json({ error: 'End date must be after start date.' }); return; }
    const seq = await query(
      `SELECT COALESCE(MAX(CASE WHEN contract_no ~ '^CON-[0-9]+$' THEN SUBSTRING(contract_no FROM 5)::int END), 0) + 1 AS n
       FROM hr_contracts WHERE gym_id = $1`,
      [gym_id]
    );
    const no = `CON-${String(seq.rows[0].n).padStart(4, '0')}`;
    const r = await query(
      `INSERT INTO hr_contracts (gym_id, staff_user_id, contract_no, contract_type, start_date, end_date, salary, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [gym_id, staff_user_id, no, contract_type || 'دائم', start_date, end_date || null, salary, (notes || '').trim() || null, req.staff?.staff_user_id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createContract failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const deleteContract = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`DELETE FROM hr_contracts WHERE id = $1 AND gym_id = $2 RETURNING id`, [id, gym_id]);
    if (r.rows.length === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json({ data: { id, deleted: true } });
  } catch (e: any) { logger.error('deleteContract failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === DAILY REGISTER (تحضير يومي radio) ===
export const getHrAttendance = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const raw = String(req.query.date ?? '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().split('T')[0];
  try {
    const r = await query(
      `SELECT su.id AS staff_id, su.full_name, su.employee_code, su.job_title, su.department,
              su.shift_start, su.late_allowance_min,
              ha.status AS saved_status, ha.note AS saved_note,
              (SELECT ss.clock_in FROM staff_shifts ss
                WHERE ss.staff_user_id = su.id AND ss.gym_id = su.gym_id AND ss.clock_in::date = $2::date
                ORDER BY ss.clock_in ASC LIMIT 1) AS clock_in,
              (SELECT ss.clock_out FROM staff_shifts ss
                WHERE ss.staff_user_id = su.id AND ss.gym_id = su.gym_id AND ss.clock_in::date = $2::date
                ORDER BY ss.clock_in DESC LIMIT 1) AS clock_out
       FROM staff_users su
       LEFT JOIN hr_attendance ha ON ha.staff_user_id = su.id AND ha.gym_id = su.gym_id AND ha.work_date = $2::date
       WHERE su.gym_id = $1 AND su.is_active = true AND su.deleted_at IS NULL
       ORDER BY su.full_name`,
      [gym_id, date]
    );
    const stats = await query(
      `WITH base AS (
         SELECT su.id,
                ha.status AS saved,
                EXISTS (SELECT 1 FROM staff_shifts ss
                  WHERE ss.staff_user_id = su.id AND ss.gym_id = su.gym_id AND ss.clock_in::date = $2::date) AS clocked
         FROM staff_users su
         LEFT JOIN hr_attendance ha ON ha.staff_user_id = su.id AND ha.gym_id = su.gym_id AND ha.work_date = $2::date
         WHERE su.gym_id = $1 AND su.is_active = true AND su.deleted_at IS NULL
       )
       SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE saved IN ('present','late') OR (saved IS NULL AND clocked))::int AS present,
              COUNT(*) FILTER (WHERE saved = 'late')::int AS late,
              COUNT(*) FILTER (WHERE NOT (saved IN ('present','late') OR (saved IS NULL AND clocked)) AND COALESCE(saved, 'absent') NOT IN ('leave','sick'))::int AS absent
       FROM base`,
      [gym_id, date]
    );
    res.json({
      data: r.rows.map((x) => {
        // اقتراح تلقائي: حاضر إن بصم، متأخر إن تجاوز الشيفت+السماح، وإلا يُترك للمحضّر
        let suggested: string | null = null;
        if (x.clock_in) {
          suggested = 'present';
          if (x.shift_start) {
            const [sh, sm] = String(x.shift_start).split(':').map(Number);
            const ci = new Date(x.clock_in);
            const startMin = sh * 60 + sm + Number(x.late_allowance_min ?? 0);
            if (ci.getHours() * 60 + ci.getMinutes() > startMin) suggested = 'late';
          }
        }
        return { ...x, suggested };
      }),
      stats: {
        total: Number(stats.rows[0]?.total ?? 0),
        present: Number(stats.rows[0]?.present ?? 0),
        late: Number(stats.rows[0]?.late ?? 0),
        absent: Number(stats.rows[0]?.absent ?? 0),
      },
      date,
    });
  } catch (e: any) { logger.error('getHrAttendance failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const saveHrAttendance = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const { date, rows } = req.body as { date: string; rows: { staff_user_id: string; status: string; note?: string }[] };
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(
        `INSERT INTO hr_attendance (gym_id, staff_user_id, work_date, status, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (gym_id, staff_user_id, work_date)
         DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, created_by = EXCLUDED.created_by`,
        [gym_id, row.staff_user_id, date, row.status, (row.note || '').trim() || null, req.staff?.staff_user_id]
      );
    }
    await client.query('COMMIT');
    res.json({ data: { date, saved: rows.length } });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    logger.error('saveHrAttendance failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
};

// === SELF CHECK-IN (حضور ذاتي بالـPIN على جهاز الاستقبال) ===
// الجلسة مسجلة دخول (مدير/استقبال) + PIN الموظف — فصل صلاحية تسجيل
// الحضور عن صلاحية الدخول للنظام.
export const selfCheckin = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const { staff_id, pin } = req.body;
  try {
    const s = await query(
      `SELECT id, full_name, is_active, pin_hash FROM staff_users WHERE id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
      [staff_id, gym_id]
    );
    if (s.rows.length === 0 || !s.rows[0].is_active) { res.status(404).json({ error: 'Staff not found.' }); return; }
    if (!s.rows[0].pin_hash) { res.status(400).json({ error: 'No PIN set for this staff member.' }); return; }
    const ok = await bcrypt.compare(String(pin), s.rows[0].pin_hash);
    if (!ok) { res.status(401).json({ error: 'Invalid PIN.' }); return; }
    const open = await query(`SELECT id FROM staff_shifts WHERE staff_user_id = $1 AND gym_id = $2 AND clock_out IS NULL`, [staff_id, gym_id]);
    if (open.rows.length > 0) { res.status(400).json({ error: 'Already clocked in.' }); return; }
    const r = await query(`INSERT INTO staff_shifts (gym_id, staff_user_id) VALUES ($1,$2) RETURNING *`, [gym_id, staff_id]);
    await query(`INSERT INTO activity_logs (gym_id, staff_user_id, action_description) VALUES ($1,$2,$3)`,
      [gym_id, req.staff?.staff_user_id, `Self check-in: ${s.rows[0].full_name}`]).catch(() => undefined);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('selfCheckin failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};
