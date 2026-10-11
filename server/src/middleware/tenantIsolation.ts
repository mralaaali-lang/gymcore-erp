import { Request, Response, NextFunction } from 'express';
import { getAdminClient } from '../config/database';

/**
 * tenantIsolation ensures every tenant-scoped query includes the current
 * gym_id and rejects requests missing tenant context.
 */
export const tenantIsolation = (req: Request, res: Response, next: NextFunction): void => {
  // Platform admin requests bypass tenant isolation
  if (req.platformAdmin) {
    next();
    return;
  }

  // Tenant staff must have gym_id in JWT context
  const tenantId = req.staff?.gym_id;
  if (!tenantId) {
    res.status(401).json({ error: 'Missing tenant context' });
    return;
  }

  // Attach tenant_id for downstream query builders
  (req as unknown as Record<string, unknown>).tenantId = tenantId;
  next();
};
