import cron from 'node-cron';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';
import { runTenantBackup } from '../controllers/backup';

// النسخة التلقائية اليومية: الصالات التي فعّلت backup_auto_daily في
// الإعدادات ← نسخ احتياطية. تُسجَّل كحدث cron في سجل الأنشطة لكل صالة.
export async function executeAutoBackups(): Promise<void> {
  const client = await getAdminClient();
  try {
    const r = await client.query(
      `SELECT DISTINCT gs.gym_id FROM gym_settings gs
       JOIN gyms g ON g.id = gs.gym_id
       WHERE gs.setting_key = 'backup_auto_daily' AND gs.setting_value = 'true'
         AND g.is_active = true`
    );
    for (const row of r.rows) {
      try {
        const { folder, records } = await runTenantBackup(row.gym_id, 'cron');
        logger.info('Auto backup completed', { gymId: row.gym_id, folder, records });
      } catch (e: any) {
        logger.error('Auto backup failed for gym', { gymId: row.gym_id, error: e.message });
      }
    }
  } finally {
    client.release();
  }
}

export function scheduleAutoBackups(): void {
  cron.schedule('30 3 * * *', () => {
    logger.info('Triggering daily auto backups');
    executeAutoBackups().catch((err) => {
      logger.error('Scheduled auto backup failed', { error: (err as Error).message });
    });
  });
  logger.info('Daily auto-backup task scheduled for 03:30 AM');
}
