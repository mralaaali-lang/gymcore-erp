import { Request, Response, NextFunction } from 'express';

export interface GracePeriodOptions {
  days?: number;
}

// Aligned with the 14-day grace policy in cron/subscriptionEnforcement.ts
// (product decision 2026-10-11). Note: this middleware is currently unmounted —
// kept in sync so a future mount doesn't silently reintroduce a 3-day grace.
const DEFAULT_GRACE_DAYS = 14;

/**
 * Grace period middleware for gym access.
 * Allows access within `days` after subscription_expires_at.
 */
export function gracePeriod(options: GracePeriodOptions = {}) {
  const graceDays = options.days ?? DEFAULT_GRACE_DAYS;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const gym = (req as any).gym;
    if (!gym) {
      res.status(400).json({ error: 'Gym context missing.' });
      return;
    }

    if (gym.tenant_status === 'active' || gym.tenant_status === 'trial') {
      next();
      return;
    }

    if (gym.subscription_expires_at) {
      const expires = new Date(gym.subscription_expires_at);
      const now = new Date();
      const diff = now.getTime() - expires.getTime();
      const daysSinceExpiry = diff / (1000 * 60 * 60 * 24);

      if (daysSinceExpiry >= 0 && daysSinceExpiry <= graceDays) {
        next();
        return;
      }
    }

    res.status(403).json({
      error: 'Subscription expired. Please renew to restore access.',
      code: 'SUBSCRIPTION_EXPIRED',
    });
  };
}
