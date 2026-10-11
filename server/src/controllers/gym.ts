import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

// === ANNOUNCEMENTS ===
export const listAnnouncements = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT a.*, su.full_name AS staff_name FROM announcements a LEFT JOIN staff_users su ON a.staff_user_id=su.id WHERE a.gym_id=$1 ORDER BY a.is_pinned DESC, a.created_at DESC`, [gym_id]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listAnnouncements failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createAnnouncement = async (req: Request, res: Response) => {
  const { title, content, target_audience, is_pinned } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  try {
    const r = await query(`INSERT INTO announcements (gym_id, staff_user_id, title, content, target_audience, is_pinned) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [gym_id, staff_user_id, title, content, target_audience || 'all', is_pinned || false]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createAnnouncement failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === SETTINGS ===
export const getSettings = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    // Merge gym_settings (key-value) with gyms table columns.
    // This ensures edits made by super-admin on the gyms table are reflected.
    const [gymRows, settingsRows] = await Promise.all([
      query(`SELECT name, phone, address_street, address_state,
                    address_country, timezone, date_format, time_format,
                    first_day_of_week, language, logo_url, currency
             FROM gyms WHERE id=$1`, [gym_id]),
      query(`SELECT setting_key, setting_value FROM gym_settings WHERE gym_id=$1`, [gym_id]),
    ]);
    const gym = gymRows.rows[0] as Record<string, unknown> | undefined;
    const settings: Record<string, string> = {};
    if (gym) {
      settings.gym_name = (gym.name as string) || '';
      settings.gym_phone = (gym.phone as string) || '';
      settings.gym_address = (gym.address_street as string) || '';
      settings.gym_state = (gym.address_state as string) || '';
      settings.gym_country = (gym.address_country as string) || 'Egypt';
      settings.gym_timezone = (gym.timezone as string) || 'Africa/Cairo';
      settings.date_format = (gym.date_format as string) || 'DD/MM/YYYY';
      settings.time_format = (gym.time_format as string) || '12h';
      settings.first_day_of_week = (gym.first_day_of_week as string) || 'Sunday';
      settings.language_setting = (gym.language as string) || 'ar';
      settings.logo_url = (gym.logo_url as string) || '';
      settings.currency = (gym.currency as string) || 'EGP';
    }
    // gym_settings overrides any gyms column (more specific per-gym config)
    settingsRows.rows.forEach((row: any) => {
      settings[row.setting_key] = row.setting_value;
    });
    res.json({ data: settings });
  } catch (e: any) { logger.error('getSettings failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const updateSettings = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const settings = req.body;
  try {
    // Map known setting keys back to gyms table columns for sync
    const gymColumnMap: Record<string, string> = {
      gym_name: 'name',
      gym_phone: 'phone',
      gym_address: 'address_street',
      gym_state: 'address_state',
      gym_country: 'address_country',
      gym_timezone: 'timezone',
      date_format: 'date_format',
      time_format: 'time_format',
      first_day_of_week: 'first_day_of_week',
      language_setting: 'language',
      // units_system intentionally unmapped: the gyms.units_system column was
      // dropped in migration 040_tenant_schema_cleanup — mapping it here would
      // emit `UPDATE gyms SET units_system=…` and 500 the whole settings save.
      logo_url: 'logo_url',
      currency: 'currency',
    };
    const gymUpdates: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      const col = gymColumnMap[key];
      if (col) gymUpdates[col] = value as string;
    }
    if (Object.keys(gymUpdates).length > 0) {
      const sets = Object.entries(gymUpdates)
        .map(([col], i) => `${col} = $${i + 1}`)
        .join(', ');
      const values = Object.values(gymUpdates);
      await query(`UPDATE gyms SET ${sets} WHERE id = $${values.length + 1}`, [...values, gym_id]);
    }

    for (const [key, value] of Object.entries(settings)) {
      await query(`INSERT INTO gym_settings (gym_id, setting_key, setting_value) VALUES ($1,$2,$3) ON CONFLICT (gym_id, setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value, updated_at=NOW()`, [gym_id, key, value]);
    }
    res.json({ success: true });
  } catch (e: any) { logger.error('updateSettings failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};
