import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query, getClient } from '../config/database';
import logger from '../config/logger';
import { closeStaleSessions } from './attendance';

// ====================================================================
// §34ح — MEMBERS STATS CARDS (the five numbers above the members tab)
// One query, one truth: each figure uses exactly the same subscription
// derivation the list badge uses (latest member_subscriptions row), so a
// card and a row can never disagree.
// ====================================================================
export const getMemberStats = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;

  try {
    // Settle forgotten check-outs first — "present now" is read-time truth.
    await closeStaleSessions(gym_id);

    const tzResult = await query(
      `SELECT COALESCE(timezone, 'Africa/Cairo') AS tz FROM gyms WHERE id = $1`,
      [gym_id]
    );
    const tz = tzResult.rows[0]?.tz || 'Africa/Cairo';

    const result = await query(
      `SELECT
         COUNT(*)::int AS total_members,
         COUNT(*) FILTER (WHERE latest.status = 'active' AND m.is_blacklisted = false)::int AS active_members,
         COUNT(*) FILTER (WHERE latest.id IS NOT NULL AND latest.status <> 'cancelled')::int AS ever_subscribed,
         COUNT(*) FILTER (
           WHERE m.created_at >= ((date_trunc('month', ((CURRENT_TIMESTAMP AT TIME ZONE $2)::date)::timestamp)) AT TIME ZONE $2)
         )::int AS new_this_month,
         COUNT(*) FILTER (WHERE open_session.id IS NOT NULL)::int AS present_now
       FROM members m
       LEFT JOIN LATERAL (
         SELECT ms.id, ms.status FROM member_subscriptions ms
         WHERE ms.member_id = m.id AND ms.gym_id = m.gym_id
         ORDER BY ms.created_at DESC LIMIT 1
       ) latest ON true
       LEFT JOIN LATERAL (
         SELECT al.id FROM attendance_logs al
         WHERE al.member_id = m.id AND al.gym_id = m.gym_id
           AND al.deleted_at IS NULL AND al.check_out_time IS NULL
         LIMIT 1
       ) open_session ON true
       WHERE m.gym_id = $1 AND m.deleted_at IS NULL`,
      [gym_id, tz]
    );

    res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to load member stats', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const listMembers = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const role = req.staff?.role;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search as string;
  const status = req.query.status as string;

  // ترتيب من الهيدر — قائمة بيضاء صارمة. أسماء الأعمدة المحسوبة
  // (visit_count/last_checkin) تُقبل كأسماء مخرجات في ORDER BY،
  // وNULLS LAST حتى لا يقفز فاقدو البيانات للأعلى.
  const SORTS: Record<string, string> = {
    member_name: 'm.full_name',
    created_at: 'm.created_at',
    end_date: 's.end_date',
    remaining: 's.end_date',
    visits: 'visit_count',
    last_visit: 'last_checkin',
  };
  const rawSort = (req.query.sort as string) || 'created_at';
  const sortKey = Object.keys(SORTS).includes(rawSort) ? rawSort : 'created_at';
  const dir = (req.query.order as string) === 'asc' ? 'ASC' : 'DESC';

  try {
    let whereClause = 'WHERE m.gym_id = $1';
    const params: unknown[] = [gym_id];

    if (search) {
      whereClause += ' AND (m.full_name ILIKE $2 OR m.phone_number ILIKE $2 OR m.phone_hash = phone_hash($3) OR m.card_code = $3)';
      params.push(`%${search}%`, search);
    }

    // §34د-2 — real subscription-status filters (the UI dropdown used to send
    // `status` and the endpoint silently ignored it). Status is derived from
    // the member's latest subscription, same row the LATERAL join below reads,
    // so filter and displayed badge can never disagree.
    const latestSubStatus = `(SELECT ms.status FROM member_subscriptions ms
        WHERE ms.member_id = m.id AND ms.gym_id = m.gym_id
        ORDER BY ms.created_at DESC LIMIT 1)`;
    const ALLOWED_STATUS = ['active', 'expired', 'suspended', 'none', 'expiring7', 'blacklisted'] as const;
    if (status && (ALLOWED_STATUS as readonly string[]).includes(status)) {
      if (status === 'none') {
        whereClause += ` AND (${latestSubStatus} IS NULL OR ${latestSubStatus} = 'cancelled')`;
      } else if (status === 'expiring7') {
        whereClause += ` AND EXISTS (SELECT 1 FROM member_subscriptions ms2
          WHERE ms2.member_id = m.id AND ms2.gym_id = m.gym_id AND ms2.status = 'active'
            AND ms2.end_date >= CURRENT_DATE AND ms2.end_date <= CURRENT_DATE + INTERVAL '7 days')`;
      } else if (status === 'blacklisted') {
        whereClause += ' AND m.is_blacklisted = true';
      } else {
        whereClause += ` AND ${latestSubStatus} = $${params.length + 1}`;
        params.push(status);
      }
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM members m ${whereClause}`,
      params
    );

    const dataResult = await query(
      `SELECT m.id, m.gym_id, m.full_name, decrypt_sensitive(m.phone_encrypted) as phone_number,
              m.email, m.photo_url, m.is_blacklisted, m.blacklist_reason, m.gender,
              m.created_at, m.birth_date, decrypt_sensitive(m.notes_encrypted) AS medical_notes,
              s.status as subscription_status, s.end_date as subscription_end_date,
              s.start_date as subscription_start_date,
              o.title as plan_name,
              (SELECT check_in_time FROM attendance_logs
               WHERE member_id = m.id AND gym_id = m.gym_id
               ORDER BY check_in_time DESC LIMIT 1) as last_checkin,
              (SELECT COUNT(*) FROM attendance_logs
               WHERE member_id = m.id AND gym_id = m.gym_id
               AND check_in_time >= COALESCE(
                 (SELECT MIN(start_date) FROM member_subscriptions
                  WHERE member_id = m.id AND gym_id = m.gym_id AND status = 'active'),
                 m.created_at
               )) as visit_count,
              m.card_code AS code
       FROM members m
       LEFT JOIN LATERAL (
         SELECT status, end_date, start_date FROM member_subscriptions
         WHERE member_id = m.id AND gym_id = m.gym_id
         ORDER BY created_at DESC LIMIT 1
       ) s ON true
       LEFT JOIN membership_offers o ON o.id = (SELECT offer_id FROM member_subscriptions
         WHERE member_id = m.id AND gym_id = m.gym_id
         ORDER BY created_at DESC LIMIT 1)
       ${whereClause}
       ORDER BY ${SORTS[sortKey]} ${dir} NULLS LAST, m.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    // Hide phone_number from coaches (data exposure prevention)
    const rows = dataResult.rows.map((row: Record<string, unknown>) => {
      if (role === 'coach') {
        const { phone_number, ...rest } = row;
        return rest;
      }
      return row;
    });

    res.status(200).json({
      data: rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list members', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const getMemberById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;

  try {
    const result = await query(
      `SELECT m.id, m.gym_id, m.full_name, decrypt_sensitive(m.phone_encrypted) as phone_number,
              m.email, m.photo_url, m.is_blacklisted, m.blacklist_reason, m.gender,
              m.created_at, m.birth_date, m.card_code, decrypt_sensitive(m.notes_encrypted) AS medical_notes,
              json_agg(DISTINCT jsonb_build_object(
                'id', s.id, 'status', s.status, 'start_date', s.start_date,
                'end_date', s.end_date, 'is_frozen', s.is_frozen,
                'price_paid', s.price_paid, 'offer_title', o.title
              )) FILTER (WHERE s.id IS NOT NULL) as subscriptions,
              json_agg(DISTINCT jsonb_build_object(
                'id', al.id, 'check_in_time', al.check_in_time, 'entry_method', al.entry_method
              )) FILTER (WHERE al.id IS NOT NULL) as recent_attendance
       FROM members m
       LEFT JOIN member_subscriptions s ON s.member_id = m.id AND s.gym_id = m.gym_id
       LEFT JOIN membership_offers o ON s.offer_id = o.id
       LEFT JOIN attendance_logs al ON al.member_id = m.id AND al.gym_id = m.gym_id AND al.check_in_time >= CURRENT_DATE - INTERVAL '30 days'
       WHERE m.id = $1 AND m.gym_id = $2
       GROUP BY m.id, m.gym_id, m.full_name, m.phone_encrypted, m.email, m.photo_url,
                m.is_blacklisted, m.blacklist_reason, m.created_at, m.birth_date, m.card_code, m.notes_encrypted`,
      [id, gym_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Member not found.' });
      return;
    }

    res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to get member', { requestId: (req as any).requestId, memberId: id, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const createMember = async (req: Request, res: Response): Promise<void> => {
  const {
    full_name, phone_number, email, birth_date, plan_id, medical_notes, photo_url, gender,
    card_code, national_id, emergency_phone, address, notes, allowed_days, sales_rep_id,
    offer_id, coach_id, sport, start_date, discount, amount_paid, payment_method,
  } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Generate the member's self-login PIN here (nothing did this before —
    // memberLogin had no way to ever succeed). Returned once in the plain
    // response below since it can't be recovered after hashing; staff must
    // relay it to the member directly (e.g. printed on their welcome card).
    const generatedPin = String(Math.floor(1000 + Math.random() * 9000)); // 4 digits
    const pinHash = await bcrypt.hash(generatedPin, 12);

    // كود العضوية: مدخل يدوي أو التالي الرقمي تلقائيًا (100001…)
    let finalCode: string | null = (card_code || '').trim() || null;
    if (!finalCode) {
      const maxRes = await client.query(
        `SELECT COALESCE(MAX(CASE WHEN card_code ~ '^[0-9]+$' THEN card_code::bigint END), 100000) + 1 AS next_code
         FROM members WHERE gym_id = $1 AND deleted_at IS NULL`,
        [gym_id]
      );
      finalCode = String(maxRes.rows[0].next_code);
    }

    if (sales_rep_id) {
      const rep = await client.query(
        `SELECT id FROM staff_users WHERE id = $1 AND gym_id = $2 AND is_active = true AND deleted_at IS NULL`,
        [sales_rep_id, gym_id]
      );
      if (rep.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Sales rep not found or inactive in this gym.' });
        return;
      }
    }

    const cleanDays = Array.isArray(allowed_days)
      ? [...new Set(allowed_days.filter((d: unknown) => typeof d === 'string' && ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].includes(d)))]
      : null;

    const memberResult = await client.query(
      `INSERT INTO members (gym_id, full_name, phone_number, email, birth_date, medical_notes, photo_url, pin_code_hash, gender,
        card_code, national_id, emergency_phone, address, notes, allowed_days, sales_rep_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
      [gym_id, full_name, phone_number, email || null, birth_date || null, medical_notes || null,
        photo_url || null, pinHash, gender || null, finalCode,
        (national_id || '').trim() || null, (emergency_phone || '').trim() || null,
        (address || '').trim() || null, (notes || '').trim() || null,
        cleanDays && cleanDays.length ? cleanDays : null, sales_rep_id || null]
    );
    const member = memberResult.rows[0];

    // الاشتراك الأول الاختياري: نفس قواعد createSubscription المالية
    // (سعر − خصم = مستحق؛ مدفوع ⇒ سند دفع؛ الباقي ⇒ دين) في نفس الترانزاكشن
    const useOfferId = offer_id || plan_id || null;
    let subscription: Record<string, unknown> | null = null;
    if (useOfferId) {
      const offerRes = await client.query(
        `SELECT id, title, duration_days, price, weekly_days FROM membership_offers WHERE id = $1 AND gym_id = $2 AND is_active = true`,
        [useOfferId, gym_id]
      );
      if (offerRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Selected membership plan not found or is inactive.' });
        return;
      }
      const offer = offerRes.rows[0];
      if (coach_id) {
        const coachRes = await client.query(
          `SELECT id FROM staff_users WHERE id = $1 AND gym_id = $2 AND role = 'coach' AND is_active = true`,
          [coach_id, gym_id]);
        if (coachRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(400).json({ error: 'Coach not found in this gym' });
          return;
        }
      }
      if (sport) {
        const sportRes = await client.query(`SELECT 1 FROM gym_sports WHERE gym_id = $1 AND code = $2`, [gym_id, sport]);
        if (sportRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(400).json({ error: 'Unknown sport for this gym.' });
          return;
        }
      }
      const price = Number(offer.price);
      const disc = Math.max(0, Number(discount || 0));
      if (disc > price) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Discount cannot exceed the plan price.' });
        return;
      }
      const due = Math.round((price - disc) * 100) / 100;
      const paid = Number(amount_paid || 0);
      if (!(paid >= 0) || paid > due) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Paid amount must be between 0 and the amount due.' });
        return;
      }
      const start = (start_date || new Date().toISOString().split('T')[0]) as string;
      const end = new Date(`${start}T00:00:00`);
      end.setDate(end.getDate() + Number(offer.duration_days));
      const finalEnd = end.toISOString().split('T')[0];
      if (finalEnd <= start) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'End date must be after the start date.' });
        return;
      }
      const subRes = await client.query(
        `INSERT INTO member_subscriptions
          (gym_id, member_id, offer_id, price_paid, start_date, end_date, status, coach_id, sport, weekly_days)
         VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9)
         RETURNING id, start_date, end_date`,
        [gym_id, member.id, useOfferId, paid, start, finalEnd, coach_id || null, sport || null,
          offer.weekly_days?.length ? offer.weekly_days : null]
      );
      const sub = subRes.rows[0];
      if (paid > 0) {
        await client.query(
          `INSERT INTO financial_transactions (gym_id, type, amount, description, staff_user_id, member_id, payment_method, cash_session_id)
           VALUES ($1,'payment',$2,$3,$4,$5,$6,
             (SELECT id FROM cashbox_sessions WHERE gym_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1))`,
          [gym_id, paid, `رسوم اشتراك «${offer.title}» — ${full_name}`, staff_user_id, member.id, payment_method || 'cash']);
      }
      const owed = Math.round((due - paid) * 100) / 100;
      if (owed > 0) {
        await client.query(
          `INSERT INTO member_debts (gym_id, member_id, subscription_id, original_amount, remaining_amount, due_date, reason)
           VALUES ($1,$2,$3,$4,$4,$5,$6)`,
          [gym_id, member.id, sub.id, owed, finalEnd, `رصيد باقة «${offer.title}» — ${full_name}`]);
      }
      subscription = { id: sub.id, offer_title: offer.title, start_date: start, end_date: finalEnd, due, paid, outstanding: owed };
    }

    await client.query('COMMIT');

    const maskedPhone = phone_number ? phone_number.slice(-4).padStart(phone_number.length, '*') : 'N/A';
    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, staff_user_id, `Created new member: ${full_name} (${maskedPhone})${subscription ? ` with plan ${(subscription as { offer_title: string }).offer_title}` : ''}`, req.ip]
    );

    const memberData = {
      ...member,
      phone_number: phone_number || null,
      pin_code_hash: undefined,
      phone_encrypted: undefined,
      notes_encrypted: undefined,
      phone_hash: undefined,
    };
    res.status(201).json({
      success: true,
      data: memberData,
      generated_pin: generatedPin,
      subscription,
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    const pgError = error as { code?: string; message: string };
    if (pgError.code === '23505') {
      res.status(400).json({ error: 'A member with this phone number already exists in this gym (detected by unique phone hash).' });
    } else {
      logger.error('Failed to create member', { requestId: (req as any).requestId, error: pgError.message });
      res.status(500).json({ error: 'Internal server error.' });
    }
  } finally {
    client.release();
  }
};

/**
 * Cancel a member's subscription (proactive, staff-initiated cancellation —
 * distinct from a subscription naturally 'expired' running out its term).
 *
 * BUG FIX CONTEXT: prior to migration 015, the DB constraint didn't even
 * allow status='cancelled', and no endpoint anywhere ever set it — so the
 * "Cancellations" series on the Enrollment/Retention BI chart could only
 * ever show 0. This is the actual action that produces that data.
 */
export const cancelSubscription = async (req: Request, res: Response): Promise<void> => {
  const { subscriptionId } = req.params;
  const { reason } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;

  try {
    const result = await query(
      `UPDATE member_subscriptions
       SET status = 'cancelled'
       WHERE id = $1 AND gym_id = $2 AND status = 'active'
       RETURNING id, member_id, status, end_date`,
      [subscriptionId, gym_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Active subscription not found for this member.' });
      return;
    }

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, staff_user_id, `Cancelled subscription ${subscriptionId}${reason ? `: ${reason}` : ''}`, req.ip]
    );

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('cancelSubscription failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const blacklistMember = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { reason } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;

  if (!reason) {
    res.status(400).json({ error: 'Blacklist reason is required.' });
    return;
  }

  try {
    const result = await query(
      `UPDATE members SET is_blacklisted = true, blacklist_reason = $1
       WHERE id = $2 AND gym_id = $3 RETURNING id, full_name, is_blacklisted, blacklist_reason`,
      [reason, id, gym_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Member not found.' });
      return;
    }

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, staff_user_id, `Blacklisted member ${result.rows[0].full_name}: ${reason}`, req.ip]
    );

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to blacklist member', { requestId: (req as any).requestId, memberId: id, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const updateMember = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  const { full_name, phone_number, email, birth_date, medical_notes, photo_url, gender,
    card_code, national_id, emergency_phone, address, notes, allowed_days, sales_rep_id } = req.body;

  try {
    // Build dynamic SET clause
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (full_name !== undefined) { updates.push(`full_name = $${idx++}`); params.push(full_name); }
    if (phone_number !== undefined) { updates.push(`phone_number = $${idx++}`); params.push(phone_number); }
    if (email !== undefined) { updates.push(`email = $${idx++}`); params.push(email || null); }
    if (birth_date !== undefined) { updates.push(`birth_date = $${idx++}`); params.push(birth_date || null); }
    if (medical_notes !== undefined) { updates.push(`medical_notes = $${idx++}`); params.push(medical_notes || null); }
    if (photo_url !== undefined) { updates.push(`photo_url = $${idx++}`); params.push(photo_url || null); }
    if (gender !== undefined) { updates.push(`gender = $${idx++}`); params.push(gender || null); }
    if (card_code !== undefined) { updates.push(`card_code = $${idx++}`); params.push((card_code || '').trim() || null); }
    if (national_id !== undefined) { updates.push(`national_id = $${idx++}`); params.push((national_id || '').trim() || null); }
    if (emergency_phone !== undefined) { updates.push(`emergency_phone = $${idx++}`); params.push((emergency_phone || '').trim() || null); }
    if (address !== undefined) { updates.push(`address = $${idx++}`); params.push((address || '').trim() || null); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push((notes || '').trim() || null); }
    if (allowed_days !== undefined) {
      const clean = Array.isArray(allowed_days)
        ? [...new Set(allowed_days.filter((d: unknown) => typeof d === 'string' && ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].includes(d)))]
        : null;
      updates.push(`allowed_days = $${idx++}`); params.push(clean && clean.length ? clean : null);
    }
    if (sales_rep_id !== undefined) {
      if (sales_rep_id) {
        const rep = await query(`SELECT id FROM staff_users WHERE id = $1 AND gym_id = $2 AND is_active = true AND deleted_at IS NULL`, [sales_rep_id, gym_id]);
        if (rep.rows.length === 0) {
          res.status(400).json({ error: 'Sales rep not found or inactive in this gym.' });
          return;
        }
      }
      updates.push(`sales_rep_id = $${idx++}`); params.push(sales_rep_id || null);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update.' });
      return;
    }

    params.push(id, gym_id);
    const result = await query(
      `UPDATE members SET ${updates.join(', ')}
       WHERE id = $${idx++} AND gym_id = $${idx}
       RETURNING id, full_name, email, birth_date, medical_notes, photo_url, is_blacklisted`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Member not found.' });
      return;
    }

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, staff_user_id, `Updated member: ${result.rows[0].full_name}`, req.ip]
    );

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to update member', { requestId: (req as any).requestId, memberId: id, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// POST /api/members/:id/pin-reset — توليد رمز دخول جديد (4 أرقام).
// الـPIN القديم غير قابل للاسترجاع (مخزن هاش فقط)، لذا خانة «رمز الدخول»
// في البروفايل كانت تعرض ---- دائمًا. الجديد يُعرض مرة واحدة في الاستجابة
// ويجب على الموظف إبلاغه للعضو فورًا — لا يُخزَّن نصًا في أي مكان.
export const resetMemberPin = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) {
    res.status(400).json({ error: 'Invalid member id.' });
    return;
  }
  try {
    const exists = await query(
      `SELECT id, full_name FROM members WHERE id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
      [id, gym_id]);
    if (exists.rows.length === 0) {
      res.status(404).json({ error: 'Member not found.' });
      return;
    }
    const pin = String(1000 + crypto.randomInt(9000));
    const pinHash = await bcrypt.hash(pin, 12);
    await query(`UPDATE members SET pin_code_hash = $1 WHERE id = $2 AND gym_id = $3`, [pinHash, id, gym_id]);
    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
        VALUES ($1,$2,$3,$4)`,
      [gym_id, staff_user_id, `Reset entry PIN for member ${exists.rows[0].full_name}`, req.ip]);
    res.status(200).json({ data: { pin } });
  } catch (error) {
    logger.error('Failed to reset member PIN', { requestId: (req as any).requestId, memberId: id, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};
