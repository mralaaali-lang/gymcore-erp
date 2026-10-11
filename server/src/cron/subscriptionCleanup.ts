import { getAdminClient } from '../config/database';
import cron from 'node-cron';
import logger from '../config/logger';

export const executeDailySubscriptionCleanupAndAlerts = async (): Promise<void> => {
  logger.info('Daily subscription cleanup started');

  const client = await getAdminClient();
  try {
    await client.query('BEGIN');

    const expiredResult = await client.query(
      `UPDATE member_subscriptions
       SET status = 'expired'
       WHERE end_date < CURRENT_DATE AND status = 'active'`
    );

    if (expiredResult.rowCount !== null && expiredResult.rowCount > 0) {
      logger.info(`Expired ${expiredResult.rowCount} subscriptions`, { count: expiredResult.rowCount });
    }

    const unfrozenResult = await client.query(
      `UPDATE member_subscriptions
       SET status = 'active', is_frozen = false, freeze_start_date = NULL, freeze_end_date = NULL
       WHERE status = 'frozen' AND freeze_end_date < CURRENT_DATE`
    );

    if (unfrozenResult.rowCount !== null && unfrozenResult.rowCount > 0) {
      logger.info(`Auto-unfrozen ${unfrozenResult.rowCount} subscriptions`, { count: unfrozenResult.rowCount });
    }

    const alerts = await client.query(
      `SELECT s.id, m.full_name, m.phone_number, s.end_date, g.name as gym_name, g.id as gym_id
       FROM member_subscriptions s
       JOIN members m ON s.member_id = m.id
       JOIN gyms g ON s.gym_id = g.id
       WHERE s.end_date = CURRENT_DATE + INTERVAL '3 days' AND s.status = 'active'`
    );

    if (alerts.rows.length > 0) {
      logger.info(`Found ${alerts.rows.length} subscriptions expiring in 3 days`, { count: alerts.rows.length });

      for (const target of alerts.rows) {
        logger.info(`Alerting member ${target.full_name} at ${target.gym_name}`, {
          member: target.full_name,
          phone: target.phone_number,
          gym: target.gym_name,
          expires: target.end_date,
        });

        await client.query(
          `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
           VALUES ($1, NULL, $2, 'system')`,
          [
            target.gym_id,
            `Auto-alert: Subscription for ${target.full_name} expires on ${target.end_date}`,
          ]
        );
      }
    }

    await client.query('COMMIT');
    logger.info('Daily cleanup and alerts completed');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Cron job failed', { error: (error as Error).message });
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  executeDailySubscriptionCleanupAndAlerts()
    .then(() => {
      logger.info('Cron one-time execution complete');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Cron fatal error', { error: (err as Error).message });
      process.exit(1);
    });
}

export function scheduleDailyCron(): void {
  cron.schedule('0 2 * * *', () => {
    logger.info('Triggering daily subscription cleanup');
    executeDailySubscriptionCleanupAndAlerts().catch((err) => {
      logger.error('Scheduled cron execution failed', { error: (err as Error).message });
    });
  });

  logger.info('Daily cron task scheduled for 02:00 AM');
}
