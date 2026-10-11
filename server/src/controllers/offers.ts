import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

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
