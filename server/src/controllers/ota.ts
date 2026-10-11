import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { execSync, spawn } from 'child_process';
import logger from '../config/logger';

const BACKUPS_DIR = path.resolve(__dirname, '../../../backups/versions');
const DEPLOY_DIR = path.resolve(__dirname, '../../..');

// Ensure backup directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// ─── Helpers ────────────────────────────────────────────────

function getDeployedVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(DEPLOY_DIR, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function listVersions(): { folder: string; timestamp: string; version: string; sizeBytes: number }[] {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs.readdirSync(BACKUPS_DIR).map((folder) => {
    const stat = fs.statSync(path.join(BACKUPS_DIR, folder));
    const version = folder.includes('v') ? folder.split('_')[0] : 'unknown';
    return {
      folder,
      timestamp: stat.birthtime.toISOString(),
      version,
      sizeBytes: getFolderSize(path.join(BACKUPS_DIR, folder)),
    };
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

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

// Only allow safe folder names: alphanumeric, underscore, hyphen, dot
const SAFE_FOLDER_RE = /^[a-zA-Z0-9_.-]+$/;

function resolveBackupPath(folder: string): string | null {
  if (!SAFE_FOLDER_RE.test(folder)) return null;
  const resolved = path.resolve(BACKUPS_DIR, folder);
  if (!resolved.startsWith(path.resolve(BACKUPS_DIR))) return null;
  return resolved;
}

function createBackup(versionLabel: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const folderName = `${versionLabel}_${ts}`;
  const backupPath = path.join(BACKUPS_DIR, folderName);
  fs.mkdirSync(backupPath, { recursive: true });

  // Backup key source directories
  const dirsToBackup = ['server/src', 'src'];
  for (const dir of dirsToBackup) {
    const srcDir = path.join(DEPLOY_DIR, dir);
    if (fs.existsSync(srcDir)) {
      copyRecursiveSync(srcDir, path.join(backupPath, dir));
    }
  }

  // Backup package.json files
  for (const pkgFile of ['package.json', 'server/package.json']) {
    const src = path.join(DEPLOY_DIR, pkgFile);
    if (fs.existsSync(src)) {
      const destDir = path.join(backupPath, path.dirname(pkgFile));
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, path.join(backupPath, pkgFile));
    }
  }

  logger.info(`Backup created: ${folderName}`);
  return folderName;
}

function copyRecursiveSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Controllers ────────────────────────────────────────────

export const getOtaStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const currentVersion = getDeployedVersion();
    const versions = listVersions();

    res.status(200).json({
      currentVersion,
      totalBackups: versions.length,
      totalSizeBytes: versions.reduce((acc, v) => acc + v.sizeBytes, 0),
      versions,
    });
  } catch (error) {
    logger.error('Failed to get OTA status', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to read OTA status.' });
  }
};

export const createOtaBackup = async (req: Request, res: Response): Promise<void> => {
  const { version } = req.body;
  const versionLabel = version || `v${getDeployedVersion()}_manual`;

  try {
    const folderName = createBackup(versionLabel);
    res.status(201).json({ success: true, folder: folderName, message: 'Backup created successfully.' });
  } catch (error) {
    logger.error('Failed to create OTA backup', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to create backup.' });
  }
};

export const deployUpdate = async (req: Request, res: Response): Promise<void> => {
  const { packageUrl } = req.body;

  if (!packageUrl) {
    res.status(400).json({ error: 'packageUrl is required (URL to new release tarball).' });
    return;
  }

  // Validate packageUrl is a URL (not a command injection vector)
  try {
    const parsed = new URL(packageUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      res.status(400).json({ error: 'packageUrl must be an HTTP(S) URL.' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'packageUrl must be a valid URL.' });
    return;
  }

  try {
    // 1. Create automatic backup before deploy
    const preDeployVersion = `pre-deploy_v${getDeployedVersion()}`;
    const backupFolder = createBackup(preDeployVersion);

    // 2. Download and extract new package (simulated - in production, use curl/wget + tar)
    // For now, we assume the new code is already pulled via git
    const output = execSync('npm run build', { cwd: DEPLOY_DIR, timeout: 120000 }).toString();

    // 3. Restart the app (in containerized env, this sends SIGTERM)
    // In production, this would be: pm2 restart all or docker compose restart

    res.status(200).json({
      success: true,
      message: 'Update deployed successfully.',
      backupFolder,
      buildOutput: output.substring(0, 500),
    });
  } catch (error) {
    logger.error('Deploy failed', { error: (error as Error).message });
    res.status(500).json({ error: `Deploy failed: ${(error as Error).message}` });
  }
};

export const rollbackVersion = async (req: Request, res: Response): Promise<void> => {
  const { folder } = req.body;

  if (!folder) {
    res.status(400).json({ error: 'folder name is required.' });
    return;
  }

  const backupPath = resolveBackupPath(folder);
  if (!backupPath || !fs.existsSync(backupPath)) {
    res.status(404).json({ error: `Backup folder '${folder}' not found.` });
    return;
  }

  try {
    // Restore server/src from backup
    const srcBackup = path.join(backupPath, 'server/src');
    if (fs.existsSync(srcBackup)) {
      const targetSrc = path.join(DEPLOY_DIR, 'server/src');
      if (fs.existsSync(targetSrc)) {
        fs.rmSync(targetSrc, { recursive: true });
      }
      copyRecursiveSync(srcBackup, targetSrc);
    }

    // Restore frontend src
    const feBackup = path.join(backupPath, 'src');
    if (fs.existsSync(feBackup)) {
      const targetFe = path.join(DEPLOY_DIR, 'src');
      if (fs.existsSync(targetFe)) {
        fs.rmSync(targetFe, { recursive: true });
      }
      copyRecursiveSync(feBackup, targetFe);
    }

    // Restore package.json files
    for (const pkgFile of ['package.json', 'server/package.json']) {
      const src = path.join(backupPath, pkgFile);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(DEPLOY_DIR, pkgFile));
      }
    }

    // Rebuild
    execSync('npm run build', { cwd: DEPLOY_DIR, timeout: 120000 });

    res.status(200).json({ success: true, message: `Rolled back to version from ${folder}. App rebuilt.` });
  } catch (error) {
    logger.error('Rollback failed', { error: (error as Error).message });
    res.status(500).json({ error: `Rollback failed: ${(error as Error).message}` });
  }
};

export const deleteVersion = async (req: Request, res: Response): Promise<void> => {
  const { folder } = req.body;

  if (!folder) {
    res.status(400).json({ error: 'folder name is required.' });
    return;
  }

  const backupPath = resolveBackupPath(folder);
  if (!backupPath || !fs.existsSync(backupPath)) {
    res.status(404).json({ error: `Backup folder '${folder}' not found.` });
    return;
  }

  try {
    fs.rmSync(backupPath, { recursive: true });
    res.status(200).json({ success: true, message: `Version '${folder}' deleted.` });
  } catch (error) {
    logger.error('Failed to delete version', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to delete backup folder.' });
  }
};

// ─── Full project reset (DEV ONLY) ───────────────────────────
// Drops + recreates the local database, re-runs migrations, re-seeds the
// 10 demo gyms and re-bootstraps the super admin — the same steps as
// server/scripts/reset-local.ps1. Runs DETACHED with output to
// backups/reset.log and progress in backups/reset-status.json.
// Returns 202 immediately — poll GET /admin/ota/reset/status.
// REFUSED outside development.
export const resetProject = async (_req: Request, res: Response): Promise<void> => {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    res.status(403).json({ error: 'Project reset is disabled in production.' });
    return;
  }
  try {
    const script = path.join(DEPLOY_DIR, 'server', 'scripts', 'reset-local.ps1');
    if (!fs.existsSync(script)) {
      res.status(500).json({ error: 'Reset script not found on this server.' });
      return;
    }
    res.status(202).json({
      success: true,
      message: 'Project reset started in background (drop → migrate → seed 10 gyms → admin). Poll reset status; wait ~4 minutes, then refresh and log in again.',
      statusUrl: '/admin/ota/reset/status',
    });
    // Spawn AFTER responding (the script terminates DB connections).
    setTimeout(() => {
      try {
        const logFd = fs.openSync(path.join(DEPLOY_DIR, 'backups', 'reset.log'), 'a');
        const statusPath = path.join(DEPLOY_DIR, 'backups', 'reset-status.json');
        fs.writeFileSync(statusPath, JSON.stringify({ state: 'starting', step: 'spawn', started_at: new Date().toISOString() }));
        const child = process.platform === 'win32'
          ? spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { detached: true, stdio: ['ignore', logFd, logFd], cwd: DEPLOY_DIR })
          : spawn('bash', ['-c', 'echo reset-local is Windows-only in this repo'], { detached: true, stdio: 'ignore' });
        child.unref();
        // Close the parent's copy of the log fd — the child keeps its own
        // duplicate. Holding it open would lock the file and kill the
        // script's transcript instantly (Windows sharing violation).
        try { fs.closeSync(logFd); } catch { /* ignore */ }
        logger.warn('Project reset triggered via OTA (pid detached)', { pid: child.pid });
      } catch (e) {
        logger.error('Failed to spawn project reset', { error: (e as Error).message });
      }
    }, 1500);
  } catch (error) {
    logger.error('Failed to start project reset', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to start project reset.' });
  }
};

// ─── Reset status (poll while a reset runs) ────────────────────
export const getResetStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const statusPath = path.join(DEPLOY_DIR, 'backups', 'reset-status.json');
    const logPath = path.join(DEPLOY_DIR, 'backups', 'reset.log');
    let status: Record<string, unknown> = { state: 'idle' };
    if (fs.existsSync(statusPath)) {
      try { status = JSON.parse(fs.readFileSync(statusPath, 'utf-8')); } catch { /* ignore */ }
    }
    let logTail: string[] = [];
    if (fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, 'utf-8').split(/\r?\n/);
      logTail = lines.slice(-15);
    }
    res.json({ data: { ...status, logTail } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read reset status.' });
  }
};
