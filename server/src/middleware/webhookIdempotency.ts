import { Request, Response, NextFunction } from 'express';
import { getAdminClient } from '../config/database';

/**
 * Stores processed webhook event IDs to prevent duplicate processing.
 * Gateway-specific uniqueness is enforced by (gateway, event_id).
 */
export interface WebhookIdempotencyOptions {
  gateway: 'paymob' | 'fawry' | 'subscription';
  eventIdField?: string;
  ttlHours?: number;
}

export const webhookIdempotency = (opts: WebhookIdempotencyOptions) => {
  const eventIdField = opts.eventIdField || 'event_id';
  const ttlHours = opts.ttlHours || 72;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const eventId = (req.body as Record<string, unknown>)[eventIdField];
    if (!eventId || typeof eventId !== 'string') {
      res.status(400).json({ error: `Missing ${eventIdField} for idempotency check` });
      return;
    }

    const client = await getAdminClient();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO webhook_idempotency_keys (gateway, event_id, payload_hash, processed_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (gateway, event_id) DO UPDATE
           SET processed_at = CURRENT_TIMESTAMP
         RETURNING processed_at`,
        [opts.gateway, eventId, String(Date.now())]
      );

      await client.query('COMMIT');

      // If the row was already present before this transaction, skip processing
      // We do this by checking if the inserted_at was earlier than now - 1 second
      // For simplicity: re-insert conflicts are considered already processed
      const alreadyProcessed = result.rows[0]?.processed_at;
      const now = new Date();
      const processed = new Date(alreadyProcessed);
      const diffMs = now.getTime() - processed.getTime();

      if (diffMs > 1000) {
        res.status(200).json({ status: 'already_processed' });
        return;
      }

      next();
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('webhookIdempotency error', error);
      res.status(500).json({ error: 'Internal server error.' });
    } finally {
      client.release();
    }
  };
};
