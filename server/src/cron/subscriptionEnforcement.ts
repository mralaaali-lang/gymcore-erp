import { getAdminClient } from '../config/database';
import cron from 'node-cron';
import logger from '../config/logger';

/**
 * Gym subscription enforcement — the 14-day grace policy (product decision,
 * 2026-10-11): when a gym's subscription_expires_at is more than GRACE_DAYS in
 * the past, the gym is auto-suspended (is_active = false).
 *
 * Suspension semantics (per product spec):
 *  - Blocks STAFF login only (staffLogin/refreshAccessToken check gyms.is_active).
 *  - Tenant data stays fully intact; member-facing QR flows are unaffected.
 *  - One-directional: extending subscription_expires_at does NOT auto-reactivate.
 *    Reactivation is a deliberate super-admin action from the platform dashboard
 *    (manual auto-reactivation could silently undo a deliberate suspension).
 */
export const GRACE_DAYS = 14;

export const executeSubscriptionEnforcement = async (): Promise<number> => {
  const client = await getAdminClient();
  try {
    await client.query('BEGIN');

    // Idempotent: only flips gyms that are currently active AND past grace.
    const result = await client.query(
      `UPDATE gyms
       SET is_active = false
       WHERE is_active = true
         AND deleted_at IS NULL
         AND subscription_expires_at IS NOT NULL
         AND subscription_expires_at < NOW() - make_interval(days => $1::int)
       RETURNING id, name, subscription_expires_at`,
      [GRACE_DAYS]
    );

    for (const gym of result.rows) {
      const expiredOn = new Date(gym.subscription_expires_at).toISOString().slice(0, 10);
      await client.query(
        `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
         VALUES ($1, NULL, $2, 'system')`,
        [
          gym.id,
          `Auto-suspended: subscription expired on ${expiredOn} (${GRACE_DAYS}-day grace elapsed) — staff login blocked until renewal`,
        ]
      );
    }

    await client.query('COMMIT');

    if (result.rowCount && result.rowCount > 0) {
      logger.info(`Subscription enforcement suspended ${result.rowCount} gym(s)`, { count: result.rowCount });
    }
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Subscription enforcement failed', { error: (error as Error).message });
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  executeSubscriptionEnforcement()
    .then((count) => {
      logger.info(`Enforcement one-shot complete (${count} suspended)`);
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Enforcement fatal error', { error: (err as Error).message });
      process.exit(1);
    });
}

export function scheduleSubscriptionEnforcement(): void {
  // 02:10 — right after the member-subscription cleanup at 02:00, staggered.
  cron.schedule('10 2 * * *', () => {
    executeSubscriptionEnforcement().catch(() => {});
  });
  logger.info('Gym subscription enforcement scheduled for 02:10 AM');

  // Boot-time pass: guarantees the suspended-state is correct immediately after
  // deploy/restart instead of waiting for the nightly tick (idempotent update).
  executeSubscriptionEnforcement().catch((err) => {
    logger.error('Boot-time subscription enforcement failed', { error: (err as Error).message });
  });
}
