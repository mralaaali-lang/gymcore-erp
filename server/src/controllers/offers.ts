import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

// membership_offers is the SINGLE source of truth for gym plans/offers
// (§33ب): columns are title / duration_days / price / is_active. Every
// consumer (member-add form, subscriptions page, MRR) reads these fields.

export const listOffers = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;

  try {
    const result = await query(
      `SELECT id, title, duration_days, price, is_active
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
export const listAllOffers = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  try {
    const result = await query(
      `SELECT id, title, duration_days, price, is_active,
              (SELECT COUNT(*)::int FROM member_subscriptions ms
                WHERE ms.offer_id = membership_offers.id AND ms.deleted_at IS NULL) AS subscription_count
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
  const { title, duration_days, price } = req.body;
  try {
    const result = await query(
      `INSERT INTO membership_offers (gym_id, title, duration_days, price)
       VALUES ($1, $2, $3, $4) RETURNING id, title, duration_days, price, is_active`,
      [gym_id, title, duration_days, price]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to create membership offer', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Partial update — any of title/duration_days/price/is_active. Deletion is
// deliberately NOT offered: member_subscriptions.offer_id references these
// rows, so the honest lifecycle is deactivate (is_active=false), not delete.
export const updateOffer = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const { title, duration_days, price, is_active } = req.body;
  try {
    const result = await query(
      `UPDATE membership_offers
       SET title = COALESCE($1, title),
           duration_days = COALESCE($2, duration_days),
           price = COALESCE($3, price),
           is_active = COALESCE($4, is_active)
       WHERE id = $5 AND gym_id = $6
       RETURNING id, title, duration_days, price, is_active`,
      [title ?? null, duration_days ?? null, price ?? null, is_active ?? null, id, gym_id]
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
