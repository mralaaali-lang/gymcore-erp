import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';
import { scrubSecrets } from '../utils/scrubSecrets';

/**
 * §34ج-أ — onboarding_data كان يخزّن كلمات مرور الخطوات كنص صريح داخل
 * عمود jsonb. كلمة المرور تُستهلك أثناء إنشاء الحساب بشكل مشروع (تصل في
 * جسم طلب الإكمال نفسه، فلا يعتمد إنشاء المدير على العمود المخزّن)، لكن لا
 * يحق لها البقاء في سجل الخطوات: تُقتطع هنا قبل كل حفظ وقبل كل إكمال، على
 * أي عمق بما فيها التفرعات داخل step_N_data.
 *
 * تاريخ التنقية: migration 068 (بلوك 8) كانت تقتطع الطبقة الأولى فقط فسقطت
 * admin.password وstep_2_data.password؛ migration 081 تنقّي المتبقي
 * تكراريًا وتُعلّق trigger على العمود حتى لا يرجع التسريب من أي مسار آخر.
 */

/**
 * GET /platform/onboarding
 * Returns onboarding progress for the current super admin + overall platform status
 */
export async function getOnboardingProgress(req: Request, res: Response) {
  const adminId = req.platformAdmin?.platform_admin_id;
  if (!adminId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const [adminResult, gymCountResult, adminCountResult, settingsResult] = await Promise.all([
      query(`SELECT onboarding_complete, onboarding_step, onboarding_data FROM platform_admins WHERE id = $1`, [adminId]),
      query(`SELECT COUNT(*)::int AS count FROM gyms`),
      query(`SELECT COUNT(*)::int AS count FROM platform_admins`),
      query(`SELECT key, value FROM platform_settings`),
    ]);

    const admin = adminResult.rows[0];
    const gymCount = gymCountResult.rows[0].count;
    const adminCount = adminCountResult.rows[0].count;
    const settingsMap: Record<string, unknown> = {};
    for (const row of settingsResult.rows) {
      settingsMap[row.key] = row.value;
    }

    res.json({
      data: {
        onboarding_complete: admin?.onboarding_complete ?? false,
        onboarding_step: admin?.onboarding_step ?? 0,
        onboarding_data: admin?.onboarding_data ?? {},
        gym_count: gymCount,
        admin_count: adminCount,
        settings: settingsMap,
      },
    });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}

/**
 * POST /platform/onboarding/step
 * Saves progress for a specific onboarding step
 */
export async function saveOnboardingStep(req: Request, res: Response) {
  const adminId = req.platformAdmin?.platform_admin_id;
  if (!adminId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { step, data } = req.body;
  if (typeof step !== 'number' || step < 0 || step > 5) {
    res.status(400).json({ error: 'Invalid step. Must be 0-5.' });
    return;
  }

  try {
    const currentData = await query(
      `SELECT onboarding_data FROM platform_admins WHERE id = $1`,
      [adminId]
    );
    const existingData = currentData.rows[0]?.onboarding_data || {};
    const safeData = scrubSecrets(data ?? {});
    const mergedData = { ...existingData, ...safeData, [`step_${step}_data`]: safeData };

    await query(
      `UPDATE platform_admins SET onboarding_step = $1, onboarding_data = $2 WHERE id = $3`,
      [step, JSON.stringify(mergedData), adminId]
    );

    res.json({ data: { onboarding_step: step, onboarding_data: mergedData } });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}

/**
 * POST /platform/onboarding/complete
 * Marks onboarding as complete for the current super admin,
 * ACTUALLY creates the gym, owner account, and saves platform settings.
 */
export async function completeOnboarding(req: Request, res: Response) {
  const adminId = req.platformAdmin?.platform_admin_id;
  if (!adminId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { final_data } = req.body;
  const gymData = final_data?.gym || {};
  const adminData = final_data?.admin || {};
  const configData = final_data?.config || {};

  const client = await getAdminClient();
  try {
    await client.query('BEGIN');

    // ── 1. Create the gym ───────────────────────────────────────
    let gymId: string | null = null;
    if (gymData.name && gymData.subdomain) {
      const ownerFullName = adminData.display_name || 'Manager';
      const ownerEmail = adminData.email || `manager@${gymData.subdomain}.gym`;
      const ownerPassword = adminData.password || 'Manager@1234';
      const passwordHash = await bcrypt.hash(ownerPassword, 12);

      const gymResult = await client.query(
        `INSERT INTO gyms (id, name, subdomain, plan_tier, is_active, currency, timezone, created_at)
         VALUES ($1, $2, $3, 'basic', true, $4, $5, NOW())
         RETURNING id, name, subdomain`,
        [
          uuidv4(),
          gymData.name,
          gymData.subdomain || gymData.name?.replace(/\s+/g, '-').toLowerCase(),
          gymData.currency || configData.default_currency || 'EGP',
          configData.default_timezone || 'Africa/Cairo',
        ]
      );
      const gym = gymResult.rows[0];
      gymId = gym.id;

      // ── 2. Create the founding manager ─────────────────────────
      await client.query(
        `INSERT INTO staff_users (id, gym_id, email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'manager', true)`,
        [uuidv4(), gym.id, ownerEmail, passwordHash, ownerFullName]
      );

      // ── 3. Seed the default membership-offer catalog ────────────
      // Catalog data a gym needs to operate from day one: without it
      // createMember(plan_id) can never succeed, members can never hold
      // a subscription, and manual check-in is blocked ("no active
      // subscription found"). Demo members/products are intentionally
      // NOT seeded here — factory-fresh gyms stay clean.
      const { seedDefaultOffers } = await import('../seed/seedNewGym');
      await seedDefaultOffers(client, gym.id);

      // ── 4. Activity log ─────────────────────────────────────────
      await client.query(
        `INSERT INTO activity_logs (gym_id, staff_user_id, platform_admin_id, action_description, ip_address)
         VALUES ($1, NULL, $2, $3, $4)`,
        [gym.id, adminId, `🏋️ Gym created via onboarding: ${gym.name}`, req.ip]
      );
    }

    // ── 5. Save platform settings ────────────────────────────────
    const settingsToSave: Record<string, unknown> = {};
    if (configData.platform_name) settingsToSave.platform_name = configData.platform_name;
    if (configData.default_currency) settingsToSave.default_currency = configData.default_currency;
    if (configData.default_timezone) settingsToSave.default_timezone = configData.default_timezone;
    if (configData.vat_percentage) settingsToSave.vat_percentage = configData.vat_percentage;
    if (configData.support_email) settingsToSave.support_email = configData.support_email;

    for (const [key, value] of Object.entries(settingsToSave)) {
      await client.query(
        `INSERT INTO platform_settings (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
    }

    // ── 6. Mark onboarding complete ──────────────────────────────
    const existingData = (await query(
      `SELECT onboarding_data FROM platform_admins WHERE id = $1`,
      [adminId]
    )).rows[0]?.onboarding_data || {};

    const mergedData = scrubSecrets({
      ...existingData,
      ...(final_data || {}),
      completed_at: new Date().toISOString(),
      created_gym_id: gymId,
    });

    await query(
      `UPDATE platform_admins SET onboarding_complete = true, onboarding_step = 5, onboarding_data = $1 WHERE id = $2`,
      [JSON.stringify(mergedData), adminId]
    );

    await client.query('COMMIT');

    res.json({
      data: {
        onboarding_complete: true,
        gym_id: gymId,
        message: gymId
          ? 'Onboarding completed successfully – gym created'
          : 'Onboarding completed successfully (no gym data provided)',
      },
    });
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    const error = err as { code?: string; message: string };
    logger.error('completeOnboarding failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * GET /platform/settings
 * Returns platform-level settings
 */
export async function getPlatformSettings(req: Request, res: Response) {
  try {
    const result = await query(`SELECT key, value FROM platform_settings ORDER BY key`);
    const settings: Record<string, unknown> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    res.json({ data: settings });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}

/**
 * PUT /platform/settings
 * Updates platform-level settings
 */
export async function updatePlatformSettings(req: Request, res: Response) {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    res.status(400).json({ error: 'settings object is required' });
    return;
  }

  try {
    const client = await getAdminClient();
    try {
      await client.query('BEGIN');

      for (const [key, value] of Object.entries(settings)) {
        await client.query(
          `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
          [key, JSON.stringify(value)]
        );
      }

      await client.query('COMMIT');
      res.json({ data: { message: 'Settings updated', updated_keys: Object.keys(settings) } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const msg = (err as Error).message;
    res.status(500).json({ error: msg });
  }
}
