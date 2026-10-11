import fs from 'fs';
import path from 'path';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import logger from '../config/logger';

interface DriveConfig {
  clientEmail: string;
  privateKey: string;
  folderId: string; // Google Drive folder ID where backups go
}

function getConfig(): DriveConfig | null {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientEmail || !privateKey || !folderId) {
    logger.warn('Google Drive not configured. Set GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID');
    return null;
  }

  return { clientEmail, privateKey: privateKey.replace(/\\n/g, '\n'), folderId };
}

let driveClient: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive | null {
  if (driveClient) return driveClient;

  const config = getConfig();
  if (!config) return null;

  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

export async function uploadBackupToDrive(localFolderPath: string, backupLabel: string): Promise<string | null> {
  const drive = getDriveClient();
  const config = getConfig();
  if (!drive || !config) {
    logger.warn('Google Drive upload skipped — not configured');
    return null;
  }

  if (!fs.existsSync(localFolderPath)) {
    logger.error(`Backup folder not found: ${localFolderPath}`);
    return null;
  }

  try {
    // Create a zip archive in temp
    const tmpDir = path.resolve(__dirname, '../../../backups/tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const zipPath = path.join(tmpDir, `${backupLabel}.zip`);

    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      execSync(`powershell Compress-Archive -Path "${localFolderPath}\\*" -DestinationPath "${zipPath}" -Force`, { timeout: 120000 });
    } else {
      const { execSync } = require('child_process');
      execSync(`cd "${path.dirname(localFolderPath)}" && zip -r "${zipPath}" "${path.basename(localFolderPath)}"`, { timeout: 120000 });
    }

    const fileSize = fs.statSync(zipPath).size;
    const fileStream = fs.createReadStream(zipPath);

    const response = await drive.files.create({
      requestBody: {
        name: `${backupLabel}.zip`,
        parents: [config.folderId],
        description: `GymCore backup — ${backupLabel} — ${new Date().toISOString()}`,
      },
      media: {
        mimeType: 'application/zip',
        body: fileStream,
      },
      fields: 'id, name, webViewLink, size',
    });

    // Clean up temp zip
    try { fs.unlinkSync(zipPath); } catch { /* ignore */ }

    logger.info(`Backup uploaded to Google Drive`, {
      fileId: response.data.id,
      name: response.data.name,
      size: response.data.size,
    });

    return response.data.webViewLink || response.data.id || null;
  } catch (error) {
    logger.error('Google Drive upload failed', { error: (error as Error).message });
    return null;
  }
}

export async function listDriveBackups(): Promise<{ id: string; name: string; createdTime: string; webViewLink: string | null; size: string | null }[]> {
  const drive = getDriveClient();
  const config = getConfig();
  if (!drive || !config) return [];

  try {
    const response = await drive.files.list({
      q: `'${config.folderId}' in parents and mimeType='application/zip'`,
      orderBy: 'createdTime desc',
      pageSize: 50,
      fields: 'files(id, name, createdTime, webViewLink, size)',
    });

    return (response.data.files || []).map((f) => ({
      id: f.id || '',
      name: f.name || '',
      createdTime: f.createdTime || '',
      webViewLink: f.webViewLink || null,
      size: f.size || null,
    }));
  } catch (error) {
    logger.error('Failed to list Drive backups', { error: (error as Error).message });
    return [];
  }
}

export async function deleteDriveBackup(fileId: string): Promise<boolean> {
  const drive = getDriveClient();
  if (!drive) return false;

  try {
    await drive.files.delete({ fileId });
    logger.info(`Deleted Drive backup: ${fileId}`);
    return true;
  } catch (error) {
    logger.error('Failed to delete Drive backup', { error: (error as Error).message });
    return false;
  }
}
