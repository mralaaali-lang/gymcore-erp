import { Request, Response } from 'express';
import { withAdminClient } from '../config/database';
import crypto from 'crypto';

/**
 * Generate a random API key
 */
function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `gymcore_${crypto.randomBytes(24).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 8);
  return { raw, hash, prefix };
}

/**
 * GET /platform/developer/keys
 * List all API keys (optionally filtered by gym_id)
 */
export async function listApiKeys(req: Request, res: Response) {
  const { gym_id } = req.query;
  try {
    const rows = await withAdminClient((client) => {
      let query = `
        SELECT id, gym_id, name, key_prefix, permissions, allowed_ips,
               rate_limit_per_min, is_active, expires_at, last_used_at, created_at
        FROM api_keys
        WHERE 1=1
      `;
      const params: unknown[] = [];
      if (gym_id) {
        params.push(gym_id);
        query += ` AND gym_id = $${params.length}`;
      }
      query += ' ORDER BY created_at DESC';
      return client.query(query, params);
    });
    res.json({ data: rows.rows });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}

/**
 * POST /platform/developer/keys
 * Create a new API key
 */
export async function createApiKey(req: Request, res: Response) {
  const { gym_id, name, permissions, allowed_ips, rate_limit_per_min, expires_at } = req.body;
  const adminId = req.platformAdmin?.platform_admin_id;

  if (!gym_id || !name) {
    res.status(400).json({ error: 'gym_id and name are required' });
    return;
  }

  try {
    const { raw, hash, prefix } = generateApiKey();

    const result = await withAdminClient((client) =>
      client.query(
        `INSERT INTO api_keys (gym_id, name, key_hash, key_prefix, permissions, allowed_ips, rate_limit_per_min, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, gym_id, name, key_prefix, permissions, allowed_ips,
                   rate_limit_per_min, is_active, expires_at, created_at`,
        [
          gym_id,
          name,
          hash,
          prefix,
          JSON.stringify(permissions || ['read']),
          allowed_ips || [],
          rate_limit_per_min || 60,
          expires_at || null,
          adminId,
        ]
      )
    );

    // Return the raw key only once
    res.status(201).json({
      data: {
        ...result.rows[0],
        raw_key: raw, // Only returned on creation
        message: 'Save this key now. It will not be shown again.',
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}

/**
 * DELETE /platform/developer/keys/:id
 * Revoke/delete an API key
 */
export async function deleteApiKey(req: Request, res: Response) {
  const { id } = req.params;
  try {
    await withAdminClient((client) => client.query('DELETE FROM api_keys WHERE id = $1', [id]));
    res.json({ data: { message: 'API key deleted' } });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}

/**
 * PATCH /platform/developer/keys/:id/toggle
 * Toggle API key active status
 */
export async function toggleApiKey(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const result = await withAdminClient((client) => {
      // Run both queries inside the same admin transaction
      return (async () => {
        const current = await client.query('SELECT is_active FROM api_keys WHERE id = $1', [id]);
        if (current.rows.length === 0) {
          return { notFound: true as const };
        }
        const newStatus = !current.rows[0].is_active;
        await client.query('UPDATE api_keys SET is_active = $1 WHERE id = $2', [newStatus, id]);
        return { notFound: false as const, newStatus };
      })();
    });

    if ('notFound' in result && result.notFound) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }
    const found = result as { notFound: false; newStatus: boolean };
    res.json({ data: { id, is_active: found.newStatus } });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}

/**
 * GET /platform/developer/usage
 * Get API usage statistics
 */
export async function getApiUsage(req: Request, res: Response) {
  const { gym_id, days } = req.query;
  try {
    const rows = await withAdminClient((client) => {
      let query = `
        SELECT
          COUNT(*)::int AS total_requests,
          COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300)::int AS success_count,
          COUNT(*) FILTER (WHERE status_code >= 400)::int AS error_count,
          COALESCE(AVG(response_time_ms)::int, 0) AS avg_response_time_ms,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')::int AS requests_last_hour
        FROM api_requests_log
        WHERE 1=1
      `;
      const params: unknown[] = [];
      if (gym_id) {
        params.push(gym_id);
        query += ` AND gym_id = $${params.length}`;
      }
      if (days) {
        params.push(Number(days));
        query += ` AND created_at >= NOW() - ($${params.length} || ' days')::INTERVAL`;
      }
      return client.query(query, params);
    });
    res.json({ data: rows.rows[0] });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}
