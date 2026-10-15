import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';
import { sportExists } from './sports';

// membership_offers is the SINGLE source of truth for gym plans/offers
// (§33ب): columns are title / duration_days / price / is_active. Every
// consumer (member-add form, subscriptions page, MRR) reads these fields.

const OFFER_COLS = `id, title, duration_days, price, is_active,
  sport, total_sessions, freeze_days_max, weekly_days, description`;

const VALID_WEEK_DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
function cleanWeekly(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.filter((d) => typeof d === 'string' && VALID_WEEK_DAYS.includes(d)))];
  return out;
}

export const listOffers = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;

  try {
    const result = await query(
      `SELECT ${OFFER_COLS}
       FROM membership_offers
       WHERE gym_id = $1 AND is_active = true
       ORDER BY price ASC`,
      [gym_id]
    );

    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Failed to list membership offers', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Manager view: every offer including deactivated ones (the subscriptions
// page needs them so a toggle-off plan doesn't silently vanish).
// Per-offer aggregates come from the same member_subscriptions ledger the
// plans page cards read: total linked subs, ACTIVE subs (status='active'),
// collected revenue (SUM price_paid), and the dominant sport among its
// subscriptions (sport lives per-subscription, not per-plan — a plan with no
// sported subscriptions reports sport_mode NULL = «بدون تصنيف»).
export const listAllOffers = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  try {
    const result = await query(
      `SELECT ${OFFER_COLS},
              (SELECT COUNT(*)::int FROM member_subscriptions ms
                WHERE ms.offer_id = membership_offers.id AND ms.deleted_at IS NULL) AS subscription_count,
              (SELECT COUNT(*)::int FROM member_subscriptions ms
                WHERE ms.offer_id = membership_offers.id AND ms.deleted_at IS NULL
                  AND ms.status = 'active') AS active_count,
              (SELECT COALESCE(SUM(ms.price_paid), 0) FROM member_subscriptions ms
                WHERE ms.offer_id = membership_offers.id AND ms.deleted_at IS NULL) AS revenue,
              (SELECT ms.sport FROM member_subscriptions ms
                WHERE ms.offer_id = membership_offers.id AND ms.deleted_at IS NULL
                  AND ms.sport IS NOT NULL
                GROUP BY ms.sport ORDER BY COUNT(*) DESC LIMIT 1) AS sport_mode
       FROM membership_offers
       WHERE gym_id = $1
       ORDER BY is_active DESC, price ASC`,
      [gym_id]
    );
    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Failed to list all membership offers', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const createOffer = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const { title, duration_days, price, sport, total_sessions, freeze_days_max, weekly_days, description } = req.body;
  try {
    // الإجبار: رياضة الباقة من كتالوج الصالة حصرًا — لا «بدون تصنيف» جديدة
    if (!(await sportExists(gym_id, sport))) {
      res.status(400).json({ error: 'Sport is required and must exist in this gym catalog.' });
      return;
    }
    const result = await query(
      `INSERT INTO membership_offers (gym_id, title, duration_days, price, sport, total_sessions, freeze_days_max, weekly_days, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${OFFER_COLS}`,
      [gym_id, title, duration_days, price, sport || null,
        total_sessions ?? null, freeze_days_max ?? 0,
        weekly_days?.length ? cleanWeekly(weekly_days) : null,
        description?.trim() || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to create membership offer', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Deletion is allowed ONLY for offers with zero live subscriptions —
// anything referenced stays (deactivate instead). The plans page delete
// button surfaces the 409 count honestly instead of failing silently.
export const deleteOffer = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const used = await query(
      `SELECT COUNT(*)::int AS count FROM member_subscriptions
        WHERE offer_id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
      [id, gym_id]
    );
    const count = Number(used.rows[0]?.count ?? 0);
    if (count > 0) {
      res.status(409).json({ error: 'Offer has subscriptions and cannot be deleted — deactivate it instead.', count });
      return;
    }
    const result = await query(
      `DELETE FROM membership_offers WHERE id = $1 AND gym_id = $2 RETURNING id`,
      [id, gym_id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Offer not found' });
      return;
    }
    res.status(200).json({ data: { id, deleted: true } });
  } catch (error) {
    logger.error('Failed to delete membership offer', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Partial update — any of title/duration_days/price/is_active.
export const updateOffer = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const { title, duration_days, price, is_active, sport, total_sessions, freeze_days_max, weekly_days, description } = req.body;
  try {
    // الحقول الفارغة (sport/sessions/freeze/weekly/description) تُحدَّث فقط
    // عند إرسالها — toggle الحالة يرسل is_active وحده فلا يمسح شيئًا،
    // وnull الصريح يمسح (مقصود عبر الفورم).
    const sets = [
      'title = COALESCE($1, title)',
      'duration_days = COALESCE($2, duration_days)',
      'price = COALESCE($3, price)',
      'is_active = COALESCE($4, is_active)',
    ];
    const vals: unknown[] = [title ?? null, duration_days ?? null, price ?? null, is_active ?? null];
    const maybe = (key: string, sql: string, val: unknown) => {
      if (key in req.body) {
        vals.push(val);
        sets.push(`${sql} = $${vals.length}`);
      }
    };
    maybe('sport', 'sport', sport ?? null);
    if ('sport' in req.body && sport) {
      if (!(await sportExists(gym_id, sport))) {
        res.status(400).json({ error: 'Unknown sport for this gym.' });
        return;
      }
    }
    maybe('total_sessions', 'total_sessions', total_sessions ?? null);
    maybe('freeze_days_max', 'freeze_days_max', freeze_days_max ?? 0);
    maybe('weekly_days', 'weekly_days', weekly_days?.length ? cleanWeekly(weekly_days) : null);
    maybe('description', 'description', typeof description === 'string' && description.trim() ? description.trim() : null);
    vals.push(id, gym_id);
    const result = await query(
      `UPDATE membership_offers SET ${sets.join(', ')}
       WHERE id = $${vals.length - 1} AND gym_id = $${vals.length}
       RETURNING ${OFFER_COLS}`,
      vals
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Offer not found' });
      return;
    }
    res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to update membership offer', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};
