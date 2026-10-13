import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import logger from '../config/logger';

// ====================================================================
// §34ي — صفحة الاشتراكات: قائمة حقيقية على member_subscriptions مع
// فلاتر (الحالة/الرياضة/مدة الباقة/بحث) وإحصائيات محسوبة من نفس الصفوف،
// وإنشاء اشتراك يولّد دفعة + دينًا عند الدفع الجزئي/الآجل.
// ====================================================================

const PAGE_LIMITS = [50, 100, 300];

interface FilterBits {
  clauses: string[];
  params: unknown[];
}

// Shared WHERE builder for the member-subscriptions ledger (list + stats
// must count the SAME rows the table can show — one source of truth).
function buildFilters(gym_id: string, req: Request): FilterBits {
  const params: unknown[] = [gym_id];
  const clauses: string[] = ['s.gym_id = $1', 's.deleted_at IS NULL'];
  const push = (v: unknown) => { params.push(v); return `$${params.length}`; };

  const status = (req.query.status as string) || 'all';
  if (status === 'active') {
    clauses.push(`s.status = 'active' AND s.end_date >= CURRENT_DATE`);
  } else if (status === 'ending_soon') {
    clauses.push(`s.status = 'active' AND s.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`);
  } else if (status === 'expired') {
    clauses.push(`(s.status = 'expired' OR (s.status = 'active' AND s.end_date < CURRENT_DATE))`);
  } else if (status === 'unpaid') {
    clauses.push(`s.price_paid < o.price`);
  }

  const sport = req.query.sport as string;
  if (sport) clauses.push(`s.sport = ${push(sport)}`);

  const duration = req.query.duration as string;
  if (duration && ['30', '90', '180'].includes(duration)) {
    clauses.push(`o.duration_days = ${push(Number(duration))}`);
  }

  const member_id = req.query.member_id as string;
  if (member_id) {
    const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(member_id);
    if (ok) clauses.push(`s.member_id = ${push(member_id)}`);
  }

  const search = (req.query.search as string || '').trim();
  if (search) {
    const p1 = push(`%${search}%`);
    const p2 = push(search);
    const p3 = push(search);
    clauses.push(`(m.full_name ILIKE ${p1} OR m.phone_hash = phone_hash(${p2}) OR LEFT(m.id::text, 8) ILIKE ${p3} OR m.card_code = ${p3})`);
  }

  return { clauses, params };
}

// GET /api/subscriptions — manager ledger with stats + pagination.
export const listSubscriptions = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  try {
    const { clauses, params } = buildFilters(gym_id as string, req);
    const where = clauses.join(' AND ');

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const rawLimit = parseInt(req.query.limit as string, 10) || 50;
    const limit = PAGE_LIMITS.includes(rawLimit) ? rawLimit : 50;

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM member_subscriptions s
       JOIN members m ON m.id = s.member_id
       JOIN membership_offers o ON o.id = s.offer_id
       WHERE ${where}`, params);
    const total = countResult.rows[0].total as number;

    const data = await query(
      `SELECT s.id, s.status, s.start_date, s.end_date, s.sport, s.weekly_days, s.price_paid,
              s.coach_id, s.member_id, s.offer_id,
              m.full_name AS member_name,
              decrypt_sensitive(m.phone_encrypted) AS member_phone,
              o.title AS offer_title, o.duration_days, o.price AS offer_price,
              c.full_name AS coach_name,
              (s.end_date - CURRENT_DATE)::int AS remaining_days,
              CASE WHEN s.price_paid >= o.price THEN 'paid' ELSE 'unpaid' END AS payment_state,
              GREATEST(o.price - s.price_paid, 0)::numeric AS outstanding_amount
       FROM member_subscriptions s
       JOIN members m ON m.id = s.member_id
       JOIN membership_offers o ON o.id = s.offer_id
       LEFT JOIN staff_users c ON c.id = s.coach_id
       WHERE ${where}
       ORDER BY s.start_date DESC
       LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params);

    // Stats computed over the SAME tenant's rows (no filters) — the four
    // header cards are gym-wide truths, not page slices.
    const statsResult = await query(
      `SELECT
         COUNT(*) FILTER (WHERE s.status='active' AND s.end_date >= CURRENT_DATE)::int AS active,
         COUNT(*) FILTER (WHERE s.status='active' AND s.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS ending_soon,
         COUNT(*) FILTER (WHERE s.status != 'cancelled' AND s.deleted_at IS NULL AND s.price_paid < o.price)::int AS unpaid
       FROM member_subscriptions s
       JOIN membership_offers o ON o.id = s.offer_id
       WHERE s.gym_id = $1 AND s.deleted_at IS NULL`, [gym_id]);
    const duesResult = await query(
      `SELECT COALESCE(SUM(remaining_amount), 0) AS dues
       FROM member_debts WHERE gym_id = $1 AND status = 'active'`, [gym_id]);

    res.status(200).json({
      data: data.rows,
      pagination: {
        page, limit, total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
      stats: {
        active: statsResult.rows[0].active,
        ending_soon: statsResult.rows[0].ending_soon,
        unpaid: statsResult.rows[0].unpaid,
        dues: duesResult.rows[0].dues,
      },
    });
  } catch (e: any) {
    logger.error('listSubscriptions failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

// POST /api/subscriptions — enroll a member into an offer.
// Money rules (all server-side, never trusted from the client):
//  - amount_paid must be 0..offer.price
//  - amount_paid > 0  -> financial_transactions payment row
//  - offer.price - amount_paid > 0 -> member_debts row linked to the sub
export const createSubscription = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  const {
    member_id, offer_id, coach_id, sport,
    start_date, end_date, weekly_days, amount_paid, payment_method,
  } = req.body;

  const client = await getClient();
  try {
    const memberRes = await query(
      `SELECT id, full_name FROM members WHERE id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
      [member_id, gym_id]);
    if (memberRes.rows.length === 0) {
      res.status(400).json({ error: 'Member not found in this gym' });
      return;
    }
    const member = memberRes.rows[0];

    const offerRes = await query(
      `SELECT id, title, duration_days, price FROM membership_offers
       WHERE id = $1 AND gym_id = $2 AND is_active = true`, [offer_id, gym_id]);
    if (offerRes.rows.length === 0) {
      res.status(400).json({ error: 'Selected plan not found or is inactive.' });
      return;
    }
    const offer = offerRes.rows[0];

    if (coach_id) {
      const coachRes = await query(
        `SELECT id FROM staff_users WHERE id = $1 AND gym_id = $2 AND role = 'coach' AND is_active = true`,
        [coach_id, gym_id]);
      if (coachRes.rows.length === 0) {
        res.status(400).json({ error: 'Coach not found in this gym' });
        return;
      }
    }

    const paid = Number(amount_paid);
    const price = Number(offer.price);
    if (!(paid >= 0) || paid > price) {
      res.status(400).json({ error: 'Paid amount must be between 0 and the plan price.' });
      return;
    }

    // End date derived from the plan unless the manager pinned one.
    const computedEnd = new Date(`${start_date}T00:00:00`);
    computedEnd.setDate(computedEnd.getDate() + Number(offer.duration_days));
    const finalEnd = end_date || computedEnd.toISOString().split('T')[0];
    if (finalEnd <= start_date) {
      res.status(400).json({ error: 'End date must be after the start date.' });
      return;
    }

    // Honest overlap guard: a member cannot hold two overlapping actives —
    // this is what enforces the "queue" behaviour the UI offers.
    const overlap = await query(
      `SELECT 1 FROM member_subscriptions
       WHERE member_id = $1 AND gym_id = $2 AND deleted_at IS NULL
         AND status = 'active' AND NOT (end_date < $3::date OR start_date > $4::date)
       LIMIT 1`, [member_id, gym_id, start_date, finalEnd]);
    if (overlap.rows.length > 0) {
      res.status(400).json({ error: 'Overlaps an active subscription for this member. Use the queue start option.' });
      return;
    }

    await client.query('BEGIN');
    const subRes = await client.query(
      `INSERT INTO member_subscriptions
         (gym_id, member_id, offer_id, price_paid, start_date, end_date, status, coach_id, sport, weekly_days)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9)
       RETURNING id, member_id, offer_id, price_paid, start_date, end_date, status, coach_id, sport, weekly_days`,
      [gym_id, member_id, offer_id, paid, start_date, finalEnd, coach_id || null, sport || null,
       weekly_days && weekly_days.length ? weekly_days : null]);
    const sub = subRes.rows[0];

    if (paid > 0) {
      await client.query(
        `INSERT INTO financial_transactions (gym_id, type, amount, description, staff_user_id, member_id, payment_method, cash_session_id)
         VALUES ($1,'payment',$2,$3,$4,$5,$6,
           (SELECT id FROM cashbox_sessions WHERE gym_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1))`,
        [gym_id, paid, `رسوم اشتراك «${offer.title}» — ${member.full_name}`, staff_user_id, member_id, payment_method || 'cash']);
    }
    const owed = Math.round((price - paid) * 100) / 100;
    if (owed > 0) {
      await client.query(
        `INSERT INTO member_debts (gym_id, member_id, subscription_id, original_amount, remaining_amount, due_date, reason)
         VALUES ($1,$2,$3,$4,$4,$5,$6)`,
        [gym_id, member_id, sub.id, owed, finalEnd, `رصيد باقة «${offer.title}» — ${member.full_name}`]);
    }
    await client.query('COMMIT');

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1,$2,$3,$4)`,
      [gym_id, staff_user_id,
       `Created subscription ${sub.id}: ${member.full_name} → ${offer.title} (${paid}/${price}, method ${payment_method || 'cash'})`, req.ip]);

    res.status(201).json({
      data: {
        ...sub,
        member_name: member.full_name,
        offer_title: offer.title,
        offer_price: offer.price,
        outstanding_amount: owed,
        payment_method: payment_method || 'cash',
      },
    });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    logger.error('createSubscription failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
};
