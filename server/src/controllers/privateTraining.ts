import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import logger from '../config/logger';

// Private training enrollments (البرايفت) — منتج مستقل: عضو + مدرب +
// رصيد حصص + فلوس. لا باقة ولا اشتراك. الحالة مشتقة لا مخزنة فقط:
// ملغي ⇒ status؛ مكتمل ⇒ used>=total أو انتهى الأجل أو completed؛
// غير ذلك نشط. ديونه kind='pt' (من نص السبب، عرف الديون المشتقة).

const DERIVED_STATUS = `CASE
  WHEN e.status = 'cancelled' THEN 'cancelled'
  WHEN e.status = 'completed' OR e.sessions_used >= e.total_sessions OR e.end_date < CURRENT_DATE THEN 'completed'
  ELSE 'active' END`;

export const listPtEnrollments = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const tab = String(req.query.status ?? 'active');
  const status = ['active', 'completed', 'cancelled', 'all'].includes(tab) ? tab : 'active';
  try {
    const rows = await query(
      `SELECT e.*, m.full_name AS member_name,
              decrypt_sensitive(m.phone_encrypted) AS member_phone,
              su.full_name AS coach_name,
              ${DERIVED_STATUS} AS derived_status
       FROM pt_enrollments e
       LEFT JOIN members m ON m.id = e.member_id
       LEFT JOIN staff_users su ON su.id = e.coach_id
       WHERE e.gym_id = $1
         ${status === 'all' ? '' : `AND ${DERIVED_STATUS} = $2`}
       ORDER BY e.created_at DESC
       LIMIT 200`,
      status === 'all' ? [gym_id] : [gym_id, status]
    );
    const stats = await query(
      `SELECT
         (COUNT(*) FILTER (WHERE ${DERIVED_STATUS} = 'active'))::int AS active_count,
         COALESCE(SUM(e.paid_amount) FILTER (WHERE e.status <> 'cancelled'), 0) AS total_paid,
         COALESCE(SUM(e.remaining) FILTER (WHERE ${DERIVED_STATUS} = 'active'), 0) AS total_debt,
         (COALESCE(SUM(e.total_sessions) FILTER (WHERE e.status <> 'cancelled'), 0))::int AS total_sessions
       FROM pt_enrollments e
       WHERE e.gym_id = $1`,
      [gym_id]
    );
    res.json({
      data: rows.rows.map((r) => ({
        ...r,
        total_amount: Number(r.total_amount), paid_amount: Number(r.paid_amount),
        remaining: Number(r.remaining), session_price: Number(r.session_price),
      })),
      stats: {
        active_count: Number(stats.rows[0]?.active_count ?? 0),
        total_paid: Number(stats.rows[0]?.total_paid ?? 0),
        total_debt: Number(stats.rows[0]?.total_debt ?? 0),
        total_sessions: Number(stats.rows[0]?.total_sessions ?? 0),
      },
      status,
    });
  } catch (e: any) {
    logger.error('listPtEnrollments failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

export const createPtEnrollment = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  const {
    member_id, coach_id, total_sessions, session_price,
    start_date, end_date, amount_paid, payment_method, notes,
  } = req.body;

  const count = Number(total_sessions);
  const unit = Number(session_price);
  if (!Number.isInteger(count) || count < 1) { res.status(400).json({ error: 'Session count must be at least 1.' }); return; }
  if (!Number.isFinite(unit) || unit < 0) { res.status(400).json({ error: 'Invalid session price.' }); return; }
  const total = Math.round(count * unit * 100) / 100;
  const paid = Number(amount_paid || 0);
  if (!Number.isFinite(paid) || paid < 0 || paid > total) {
    res.status(400).json({ error: 'Paid must be between 0 and the total.' });
    return;
  }

  const client = await getClient();
  try {
    const m = await client.query(
      `SELECT id, full_name FROM members WHERE id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
      [member_id, gym_id]);
    if (m.rows.length === 0) { res.status(400).json({ error: 'Member not found in this gym.' }); return; }
    const c = await client.query(
      `SELECT full_name FROM staff_users WHERE id = $1 AND gym_id = $2 AND role = 'coach' AND is_active = true`,
      [coach_id, gym_id]);
    if (c.rows.length === 0) { res.status(400).json({ error: 'Coach not found in this gym.' }); return; }

    const start = (start_date || new Date().toISOString().split('T')[0]) as string;
    let finalEnd = end_date as string | undefined;
    if (!finalEnd) {
      const d = new Date(`${start}T00:00:00`);
      d.setDate(d.getDate() + 30);
      finalEnd = d.toISOString().split('T')[0];
    }
    if (finalEnd <= start) { res.status(400).json({ error: 'End date must be after the start date.' }); return; }

    const remaining = Math.round((total - paid) * 100) / 100;
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO pt_enrollments
        (gym_id, member_id, coach_id, total_sessions, session_price, total_amount, paid_amount, remaining,
         start_date, end_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [gym_id, member_id, coach_id, count, unit, total, paid, remaining, start, finalEnd,
        (notes || '').trim() || null, staff_user_id || null]
    );
    if (paid > 0) {
      await client.query(
        `INSERT INTO financial_transactions (gym_id, type, amount, description, staff_user_id, member_id, payment_method, cash_session_id)
         VALUES ($1,'payment',$2,$3,$4,$5,$6,
           (SELECT id FROM cashbox_sessions WHERE gym_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1))`,
        [gym_id, paid, `برايفت ${count} حصص — ${m.rows[0].full_name} (مدرب ${c.rows[0].full_name})`,
          staff_user_id || null, member_id, payment_method || 'cash']
      );
    }
    if (remaining > 0) {
      await client.query(
        `INSERT INTO member_debts (gym_id, member_id, subscription_id, original_amount, remaining_amount, due_date, reason)
         VALUES ($1,$2,NULL,$3,$3,$4,$5)`,
        [gym_id, member_id, remaining, finalEnd, `متبقي برايفت ${count} حصص — ${m.rows[0].full_name}`]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ data: { id: ins.rows[0].id, total, paid, remaining } });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    logger.error('createPtEnrollment failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
};

// استهلاك حصة: +1 بحد الكلي، واكتمال تلقائي عند النفاد
export const consumePtSession = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(
      `UPDATE pt_enrollments
       SET sessions_used = LEAST(sessions_used + 1, total_sessions),
           status = CASE WHEN sessions_used + 1 >= total_sessions THEN 'completed' ELSE status END
       WHERE id = $1 AND gym_id = $2 AND status = 'active'
         AND sessions_used < total_sessions
       RETURNING id, sessions_used, total_sessions, status`,
      [id, gym_id]
    );
    if (r.rows.length === 0) {
      res.status(400).json({ error: 'No consumable sessions — finished or cancelled.' });
      return;
    }
    res.json({ data: r.rows[0] });
  } catch (e: any) {
    logger.error('consumePtSession failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

export const cancelPtEnrollment = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(
      `UPDATE pt_enrollments SET status = 'cancelled'
       WHERE id = $1 AND gym_id = $2 AND status = 'active' RETURNING id`,
      [id, gym_id]
    );
    if (r.rows.length === 0) { res.status(400).json({ error: 'Only active enrollments can be cancelled.' }); return; }
    res.json({ data: { id, cancelled: true } });
  } catch (e: any) {
    logger.error('cancelPtEnrollment failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

// تقارير البرايفت: شهور الستة الأخيرة (تسجيلات/محصّل/مستحق)
export const ptReport = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
              COUNT(*)::int AS enrollments,
              COALESCE(SUM(paid_amount), 0) AS collected,
              COALESCE(SUM(remaining) FILTER (WHERE status = 'active'), 0) AS outstanding
       FROM pt_enrollments
       WHERE gym_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE) - interval '5 months'
       GROUP BY 1 ORDER BY 1 DESC`,
      [gym_id]
    );
    res.json({
      data: r.rows.map((x) => ({
        ...x,
        collected: Number(x.collected), outstanding: Number(x.outstanding),
      })),
    });
  } catch (e: any) {
    logger.error('ptReport failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};
