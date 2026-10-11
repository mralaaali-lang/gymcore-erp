import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getAdminClient } from '../config/database';
import { PoolClient } from 'pg';

export type PlatformAdminRole = 'super_admin' | 'billing_admin' | 'support_admin' | 'readonly_admin';

export interface PlatformAdminTokenPayload {
  platform_admin_id: string;
  type: 'platform_admin';
  jti?: string;
  role_type?: PlatformAdminRole;
}

declare global {
  namespace Express {
    interface Request {
      platformAdmin?: PlatformAdminTokenPayload;
    }
  }
}

/**
 * Platform admin credentials and sessions are deliberately separate from gym staff.
 * Every request re-checks the account and its session so account deactivation,
 * role changes, password changes, and session revocation take effect immediately.
 */
export const authenticatePlatformAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length);
  } else if (req.cookies?.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    res.status(401).json({ error: 'Access denied. No token provided.' });
    return;
  }

  let adminClient: PoolClient | undefined;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as PlatformAdminTokenPayload;
    if (decoded.type !== 'platform_admin' || !decoded.platform_admin_id || !decoded.jti) {
      res.status(403).json({ error: 'Access denied. Not a valid platform admin session.' });
      return;
    }

    adminClient = await getAdminClient();
    const result = await adminClient.query(
      `SELECT p.is_active, p.role_type, s.revoked_at
       FROM platform_admins p
       JOIN platform_admin_sessions s
         ON s.platform_admin_id = p.id AND s.token_jti = $2
       WHERE p.id = $1
       LIMIT 1`,
      [decoded.platform_admin_id, decoded.jti]
    );
    await adminClient.query('COMMIT');

    const session = result.rows[0];
    if (!session || !session.is_active || session.revoked_at) {
      res.status(403).json({ error: 'Access denied. Account or session is inactive.' });
      return;
    }

    req.platformAdmin = {
      ...decoded,
      role_type: session.role_type as PlatformAdminRole,
    };
    next();
  } catch {
    if (adminClient) await adminClient.query('ROLLBACK').catch(() => {});
    res.status(403).json({ error: 'Invalid or expired token.' });
  } finally {
    adminClient?.release();
  }
};

/**
 * Apply least-privilege access to the platform API. Unknown roles and routes are
 * denied by default; super_admin retains the full platform administration scope.
 */
export const authorizePlatformAdminRoute = (req: Request, res: Response, next: NextFunction): void => {
  const role = req.platformAdmin?.role_type;
  if (role === 'super_admin') {
    next();
    return;
  }

  const mountedPath = `${req.baseUrl}${req.path}`.split('?')[0];
  const routePath = mountedPath
    .replace(/^\/api\/v1\/platform(?=\/|$)/, '')
    .replace(/^\/platform(?=\/|$)/, '') || '/';
  const method = req.method.toUpperCase();

  if (role === 'readonly_admin') {
    const sensitivePaths = [
      /^\/admins(?:\/|$)/,
      /^\/security(?:\/|$)/,
      /^\/audit-logs(?:\/|$)/,
      /^\/developer\/keys(?:\/|$)/,
    ];
    const safeRead = ['GET', 'HEAD', 'OPTIONS'].includes(method)
      && !sensitivePaths.some((pattern) => pattern.test(routePath));
    const reportQuery = method === 'POST' && routePath === '/reports/multi-tenant';
    if (safeRead || reportQuery) {
      next();
      return;
    }
  }

  if (role === 'billing_admin') {
    const billingRoute = /^\/(?:billing|billing-engine\/billing)(?:\/|$)/.test(routePath);
    const financeReport = method === 'GET'
      && /^\/reports\/(?:overview|metrics|revenue-trend|plan-performance|overdue-payments)$/.test(routePath);
    if (billingRoute || financeReport) {
      next();
      return;
    }
  }

  if (role === 'support_admin') {
    const gymDirectoryRead = method === 'GET' && routePath === '/gyms';
    const supportRoute = /^\/(?:tickets|billing-engine\/support\/tickets)(?:\/|$)/.test(routePath);
    if (gymDirectoryRead || supportRoute) {
      next();
      return;
    }
  }

  res.status(403).json({ error: 'Your platform administrator role cannot access this resource.' });
};