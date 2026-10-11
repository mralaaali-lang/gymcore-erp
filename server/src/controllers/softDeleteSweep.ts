import { Request, Response } from 'express';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';

/**
 * Soft-delete maintenance sweep.
 * Permanently removes gyms soft-deleted > 30 days ago.
 * Intended to be run as a cron job, not exposed as a public route.
 */
export const softDeleteSweep = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT id, name, deleted_at
         FROM gyms
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - INTERVAL '30 days'
        FOR UPDATE SKIP LOCKED`
    );

    const targets = result.rows;
    for (const row of targets) {
      await client.query('DELETE FROM gyms WHERE id = $1', [row.id]);
      logger.info('Soft-delete sweep removed gym', { gym_id: row.id, name: row.name, deleted_at: row.deleted_at });
    }

    await client.query('COMMIT');
    res.json({ data: { swept: targets.length } });
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('softDeleteSweep failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};
