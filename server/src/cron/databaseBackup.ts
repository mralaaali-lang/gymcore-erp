import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../config/logger';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Database Backup Cron Job
 * Runs daily at 3:00 AM to create pg_dump backups.
 * Retains the last 7 days of backups.
 */
export async function runDatabaseBackup(): Promise<void> {
  const backupScript = path.resolve(__dirname, '../../scripts/backup-db.sh');

  try {
    logger.info('Starting scheduled database backup...');
    const { stdout, stderr } = await execAsync(`bash "${backupScript}"`, {
      timeout: 5 * 60 * 1000, // 5 min timeout
    });
    logger.info('Database backup completed successfully', { output: stdout.trim() });
    if (stderr) {
      logger.warn('Database backup warnings', { warnings: stderr.trim() });
    }
  } catch (error) {
    logger.error('Database backup failed', { error: error instanceof Error ? error.message : String(error) });
  }
}
