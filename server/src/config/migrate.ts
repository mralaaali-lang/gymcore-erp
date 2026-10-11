import fs from 'fs';
import path from 'path';
import pool from './database';
import logger from './logger';

const MIGRATION_TABLE = 'schema_migrations';

export async function ensureMigrationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      md5_hash VARCHAR(64) NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getAppliedMigrations(): Promise<Set<string>> {
  try {
    const result = await pool.query(`SELECT filename FROM ${MIGRATION_TABLE}`);
    return new Set(result.rows.map((r) => r.filename));
  } catch {
    return new Set();
  }
}

function md5(content: string): string {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(content, 'utf-8').digest('hex');
}

export async function runMigrations() {
  const migrationDir = path.resolve(__dirname, '../../migrations');
  if (!fs.existsSync(migrationDir)) {
    logger.info('Migrations directory not found, skipping');
    return;
  }

  const sqlFiles = fs.readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort();
  // Verification checklists are manual QA scripts, not migrations. They may
  // contain session commands and multiple result sets that must not run during
  // backend startup (for example, 999_phase2_verification_checklist.sql).
  const files = sqlFiles.filter((f) => !f.toLowerCase().endsWith('_verification_checklist.sql'));
  const excludedChecklists = sqlFiles.length - files.length;
  if (excludedChecklists > 0) {
    logger.info(`Ignoring ${excludedChecklists} SQL verification checklist file(s); these are not migrations`);
  }

  if (files.length === 0) {
    logger.info('No migration files found');
    return;
  }

  await ensureMigrationTable();
  const applied = await getAppliedMigrations();

  logger.info(`Found ${files.length} migration files (${applied.size} already applied)`);

  for (const file of files) {
    if (applied.has(file)) {
      logger.info(`${file} skipped (already applied)`);
      continue;
    }

    const filePath = path.join(migrationDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    const hash = md5(sql);

    logger.info(`Running ${file}...`);
    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query(
        `INSERT INTO ${MIGRATION_TABLE} (filename, md5_hash) VALUES ($1, $2)`,
        [file, hash]
      );
      await pool.query('COMMIT');
      logger.info(`${file} completed successfully`);
    } catch (err: unknown) {
      await pool.query('ROLLBACK');
      const error = err as { message?: string; code?: string };
      // Gracefully skip migrations whose objects already exist (e.g. on Docker restart)
      if (error.code === '42P07') {
        logger.info(`${file} skipped (already exists)`);
        await pool.query(
          `INSERT INTO ${MIGRATION_TABLE} (filename, md5_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [file, hash]
        );
      } else {
        logger.error(`${file} failed: ${error.message}`);
        throw error;
      }
    }
  }

  logger.info('All migrations complete');
}

// Allow running as standalone script: node dist/config/migrate.js
if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      logger.error('Migration fatal error', { error: (err as Error).message });
      process.exit(1);
    });
}
