import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import logger from '../config/logger';

// Quick sessions (الحصة السريعة) — standalone SKU at a fixed price for
// visitors: NEVER a membership_offers row, NEVER a subscription.
// Same paid/remaining equation as debts on a single session; attendance
// bundled by inserting attendance_logs directly (session purchase IS the
// day's entitlement — no subscription required for entry here).

const PAY_METHODS = ['cash', 'card', 'vodafone_cash', 'instapay', 'bank'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function defaultPrice(gym_id: string | undefined): Promise<number> {
  try {
    const r = await query(
      `SELECT setting_value FROM gym_settings WHERE gym_id = $1 AND setting_key = 'quick_session_price'`,
      [gym_id]
    );
    const v = Number(r.rows[0]?.setting_value);
    if (Number.isFinite(v) && v >= 0) return v;
  } catch { /* fall through to default */ }
  return 50;
}

export const listQuickSessions = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const raw = String(req.query.date ?? '').trim();
  const date = ISO_DATE.test(raw) ? raw : new Date().toISOString().split('T')[0];
  try {
    const rows = await query(
      `SELECT q.id, q.client_name, q.session_name, q.price, q.paid, q.remaining,
              q.payment_method, q.session_time, q.attendance_logged, q.created_at,
              m.full_name AS member_name, su.full_name AS coach_name
       FROM quick_sessions q
       LEFT JOIN members m ON m.id = q.member_id
       LEFT JOIN staff_users su ON su.id = q.coach_id
       WHERE q.gym_id = $1 AND q.session_time::date = $2::date
       ORDER BY q.session_time DESC
       LIMIT 200`,
      [gym_id, date]
    );
    const stats = await query(
      `SELECT
         COALESCE(SUM(paid) FILTER (WHERE session_time::date = $2::date), 0) AS today_collected,
         COALESCE(SUM(remaining) FILTER (WHERE session_time::date = $2::date), 0) AS today_remaining,
         COALESCE(SUM(paid) FILTER (WHERE date_trunc('month', session_time) = date_trunc('month', $2::date)), 0) AS month_collected
       FROM quick_sessions WHERE gym_id = $1`,
      [gym_id, date]
    );
    res.json({
      data: rows.rows.map((r) => ({
        ...r,
        price: Number(r.price), paid: Number(r.paid), remaining: Number(r.remaining),
      })),
      stats: {
        today_collected: Number(stats.rows[0]?.today_collected ?? 0),
        today_remaining: Number(stats.rows[0]?.today_remaining ?? 0),
        month_collected: Number(stats.rows[0]?.month_collected ?? 0),
      },
      date,
      default_price: await defaultPrice(gym_id),
    });
  } catch (e: any) {
    logger.error('listQuickSessions failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

export const createQuickSession = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  const {
    member_id, client_name, session_name,
    price, paid, payment_method, coach_id, session_time, with_attendance,
  } = req.body;

  const priceNum = Number(price);
  const paidNum = Number(paid ?? priceNum);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    res.status(400).json({ error: 'Invalid price.' });
    return;
  }
  if (!Number.isFinite(paidNum) || paidNum < 0 || paidNum > priceNum) {
    res.status(400).json({ error: 'Paid must be between 0 and the price.' });
    return;
  }
  if (payment_method && !PAY_METHODS.includes(payment_method)) {
    res.status(400).json({ error: 'Invalid payment method.' });
    return;
  }

  const client = await getClient();
  try {
    let member: { id: string; full_name: string; is_blacklisted: boolean } | null = null;
    const name = (client_name || '').trim();
    if (member_id) {
      const m = await client.query(
        `SELECT id, full_name, is_blacklisted FROM members WHERE id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
        [member_id, gym_id]
      );
      if (m.rows.length === 0) {
        res.status(400).json({ error: 'Member not found in this gym.' });
        return;
      }
      member = m.rows[0];
    } else if (name.length < 2) {
      res.status(400).json({ error: 'Client name is required for walk-in sessions.' });
      return;
    }

    const remaining = Math.round((priceNum - paidNum) * 100) / 100;
    if (!member && remaining > 0) {
      // member_debts.member_id is NOT NULL — walk-ins settle in full
      res.status(400).json({ error: 'Walk-in sessions must be paid in full (no member to carry the remainder).' });
      return;
    }

    let coachName: string | null = null;
    if (coach_id) {
      const c = await client.query(
        `SELECT full_name FROM staff_users WHERE id = $1 AND gym_id = $2 AND role = 'coach' AND is_active = true`,
        [coach_id, gym_id]
      );
      if (c.rows.length === 0) {
        res.status(400).json({ error: 'Coach not found in this gym.' });
        return;
      }
      coachName = c.rows[0].full_name;
    }

    const finalName = (session_name || '').trim() || 'حصة';
    const finalClient = member ? member.full_name : name;
    const when = session_time ? new Date(session_time) : new Date();
    if (Number.isNaN(when.getTime())) {
      res.status(400).json({ error: 'Invalid session time.' });
      return;
    }

    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO quick_sessions
        (gym_id, member_id, client_name, session_name, price, paid, remaining, payment_method, coach_id, session_time, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, session_time, created_at`,
      [gym_id, member ? member.id : null, finalClient, finalName, priceNum, paidNum, remaining,
        payment_method || 'cash', coach_id || null, when.toISOString(), staff_user_id || null]
    );
    const session = ins.rows[0];

    if (paidNum > 0) {
      await client.query(
        `INSERT INTO financial_transactions (gym_id, type, amount, description, staff_user_id, member_id, payment_method, cash_session_id)
         VALUES ($1,'payment',$2,$3,$4,$5,$6,
           (SELECT id FROM cashbox_sessions WHERE gym_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1))`,
        [gym_id, paidNum, `حصة سريعة «${finalName}» — ${finalClient}`, staff_user_id || null,
          member ? member.id : null, payment_method || 'cash']
      );
    }
    if (remaining > 0 && member) {
      await client.query(
        `INSERT INTO member_debts (gym_id, member_id, subscription_id, original_amount, remaining_amount, due_date, reason)
         VALUES ($1,$2,NULL,$3,$3,$4,$5)`,
        [gym_id, member.id, remaining, when.toISOString().split('T')[0], `متبقي حصة سريعة «${finalName}» — ${finalClient}`]
      );
    }

    let attendanceLogged = false;
    if (with_attendance) {
      if (!member) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Attendance requires a registered member.' });
        return;
      }
      if (member.is_blacklisted) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'Access Denied. Profile is blacklisted.' });
        return;
      }
      const dup = await client.query(
        `SELECT id FROM attendance_logs
         WHERE member_id = $1 AND gym_id = $2 AND check_in_time::date = CURRENT_DATE AND deleted_at IS NULL`,
        [member.id, gym_id]
      );
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Member has already checked in today.' });
        return;
      }
      await client.query(
        `INSERT INTO attendance_logs (gym_id, member_id, entry_method, verified_by_staff_id)
         VALUES ($1, $2, 'quick_session', $3)`,
        [gym_id, member.id, staff_user_id || null]
      );
      await client.query(`UPDATE quick_sessions SET attendance_logged = true WHERE id = $1`, [session.id]);
      attendanceLogged = true;
    }

    await client.query('COMMIT');
    res.status(201).json({
      data: {
        id: session.id,
        client_name: finalClient,
        session_name: finalName,
        price: priceNum,
        paid: paidNum,
        remaining,
        coach_name: coachName,
        attendance_logged: attendanceLogged,
      },
    });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    logger.error('createQuickSession failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
};
