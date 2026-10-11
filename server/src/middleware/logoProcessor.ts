import { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import logger from '../config/logger';

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
const LOGO_DIR = path.resolve(UPLOAD_DIR, 'logos');

async function ensureDirs() {
  await fs.mkdir(LOGO_DIR, { recursive: true });
}

const MAGIC_SIGNATURES: { [key: string]: number[][] } = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'image/svg+xml': [[0x3c, 0x3f, 0x78, 0x6d, 0x6c]],
};

function matchesMagic(buffer: Buffer, mime: string): boolean {
  const signatures = MAGIC_SIGNATURES[mime];
  if (!signatures) return true;
  return signatures.some((sig) => buffer.slice(0, sig.length).equals(Buffer.from(sig)));
}

export async function logoProcessor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ensureDirs();

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: 'No logo file uploaded.' });
      return;
    }

    const buffer = await fs.readFile(file.path);
    if (!matchesMagic(buffer, file.mimetype)) {
      await fs.unlink(file.path).catch(() => {});
      res.status(400).json({ error: 'Invalid file type. Magic bytes validation failed.' });
      return;
    }

    const rawGymId = (req.body?.gym_id || (req as any)?.staff?.gym_id || '') as string;
    const outputName = rawGymId ? `logo_${rawGymId}.webp` : `logo_${Date.now()}.webp`;
    const outputPath = path.join(LOGO_DIR, outputName);

    await sharp(buffer)
      .resize(500, 500, { fit: 'cover', position: 'center' })
      .webp({ quality: 85, effort: 4 })
      .toFile(outputPath);

    (req as Request & { file: Express.Multer.File }).file = {
      ...file,
      filename: outputName,
      path: outputPath,
      mimetype: 'image/webp',
      size: (await fs.stat(outputPath)).size,
    } as Express.Multer.File;

    await fs.unlink(file.path).catch(() => {});

    next();
  } catch (error) {
    logger.error('logoProcessor failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to process logo image.' });
  }
}
