import { Pool, PoolConfig, PoolClient } from 'pg';
import dotenv from 'dotenv';
import logger from './logger';
import { getTenantGymId, getTenantClient } from './tenantContext';

dotenv.config();

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Database pool error', { error: err.message });
});

// Tracks which gym_id has already been applied (via SET) to a given pg
// client during the current request, so repeated query() calls don't
// re-issue the SET statement every time.
const appliedGymId = new WeakMap<PoolClient, string>();

async function applyTenantContext(client: PoolClient): Promise<void> {
  const gymId = getTenantGymId() || '';
  if (appliedGymId.get(client) === gymId) return;
  // is_local = false (session-level, not transaction-level): this MUST
  // survive across a controller's own BEGIN/COMMIT calls on this same
  // client, since we don't control where those transaction boundaries are.
  // middleware/tenant.ts is responsible for resetting this before the
  // connection goes back to the pool.
  await client.query(`SELECT set_config('app.gym_id', $1, false)`, [gymId]);
  // Inject encryption key for pgcrypto column-level encryption
  const encKey = process.env.ENCRYPTION_KEY || '';
  if (encKey) {
    await client.query(`SELECT set_config('app.encryption_key', $1, false)`, [encKey]);
  }
  appliedGymId.set(client, gymId);
}

function logDuration(start: number, text: string) {
  if (process.env.NODE_ENV === 'development') {
    logger.debug('Query executed', { durationMs: Date.now() - start, query: text.substring(0, 80) });
  }
}

/**
 * Wraps the shared per-request client so that legacy call sites which do
 *   const client = await getClient();
 *   try { ...; await client.query('COMMIT'); } finally { client.release(); }
 * keep working unmodified — their manual BEGIN/COMMIT/ROLLBACK still run on
 * the real connection, but .release() becomes a no-op because
 * middleware/tenant.ts owns the single real release for this request.
 * Releasing early here would let a *different* request's controller reuse
 * a connection that this request still thinks is exclusively its own.
 */
function wrapNonReleasing(client: PoolClient): PoolClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'release') {
        return () => {
          /* no-op: middleware/tenant.ts owns the real release for this request */
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  const requestClient = getTenantClient();

  if (requestClient) {
    await applyTenantContext(requestClient);
    const result = await requestClient.query(text, params);
    logDuration(start, text);
    return result;
  }

  // No request-scoped connection available — we're being called outside an
  // Express request (a cron job, a one-off script, seed data, etc). No
  // tenant context / RLS scoping is applied in this path; callers here are
  // trusted, admin-style code paths by construction.
  const result = await pool.query(text, params);
  logDuration(start, text);
  return result;
}

export async function getClient(): Promise<PoolClient> {
  const existing = getTenantClient();
  if (existing) {
    await applyTenantContext(existing);
    return wrapNonReleasing(existing);
  }

  // Outside a request lifecycle (cron/script) — behave like before: hand
  // out a fresh client the caller is fully responsible for releasing.
  const client = await pool.connect();
  const gymId = getTenantGymId();
  if (gymId) {
    await client.query(`SELECT set_config('app.gym_id', $1, false)`, [gymId]);
  }
  return client;
}

/**
 * Explicit RLS-aware client for legitimately cross-tenant operations:
 * staff/member login lookups (gym isn't known yet), platform-admin actions,
 * and gym provisioning.
 *
 * Instead of disabling RLS entirely (`SET LOCAL row_security = off`), we
 * set `app.gym_id = NULL` and rely on updated RLS policies that allow
 * platform-admin access when `current_gym_id() IS NULL`.
 *
 * Always a dedicated, standalone connection — deliberately NEVER the shared
 * per-request tenant client, so a bug can't accidentally leave admin
 * privileges for the rest of an ordinary tenant request.
 *
 * `SET SESSION` persists for the lifetime of this connection, so the caller
 * MUST release it back to the pool when done.
 */
export async function getAdminClient(): Promise<PoolClient> {
  const client = await pool.connect();
  await client.query('BEGIN');
  await client.query(`SELECT set_config('app.gym_id', NULL, true)`);
  return client;
}

/**
 * SAFE wrapper around the RLS-aware admin client.
 *
 * `getAdminClient()` now sets `app.gym_id = NULL` instead of disabling
 * RLS. This wrapper ensures the client is always released back to the
 * pool, preventing any session state from leaking to the next request.
 *
 * New cross-tenant code should use this instead of `getAdminClient()`.
 *
 * Usage:
 *   const rows = await withAdminClient(async (client) => {
 *     const r = await client.query('SELECT ... FROM gyms');
 *     return r.rows;
 *   });
 */
export async function withAdminClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  await client.query('BEGIN');
  await client.query(`SELECT set_config('app.gym_id', NULL, true)`);
  try {
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      /* already rolled back / connection issue — ignored */
    });
    throw err;
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection successful');
    return true;
  } catch (err) {
    logger.error('Database connection failed', { error: (err as Error).message });
    return false;
  }
}

export default pool;
