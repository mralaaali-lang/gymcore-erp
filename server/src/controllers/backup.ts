import { Request, Response } from 'express';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { query, getAdminClient } from '../config/database';
import logger from '../config/logger';

const BACKUPS_DATA_DIR = path.resolve(__dirname, '../../../backups/data');
if (!fs.existsSync(BACKUPS_DATA_DIR)) {
  fs.mkdirSync(BACKUPS_DATA_DIR, { recursive: true });
}

// ─── Tenant Data Backup (SQL/JSON dump) ────────────────────

// النواة القابلة لإعادة الاستخدام: نسخة صالة برقمها — تُستدعى من الـendpoint
// ومن cron النسخ التلقائي اليومي (backup_auto_daily) بنفس المنطق.
export async function runTenantBackup(gymId: string, actor: string | null): Promise<{ folder: string; records: number; summary: Record<string, number> }> {
  const gymResult = await query(`SELECT id, name FROM gyms WHERE id = $1`, [gymId]);
  if (gymResult.rows.length === 0) throw new Error('Gym not found.');
  const gymName = gymResult.rows[0].name;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const folderName = `${gymName.replace(/\s+/g, '_')}_${ts}`;
  const dumpDir = path.join(BACKUPS_DATA_DIR, folderName);
  fs.mkdirSync(dumpDir, { recursive: true });

  // Tables to export (gym-scoped). pos_order_items has no gym_id —
  // it is scoped through its parent pos_orders.
  const tables = [
    'members', 'member_subscriptions', 'membership_offers', 'attendance_logs',
    'products', 'pos_orders', 'pos_order_items', 'expense_categories',
    'financial_transactions', 'staff_shifts', 'payroll_ledger',
    'fitness_classes', 'class_bookings', 'pending_actions', 'activity_logs',
  ];

  // created_at is not present on every table — order by it only when it exists.
  const colsRes = await query(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'created_at' AND table_name = ANY($1)`,
    [tables]
  );
  const withCreated = new Set(colsRes.rows.map((r: any) => r.table_name));

  for (const table of tables) {
    const orderBy = withCreated.has(table) ? 'ORDER BY created_at' : 'ORDER BY id';
    const result = table === 'pos_order_items'
      ? await query(
          `SELECT poi.* FROM pos_order_items poi
           JOIN pos_orders po ON po.id = poi.order_id
           WHERE po.gym_id = $1 ${orderBy.replace('created_at', 'poi.created_at').replace('id', 'poi.id')}`,
          [gymId]
        )
      : await query(`SELECT * FROM ${table} WHERE gym_id = $1 ${orderBy}`, [gymId]);
    const filePath = path.join(dumpDir, `${table}.json`);
    fs.writeFileSync(filePath, JSON.stringify(result.rows, null, 2), 'utf-8');
  }

  // Write metadata (includes gym_id for ownership verification)
  const meta = { gym_id: gymId, gym_name: gymName, created_at: new Date().toISOString() };
  fs.writeFileSync(path.join(dumpDir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

  // Generate aggregate summary
  const summary: Record<string, number> = {};
  for (const table of tables) {
    const filePath = path.join(dumpDir, `${table}.json`);
    const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    summary[table] = rows.length;
  }

  fs.writeFileSync(path.join(dumpDir, '_summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

  // Log backup activity
  await query(
    `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
     VALUES ($1, $2, $3, $4)`,
    [gymId, null, `Tenant data backup: ${folderName} (auto=${actor === 'cron'})`, actor === 'cron' ? 'system' : null],
  );

  logger.info(`Tenant backup created`, { gymId, folder: folderName });
  const records = Object.values(summary).reduce((a, b) => a + b, 0);
  return { folder: folderName, records, summary };
}

export const createTenantBackup = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;

  // SECURITY: this endpoint is mounted under authenticateAndIsolateTenant,
  // so it must only ever operate on the caller's OWN gym. It previously let
  // any 'owner' role pass an arbitrary `gym_id` in the request body to back
  // up (and later download) a DIFFERENT gym's data — a cross-tenant data
  // leak. A true platform-wide backup feature belongs under /platform/*
  // (authenticatePlatformAdmin + getAdminClient), not smuggled in here via
  // a staff role check.
  const targetGymId = gym_id;

  if (!targetGymId) {
    res.status(400).json({ error: 'Gym ID is required.' });
    return;
  }

  try {
    const { folder, records, summary } = await runTenantBackup(targetGymId, req.staff?.staff_user_id ?? null);
    res.status(201).json({
      success: true,
      folder,
      summary,
      message: `Backup created (${folder}, ${records} records).`,
    });
  } catch (error) {
    logger.error('Failed to create tenant backup', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to create tenant backup.' });
  }
};

export const listTenantBackups = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;

  if (!fs.existsSync(BACKUPS_DATA_DIR)) {
    res.status(200).json({ data: [] });
    return;
  }

  const folders = fs.readdirSync(BACKUPS_DATA_DIR).filter((f) => {
    const folderPath = path.join(BACKUPS_DATA_DIR, f);
    return fs.statSync(folderPath).isDirectory() && fs.existsSync(path.join(folderPath, '_summary.json'));
  });

  const results = folders.map((folder) => {
    const stat = fs.statSync(path.join(BACKUPS_DATA_DIR, folder));
    const summaryPath = path.join(BACKUPS_DATA_DIR, folder, '_summary.json');
    const metaPath = path.join(BACKUPS_DATA_DIR, folder, '_meta.json');
    let meta: Record<string, unknown> = {};
    if (fs.existsSync(metaPath)) {
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch { /* ignore */ }
    }
    let summary = {};
    let totalRecords = 0;
    if (fs.existsSync(summaryPath)) {
      try {
        summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
        totalRecords = Object.values(summary as Record<string, number>).reduce((a, b) => a + b, 0);
      } catch { /* ignore */ }
    }
    const sizeBytes = getFolderSize(path.join(BACKUPS_DATA_DIR, folder));
    const backupGymId = (meta as any).gym_id;
    return { folder, timestamp: stat.birthtime.toISOString(), sizeBytes, summary, totalRecords, gym_id: backupGymId };
  })
    .filter((b) => b.gym_id === gym_id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  res.status(200).json({ data: results });
};

export const downloadBackup = async (req: Request, res: Response): Promise<void> => {
  const { folder } = req.params;
  const gym_id = req.staff?.gym_id;

  const folderPath = path.join(BACKUPS_DATA_DIR, folder);
  if (!folder || !fs.existsSync(folderPath)) {
    res.status(404).json({ error: 'Backup folder not found.' });
    return;
  }

  // Verify ownership via _meta.json — always required, no role bypass.
  // (Cross-tenant access for real platform admins should be a separate
  // /platform/* endpoint, not a role check inside a tenant-scoped route.)
  const metaPath = path.join(folderPath, '_meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta.gym_id !== gym_id) {
        res.status(403).json({ error: 'Access denied. This backup belongs to another gym.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Cannot verify backup ownership.' });
      return;
    }
  } else {
    // No metadata at all — deny access; ownership can't be verified.
    res.status(403).json({ error: 'Cannot verify backup ownership.' });
    return;
  }

  try {
    // Create a tarball/zip of the folder
    const zipPath = path.join(BACKUPS_DATA_DIR, `${folder}.zip`);

    // Use PowerShell Compress-Archive on Windows, zip on Linux
    if (process.platform === 'win32') {
      execSync(`powershell Compress-Archive -Path "${folderPath}\\*" -DestinationPath "${zipPath}" -Force`, { timeout: 60000 });
    } else {
      execSync(`cd "${BACKUPS_DATA_DIR}" && zip -r "${folder}.zip" "${folder}"`, { timeout: 60000 });
    }

    res.download(zipPath, `${folder}.zip`, (err) => {
      if (err) {
        logger.error('Download failed', { error: err.message });
      }
      // Clean up zip file after download
      try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
    });
  } catch (error) {
    logger.error('Failed to create download archive', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to prepare backup for download.' });
  }
};

function getFolderSize(dir: string): number {
  try {
    let total = 0;
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const full = path.join(dir, file.name);
      if (file.isFile()) total += fs.statSync(full).size;
      else if (file.isDirectory()) total += getFolderSize(full);
    }
    return total;
  } catch {
    return 0;
  }
}

// ─── Restore a tenant backup folder into the caller's OWN gym ───

// Unicode letters/numbers + safe punctuation (Arabic folder names allowed)
const SAFE_FOLDER_RE = /^[\p{L}\p{N}_.\-]+$/u;

// Parents first for INSERT; reversed for DELETE (children first).
// NOTE: activity_logs is append-only (anti-tamper trigger) — it is backed
// up but never deleted/rewound on restore; only the restore event is logged.
const RESTORE_ORDER = [
  'membership_offers', 'products', 'expense_categories', 'fitness_classes',
  'members', 'member_subscriptions', 'pos_orders', 'pos_order_items',
  'financial_transactions', 'class_bookings', 'attendance_logs',
  'pending_actions', 'staff_shifts', 'payroll_ledger',
];

function toPgValue(v: unknown): unknown {
  // JSON round-trip turns bytea Buffers into { type: 'Buffer', data: [...] }
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (o.type === 'Buffer' && Array.isArray(o.data)) {
      return Buffer.from(o.data as number[]);
    }
  }
  return v;
}

export const restoreTenantBackup = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const { folder } = req.body as { folder?: string };

  if (!folder || !SAFE_FOLDER_RE.test(folder)) {
    res.status(400).json({ error: 'A valid backup folder name is required.' });
    return;
  }
  const folderPath = path.resolve(BACKUPS_DATA_DIR, folder);
  if (!folderPath.startsWith(path.resolve(BACKUPS_DATA_DIR)) || !fs.existsSync(folderPath)) {
    res.status(404).json({ error: 'Backup folder not found.' });
    return;
  }

  // Ownership check — a gym can only restore its OWN backups.
  const metaPath = path.join(folderPath, '_meta.json');
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    if (meta.gym_id !== gym_id) {
      res.status(403).json({ error: 'Access denied. This backup belongs to another gym.' });
      return;
    }
  } catch {
    res.status(403).json({ error: 'Cannot verify backup ownership.' });
    return;
  }

  const client = await getAdminClient();
  try {
    await client.query('BEGIN');

    // 1) Delete current gym rows (children first)
    for (const table of [...RESTORE_ORDER].reverse()) {
      if (table === 'pos_order_items') {
        await client.query(
          `DELETE FROM pos_order_items WHERE order_id IN (SELECT id FROM pos_orders WHERE gym_id = $1)`,
          [gym_id]
        );
      } else {
        await client.query(`DELETE FROM ${table} WHERE gym_id = $1`, [gym_id]);
      }
    }

    // 2) Insert backup rows (parents first)
    const counts: Record<string, number> = {};
    await client.query('ALTER TABLE members DISABLE TRIGGER trg_members_encrypt');
    try {
    for (const table of RESTORE_ORDER) {
      const filePath = path.join(folderPath, `${table}.json`);
      if (!fs.existsSync(filePath)) continue;
      const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>[];
      let n = 0;
      for (const row of rows) {
        if (table === 'members') {
          // Crypto columns are restored via direct UPDATE: the encrypt
          // trigger would otherwise re-hash the (nulled) plaintext and
          // violate the unique phone_hash index — so it stays disabled
          // for the whole members batch (re-enabled right after).
          const { phone_number, phone_encrypted, phone_hash, notes_encrypted, medical_notes, ...rest } = row as Record<string, unknown>;
          const cols = Object.keys(rest);
          const vals = cols.map((c) => toPgValue(rest[c]));
          const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
          await client.query(`INSERT INTO members (${cols.join(', ')}) VALUES (${ph})`, vals);
          await client.query(
            `UPDATE members SET phone_encrypted = $1, phone_hash = $2, notes_encrypted = $3 WHERE id = $4`,
            [toPgValue(phone_encrypted), phone_hash ?? null, toPgValue(notes_encrypted), row.id]
          );
        } else {
          const cols = Object.keys(row).filter((c) => !(table === 'pos_order_items' && c === 'gym_id'));
          if (cols.length === 0) continue;
          const vals = cols.map((c) => toPgValue(row[c]));
          const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
          await client.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${ph})`, vals);
        }
        n++;
      }
      counts[table] = n;
    }
    } finally {
      await client.query('ALTER TABLE members ENABLE TRIGGER trg_members_encrypt').catch(() => {});
    }

    await client.query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, req.staff?.staff_user_id, `Restored tenant backup: ${folder}`, req.ip]
    );

    await client.query('COMMIT');
    logger.info('Tenant backup restored', { gymId: gym_id, folder });
    res.json({ success: true, folder, counts, message: `Backup "${folder}" restored (${Object.values(counts).reduce((a, b) => a + b, 0)} records).` });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Failed to restore tenant backup', { error: (error as Error).message });
    res.status(500).json({ error: `Restore failed: ${(error as Error).message}` });
  } finally {
    client.release();
  }
};
