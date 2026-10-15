import { Request, Response } from 'express';
import { query, getAdminClient } from '../config/database';

const BRANDING_KEY = 'branding';

interface BrandingData {
  logo_url: string;
  primary_color: string;
  accent_color: string;
  sidebar_bg: string;
  sidebar_text: string;
  favicon_url: string;
  app_name: string;
  footer_text: string;
  login_bg_image: string;
  custom_css: string;
}

const DEFAULT_BRANDING: BrandingData = {
  logo_url: '',
  primary_color: '#006c49',
  accent_color: '#f97316',
  sidebar_bg: '#ffffff',
  sidebar_text: '#374151',
  favicon_url: '',
  app_name: 'GymCore',
  footer_text: '© 2024 GymCore. All rights reserved.',
  login_bg_image: '',
  custom_css: '',
};

/**
 * GET /platform/branding
 * Returns the platform branding settings
 */
export async function getPlatformBranding(req: Request, res: Response) {
  try {
    const result = await query(
      `SELECT value FROM platform_settings WHERE key = $1`,
      [BRANDING_KEY]
    );

    if (result.rows.length === 0) {
      // Return defaults if no branding has been set yet
      res.json({ data: DEFAULT_BRANDING });
      return;
    }

    const branding: BrandingData = { ...DEFAULT_BRANDING, ...result.rows[0].value };
    res.json({ data: branding });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}

/**
 * PUT /platform/branding
 * Updates platform branding settings
 */
export async function updatePlatformBranding(req: Request, res: Response) {
  const branding = req.body;
  if (!branding || typeof branding !== 'object') {
    res.status(400).json({ error: 'Branding object is required' });
    return;
  }

  try {
    // Merge with existing branding
    const existing = await query(
      `SELECT value FROM platform_settings WHERE key = $1`,
      [BRANDING_KEY]
    );

    const current = existing.rows.length > 0 ? existing.rows[0].value : {};
    const merged = { ...DEFAULT_BRANDING, ...current, ...branding };

    await query(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
      [BRANDING_KEY, JSON.stringify(merged)]
    );

    res.json({ data: merged });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}

/**
 * GET /api/branding-public — intentionally UNAUTHENTICATED: only the three
 * display fields (app name / logo / footer line). The full branding object
 * stays behind super-admin auth on /platform/branding. The app footer reads
 * this so the super-admin «نص التذييل» field actually appears somewhere.
 */
export async function getPublicBranding(req: Request, res: Response) {
  try {
    const result = await query(
      `SELECT value FROM platform_settings WHERE key = $1`,
      [BRANDING_KEY]
    );
    const v = result.rows[0]?.value ?? {};
    res.json({
      data: {
        app_name: v.app_name ?? DEFAULT_BRANDING.app_name,
        logo_url: v.logo_url ?? '',
        footer_text: v.footer_text ?? DEFAULT_BRANDING.footer_text,
      },
    });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}
/**
 * POST /platform/upload/branding
 * Upload a branding file (logo, favicon, login_bg)
 * Returns the URL of the uploaded file
 */
export async function uploadBrandingFile(req: Request, res: Response) {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const type = req.body.type || 'logo';
    const url = `/uploads/${req.file.filename}`;

    // Also update the branding setting with the new URL
    const keyMap: Record<string, string> = {
      logo: 'logo_url',
      favicon: 'favicon_url',
      login_bg: 'login_bg_image',
    };

    const fieldKey = keyMap[type] || 'logo_url';

    // Get existing branding and update the specific field
    const existing = await query(
      `SELECT value FROM platform_settings WHERE key = $1`,
      [BRANDING_KEY]
    );
    const current = existing.rows.length > 0 ? existing.rows[0].value : {};
    const updated = { ...DEFAULT_BRANDING, ...current, [fieldKey]: url };

    await query(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
      [BRANDING_KEY, JSON.stringify(updated)]
    );

    res.json({ data: { url } });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}
