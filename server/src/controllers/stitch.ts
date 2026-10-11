import { Request, Response } from 'express';
import { completeStitchOrder, listStitchOrders, getStitchOrder, StitchGuardError } from '../services/stitchService';
import logger from '../config/logger';

/**
 * POST /gym/stitch/:id/complete
 * Complete a stitch (tailoring) order. Enforces the subscription guard and
 * auto-creates the linked POS order + financial transaction + loyalty points.
 */
export async function completeStitchOrderHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { price } = req.body;
  const staffUserId = (req as any).staff?.id || (req as any).user?.id;
  const gymId = (req as any).gymId || (req as any).staff?.gym_id;

  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    res.status(400).json({ error: 'A valid non-negative price is required.' });
    return;
  }

  try {
    const result = await completeStitchOrder(id, staffUserId, numericPrice);
    res.json({
      data: result,
      message: 'Stitch order completed. POS order, income transaction and loyalty points created.',
    });
  } catch (err) {
    if (err instanceof StitchGuardError) {
      res.status(409).json({ error: err.message });
      return;
    }
    logger.error('completeStitchOrder failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * GET /gym/stitch
 * List stitch orders for the current gym (tenant-scoped). Optional ?status= filter.
 */
export async function listStitchOrdersHandler(req: Request, res: Response): Promise<void> {
  const gymId = (req as any).gymId || (req as any).staff?.gym_id;
  const { status } = req.query;
  try {
    const rows = await listStitchOrders(gymId, typeof status === 'string' ? status : undefined);
    res.json({ data: rows });
  } catch (err) {
    logger.error('listStitchOrders failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * GET /gym/stitch/:id
 * Get a single stitch order (tenant-scoped).
 */
export async function getStitchOrderHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const order = await getStitchOrder(id);
    if (!order) {
      res.status(404).json({ error: 'Stitch order not found.' });
      return;
    }
    res.json({ data: order });
  } catch (err) {
    logger.error('getStitchOrder failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
}
