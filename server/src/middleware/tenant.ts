import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { runWithTenant, setTenantClient } from '../config/tenantContext';
import logger from '../config/logger';

/**
 * Checks out ONE Postgres connection for the entire lifetime of this HTTP
 * request and stores it in AsyncLocalStorage so every query() / getClient()
 * call made anywhere during this request (controllers, services, etc.)
 * reuses the same physical connection.
 *
 * This matters because `SELECT set_config('app.gym_id', ...)` (used to
 * drive Row Level Security) only affects the connection it runs on. Before
 * this fix, config/database.ts called `pool.query()` twice in a row — once
 * to set the tenant, once for the real query — and `pg.Pool` is free to
 * hand out a *different* connection for each call, so RLS could silently
 * see no tenant context at all. Binding one connection per request closes
 * that gap without requiring every controller to change.
 *
 * The connection is released back to the pool once the response finishes
 * (or the connection closes early), after a defensive ROLLBACK (in case a
 * controller's own transaction was left open by a thrown error) and a
 * RESET of app.gym_id (so the next, unrelated request that happens to
 * reuse this same pooled connection never inherits this tenant's context).
 */
export async function tenantMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    logger.error('Failed to acquire DB connection for request', { error: (err as Error).message });
    res.status(503).json({ error: 'Service temporarily unavailable.' });
    return;
  }

  // Inject the encryption key into the PostgreSQL session so pgcrypto's
  // encrypt_sensitive() / decrypt_sensitive() helpers can use it for
  // column-level encryption of phone_number and medical_notes.
  // The key lives ONLY in process.env and is NEVER stored in any DB table.
  const encryptionKey = process.env.ENCRYPTION_KEY || '';
  if (encryptionKey) {
    client.query(`SELECT set_config('app.encryption_key', $1, false)`, [encryptionKey]).catch(() => {});
  }

  let released = false;
  const releaseClient = async () => {
    if (released) return;
    released = true;
    try {
      await client.query('ROLLBACK').catch(() => {
        // No transaction was open — expected in the common case. Ignored.
      });
      await client.query(`SELECT set_config('app.gym_id', '', false)`).catch(() => {});
      if (encryptionKey) {
        await client.query(`SELECT set_config('app.encryption_key', '', false)`).catch(() => {});
      }
    } finally {
      client.release();
    }
  };

  res.on('finish', releaseClient);
  res.on('close', releaseClient);

  runWithTenant('', () => {
    setTenantClient(client);
    next();
  });
}
