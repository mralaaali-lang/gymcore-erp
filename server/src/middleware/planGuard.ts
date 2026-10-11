import { Request, Response, NextFunction } from 'express';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';

export interface PlanGuardOptions {
  /** Feature flags required for this route (e.g. ['inventory', 'pos']) */
  requireFeatures?: string[];
  /** If true, enforce max_members limit against current member count */
  checkMembers?: boolean;
  /** If true, enforce max_staff limit against current staff count */
  checkStaff?: boolean;
  /** If true, enforce max_branches limit against current branch count */
  checkBranches?: boolean;
  /** For platform routes: how to extract gym_id from request */
  gymSource?: 'params' | 'body' | 'query';
  /** For platform routes: field name to read gym_id from */
  gymField?: string;
}

function getGymId(req: Request, opts: PlanGuardOptions): string | null {
  // Tenant context: authenticated staff request already scoped to a gym
  if (req.staff?.gym_id) {
    return req.staff.gym_id;
  }

  // Platform context: resolve from params/body/query
  const source = opts.gymSource || 'params';
  const field = opts.gymField || (source === 'params' ? 'id' : 'gym_id');

  if (source === 'params') return (req.params as Record<string, string | undefined>)[field] || null;
  if (source === 'body') return (req.body as Record<string, string>)[field] || null;
  if (source === 'query') return (req.query as Record<string, string | undefined>)[field] || null;
  return null;
}

/**
 * planGuard verifies that the target gym's subscription plan allows the
 * requested operation. Works for both:
 *   - Platform admin routes (req.platformAdmin) — resolves gym_id from params/body
 *   - Tenant staff routes (req.staff) — auto-resolves from JWT tenant context
 *
 * Usage (platform):
 *   router.put('/gyms/:id/subscription', planGuard({ checkMembers: true, gymSource: 'params' }), updateGymSubscription);
 *
 * Usage (tenant):
 *   router.post('/api/members', planGuard({ checkMembers: true }), createMember);
 */
export const planGuard = (opts: PlanGuardOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const gymId = getGymId(req, opts);
    if (!gymId) {
      res.status(400).json({ error: 'gym_id is required for plan guard' });
      return;
    }

    const client = await getAdminClient();
    try {
      const gymResult = await client.query(
        `SELECT g.plan_id, g.features, g.member_limit, g.subscription_status,
                p.max_members, p.max_staff, p.max_branches, p.features AS plan_features, p.name AS plan_name
         FROM gyms g
         LEFT JOIN billing_plans p ON p.id = g.plan_id
         WHERE g.id = $1`,
        [gymId]
      );
      await client.query('COMMIT');

      if (gymResult.rows.length === 0) {
        res.status(404).json({ error: 'Gym not found' });
        return;
      }

      const gym = gymResult.rows[0];

      // Check subscription is active
      if (gym.subscription_status === 'suspended' || gym.subscription_status === 'expired') {
        res.status(403).json({
          error: `Subscription is ${gym.subscription_status}. Please renew to access this feature.`,
          plan: gym.plan_name,
        });
        return;
      }

      // Feature flags support both legacy array format and structured JSONB:
      // Legacy: features = '["dashboard","products"]'::jsonb
      // New:     features = '{"modules":{"dashboard":true,"products":false}}'::jsonb
      const rawFeatures = gym.plan_features || gym.features || {};
      let planFeatures: string[];
      if (typeof rawFeatures === 'string') {
        try { planFeatures = JSON.parse(rawFeatures); } catch { planFeatures = []; }
      } else if (Array.isArray(rawFeatures)) {
        planFeatures = rawFeatures;
      } else if (typeof rawFeatures === 'object' && rawFeatures !== null) {
        const modules = (rawFeatures as Record<string, unknown>).modules;
        if (modules && typeof modules === 'object') {
          planFeatures = Object.entries(modules as Record<string, boolean>)
            .filter(([, v]) => v === true)
            .map(([k]) => k);
        } else {
          planFeatures = [];
        }
      } else {
        planFeatures = [];
      }

      const gymFeatures: string[] = Array.isArray(gym.features) ? gym.features : [];

      // Required features check
      if (opts.requireFeatures && opts.requireFeatures.length > 0) {
        const missing = opts.requireFeatures.filter((f) => !planFeatures.includes(f) && !gymFeatures.includes(f));
        if (missing.length > 0) {
          res.status(403).json({
            error: 'Feature not available on current plan',
            missing_features: missing,
            plan: gym.plan_name,
          });
          return;
        }
      }

      // Member limit check — read from gym_usage_counters (single source of truth)
      if (opts.checkMembers && gym.max_members > 0) {
        const counterResult = await client.query(
          `SELECT current_members_count FROM gym_usage_counters WHERE gym_id = $1`,
          [gymId]
        );
        const memberCount = counterResult.rows[0]?.current_members_count || 0;
        if (memberCount >= gym.max_members) {
          res.status(403).json({
            error: 'Member limit reached for current plan',
            limit: gym.max_members,
            current: memberCount,
            plan: gym.plan_name,
          });
          return;
        }
      }

      // Staff limit check — read from gym_usage_counters
      if (opts.checkStaff && gym.max_staff > 0) {
        const counterResult = await client.query(
          `SELECT current_staff_count FROM gym_usage_counters WHERE gym_id = $1`,
          [gymId]
        );
        const staffCount = counterResult.rows[0]?.current_staff_count || 0;
        if (staffCount >= gym.max_staff) {
          res.status(403).json({
            error: 'Staff limit reached for current plan',
            limit: gym.max_staff,
            current: staffCount,
            plan: gym.plan_name,
          });
          return;
        }
      }

      // Branches limit check
      if (opts.checkBranches && gym.max_branches > 0) {
        const counterResult = await client.query(
          `SELECT current_branches_count FROM gym_usage_counters WHERE gym_id = $1`,
          [gymId]
        );
        const branchCount = counterResult.rows[0]?.current_branches_count || 0;
        if (branchCount >= gym.max_branches) {
          res.status(403).json({
            error: 'Branch limit reached for current plan',
            limit: gym.max_branches,
            current: branchCount,
            plan: gym.plan_name,
          });
          return;
        }
      }

      next();
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('planGuard failed', { error: (error as Error).message, gymId });
      res.status(500).json({ error: 'Internal server error.' });
    } finally {
      client.release();
    }
  };
};
