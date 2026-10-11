import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import logger from '../config/logger';
import { setTenantGymId } from '../config/tenantContext';

export interface TokenPayload {
  staff_user_id?: string;
  member_id?: string;
  gym_id: string;
  role: 'manager' | 'receptionist' | 'coach' | 'member';
  jti?: string;
}

declare global {
  namespace Express {
    interface Request {
      staff?: TokenPayload;
    }
  }
}

export const authenticateAndIsolateTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    res.status(401).json({ error: 'Access denied. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;
    req.staff = decoded;

    if (decoded.gym_id) {
      setTenantGymId(decoded.gym_id);
    }

    // Verify staff + gym still active on every request (TOCTOU prevention)
    if (decoded.staff_user_id) {
      const result = await pool.query(
        `SELECT s.is_active AS staff_active, g.is_active AS gym_active
         FROM staff_users s JOIN gyms g ON s.gym_id = g.id
         WHERE s.id = $1 AND s.gym_id = $2`,
        [decoded.staff_user_id, decoded.gym_id]
      );
      if (result.rows.length === 0 || !result.rows[0].staff_active || !result.rows[0].gym_active) {
        res.status(403).json({ error: 'Access denied. Account or gym is deactivated.' });
        return;
      }
    }

    // Check if this specific session (jti) has been revoked
    if (decoded.jti) {
      const sessionCheck = await pool.query(
        `SELECT revoked_at FROM user_sessions WHERE token_jti = $1 AND staff_user_id = $2`,
        [decoded.jti, decoded.staff_user_id]
      );
      if (sessionCheck.rows.length === 0 || sessionCheck.rows[0].revoked_at) {
        // 401 (not 403): the credential itself is no longer valid, so the
        // client must re-authenticate — the frontend refresh interceptor
        // keys on 401. 403 here left users stuck on silent dead dashboards.
        res.status(401).json({ error: 'Session has been revoked. Please log in again.' });
        return;
      }
      // Update last_active_at
      await pool.query(
        `UPDATE user_sessions SET last_active_at = NOW() WHERE token_jti = $1`,
        [decoded.jti]
      ).catch(() => {});
    }

    next();
  } catch (error) {
    // 401 (not 403): invalid/expired token means "not authenticated" — this
    // is what triggers the frontend's refresh-and-retry flow. A stale 5-min
    // access token previously returned 403, which the client never refreshes,
    // leaving every staff API call dead until a hard logout.
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.staff) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!roles.includes(req.staff.role)) {
      res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
      return;
    }

    next();
  };
};
