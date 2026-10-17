import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/node';
import { getAdminClient, query } from '../config/database';
import logger from '../config/logger';
import { logPlatformAudit } from '../utils/platformAudit';
import { seedFactoryCatalog } from '../seed/seedNewGym';

const JWT_SECRET = process.env.JWT_SECRET as string;

/** Safely extract error message from unknown error type */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ====================================================================
// Create a new gym (tenant) + its first owner account, atomically
// Accepts optional extended fields from the Create Gym Wizard:
//   dba_name, phone, address_street,
//   address_state, address_country, timezone,
//   date_format, time_format, first_day_of_week, language,
//   logo_url
// ====================================================================
export const createGym = async (req: Request, res: Response): Promise<void> => {
  const {
    gym_name, subdomain, owner_email, owner_password, owner_full_name, plan_tier,
    contact_email, gym_email, phone, password, billing_cycle, plan_id, currency, timezone, logo_url,
    dba_name, address_street, address_city,
    address_state, address_zip, address_country,
    date_format, time_format, first_day_of_week, language,
    units_system, subscription_expires_at, is_active,
  } = req.body;

  if (!gym_name || !subdomain || !owner_email || !owner_password || !owner_full_name) {
    res.status(400).json({
      error: 'gym_name, subdomain, owner_email, owner_password and owner_full_name are all required.',
    });
    return;
  }

  if (owner_password.length < 8) {
    res.status(400).json({ error: 'owner_password must be at least 8 characters.' });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(owner_email)) {
    res.status(400).json({ error: 'owner_email must be a valid email address.' });
    return;
  }

  const client = await getAdminClient();
  try {
    await client.query('BEGIN');

    const resolvedPlanId = plan_id || null;
    let resolvedPlanTier = plan_tier || 'basic';
    let resolvedSubscriptionExpiresAt: string | null = null;

    if (resolvedPlanId) {
      const planResult = await client.query(
        `SELECT name, price_monthly, price_yearly FROM billing_plans WHERE id = $1`,
        [resolvedPlanId]
      );
      if (planResult.rows.length > 0) {
        resolvedPlanTier = planResult.rows[0].name.toLowerCase();
        const now = new Date();
        if (billing_cycle === 'yearly') {
          now.setFullYear(now.getFullYear() + 1);
        } else {
          now.setMonth(now.getMonth() + 1);
        }
        resolvedSubscriptionExpiresAt = now.toISOString();
      }
    } else if (billing_cycle) {
      const now = new Date();
      if (billing_cycle === 'yearly') {
        now.setFullYear(now.getFullYear() + 1);
      } else {
        now.setMonth(now.getMonth() + 1);
      }
      resolvedSubscriptionExpiresAt = now.toISOString();
    }

    // An explicitly chosen expiry date (wizard) wins over the computed default.
    if (subscription_expires_at) {
      resolvedSubscriptionExpiresAt = subscription_expires_at;
    }

    const passwordHash = await bcrypt.hash(owner_password, 12);

    const gymResult = await client.query(
      `INSERT INTO gyms (
        name, subdomain, plan_tier, is_active, plan_id,
        email, dba_name, phone, address_street, address_city, address_state, address_zip, address_country, timezone,
        date_format, time_format, first_day_of_week, language,
        logo_url, currency, subscription_status, subscription_expires_at
       ) VALUES (
        $1, $2, $3, $18::boolean, $4,
        $19, $5, $6, $7, $20, $8, $21, $9, $10,
        $11, $12, $13, $14,
        $15, $16, 'active', $17
       )
       RETURNING id, name, subdomain, plan_tier, is_active, created_at,
                 plan_id, email, dba_name, phone, address_street, address_city,
                 address_state, address_zip, address_country, timezone,
                 date_format, time_format, first_day_of_week, language,
                 logo_url, currency, subscription_expires_at`,
      [
        gym_name, subdomain, resolvedPlanTier, resolvedPlanId,
        dba_name || null, phone || null,
        address_street || null, address_state || null,
        address_country || 'Egypt',
        timezone || 'Africa/Cairo', date_format || 'DD/MM/YYYY',
        time_format || '12h', first_day_of_week || 'Sunday',
        language || 'ar', logo_url || null,
        currency || 'EGP', resolvedSubscriptionExpiresAt,
        is_active !== false,
        // §33-توحيد: بريد الصالة وعنوانها يخزنان فعليًا (كان المعالج يجمعهما والسيرفر يتجاهلهما)
        gym_email || contact_email || owner_email || null,
        address_city || null,
        address_zip || null,
      ]
    );
    const gym = gymResult.rows[0];

    const ownerResult = await client.query(
      `INSERT INTO staff_users (gym_id, email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, 'manager', true)
       RETURNING id, email, full_name, role`,
      [gym.id, owner_email, passwordHash, owner_full_name]
    );
    const owner = ownerResult.rows[0];

    await client.query(
      `INSERT INTO tenants (gym_name, subdomain, plan_id, billing_cycle, status, subscription_expires_at, is_active, created_at)
       VALUES ($1, $2, $3, $4, 'active', $5, true, $6)`,
      [gym.name, gym.subdomain, resolvedPlanId, billing_cycle || 'monthly', resolvedSubscriptionExpiresAt, gym.created_at]
    );

    await client.query(
      `INSERT INTO gym_usage_counters (gym_id, current_members_count, current_staff_count, current_branches_count, updated_at)
       VALUES ($1, 0, 0, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (gym_id) DO NOTHING`,
      [gym.id]
    );

    await client.query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, platform_admin_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [gym.id, null, req.platformAdmin?.platform_admin_id, `Gym created: ${gym.name} — owner: ${owner.email}`, req.ip]
    );

    // §55 — كتالوج اليوم صفر (الألعاب + العروض الأربعة) داخل نفس الـtransaction:
    // صالة بلا عروض لا تسجّل عضوًا على باقة ولا تعمل check-in. الفشل هنا يلفّ
    // الإنشاء كله بدل بذرة خلفية تبتلع خطأها بصمت.
    await seedFactoryCatalog(client, gym.id);

    await client.query('COMMIT');

    // Fire-and-forget onboarding webhook trigger log
    logger.info('Onboarding webhook trigger', {
      gym_id: gym.id,
      gym_name: gym.name,
      subdomain: gym.subdomain,
      owner_email: owner.email,
      owner_name: owner.full_name,
      plan_tier: resolvedPlanTier,
      subscription_expires_at: resolvedSubscriptionExpiresAt,
    });

    await logPlatformAudit({ action: 'CREATE', tableName: 'gyms', recordId: gym.id, newValues: { gym, owner }, req });
    res.status(201).json({ data: { gym, owner } });
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    const pgError = error as { code?: string; constraint?: string; message: string };
    if (pgError.code === '23505') {
      res.status(400).json({ error: 'A gym with this subdomain (or owner email) already exists.' });
      return;
    }
    logger.error('createGym failed', { error: pgError.message });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// List all gyms (platform-wide directory)
// §40: فلاتر حقيقية (بحث/خطة/حالة) + ترقيم + أعمدة العقد الفعلي
// (plan/سعر/تجديد/ميزات سارية) بدل plan_tier القديم وحده.
// ====================================================================
export const listGyms = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { search, plan_id: planId, status, sort } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 500, 1), 1000);
    const offset = Math.max(parseInt(String(req.query.offset), 10) || 0, 0);

    const clauses: string[] = ['g.deleted_at IS NULL'];
    const params: unknown[] = [];
    const push = (v: unknown): number => { params.push(v); return params.length; };
    if (search) {
      const i = push(`%${search}%`);
      clauses.push(`(g.name ILIKE $${i} OR g.subdomain ILIKE $${i} OR g.phone ILIKE $${i} OR g.email ILIKE $${i})`);
    }
    if (planId) clauses.push(`g.plan_id = $${push(planId)}`);
    if (status === 'active') clauses.push(`g.is_active = true`);
    else if (status === 'suspended') clauses.push(`g.is_active = false`);
    else if (status === 'trial') clauses.push(`EXISTS (SELECT 1 FROM gym_trials t WHERE t.gym_id = g.id AND t.trial_end > now())`);
    else if (status === 'expired') clauses.push(`g.subscription_expires_at IS NOT NULL AND g.subscription_expires_at < now()`);

    const order = ['name', 'created_at', 'members', 'renewal_date'].includes(String(sort))
      ? { name: 'g.name ASC', created_at: 'g.created_at DESC', members: 'active_members_count DESC', renewal_date: 'c.renewal_date ASC NULLS LAST' }[String(sort)]
      : 'g.created_at DESC';

    // Aggregates active member count per gym and exposes subscription expiry
    // so the super-admin directory has billing-relevant data without leaking
    // individual member/staff details.
    const result = await client.query(
      `SELECT g.id, g.name, g.subdomain, g.plan_tier, g.is_active,
              g.created_at, g.subscription_expires_at, g.currency,
              g.phone, g.dba_name, g.timezone, g.email, g.address_city,
              g.address_street, g.address_country,
              g.tenant_status, g.subscription_status,
              g.plan_id, p.name AS plan_name,
              c.id AS contract_id, c.status AS contract_status, c.cycle AS contract_cycle,
              c.price AS contract_price, c.currency AS contract_currency,
              c.renewal_date AS contract_renewal_date, c.auto_renew,
              gym_effective_features(g.id) AS effective_features,
              gym_effective_limit(g.id, 'max_members') AS effective_max_members,
              gym_effective_limit(g.id, 'max_staff') AS effective_max_staff,
              (SELECT count(*)::int FROM platform_contract_addons pca
                JOIN platform_contracts c2 ON c2.id = pca.contract_id
               WHERE c2.gym_id = g.id AND pca.status = 'active' AND c2.status = 'active') AS live_addon_items,
              (t.trial_end IS NOT NULL AND t.trial_end > now()) AS on_trial, t.trial_end,
              (SELECT MAX(al.check_in_time) FROM attendance_logs al WHERE al.gym_id = g.id) AS last_activity_at,
              COALESCE(uc.current_members_count, 0) AS active_members_count,
              COALESCE(uc.current_staff_count, 0) AS active_staff_count,
              COALESCE(uc.current_branches_count, 0) AS active_branches_count,
              COALESCE(p.max_members, 0) AS plan_max_members,
              COALESCE(p.max_employees, 0) AS plan_max_employees,
              COALESCE(p.max_branches, 0) AS plan_max_branches
         FROM gyms g
         LEFT JOIN gym_usage_counters uc ON uc.gym_id = g.id
         LEFT JOIN billing_plans p ON p.id = gym_plan_id_effective(g.id)
         LEFT JOIN platform_contracts c ON c.gym_id = g.id AND c.status = 'active'
         LEFT JOIN gym_trials t ON t.gym_id = g.id
         WHERE ${clauses.join(' AND ')}
      ORDER BY ${order}
      LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const count = await client.query(
      `SELECT count(*)::int AS total FROM gyms g WHERE ${clauses.join(' AND ')}`,
      params
    );
    await client.query('COMMIT');
    res.json({ data: result.rows, total: count.rows[0].total, limit, offset });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listGyms failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// Get a single gym by ID (for handover / detail view)
// ====================================================================
export const getGym = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const client = await getAdminClient();
  try {
     const result = await client.query(
       `SELECT g.id, g.name, g.subdomain, g.plan_tier, g.is_active,
               g.created_at, g.subscription_expires_at, g.currency,
               g.phone, g.email, g.address_city, g.address_country,
               g.address_street, g.address_state, g.address_zip,
               g.timezone, g.language, g.logo_url, g.dba_name,
               g.date_format, g.time_format, g.first_day_of_week,
               g.plan_id, p.name AS plan_name, p.price_monthly, p.price_yearly,
               (SELECT COUNT(*)::int
                FROM members m
                WHERE m.gym_id = g.id
                  AND m.is_blacklisted = false) AS active_members_count,
               (SELECT COUNT(*)::int
                FROM staff_users s
                WHERE s.gym_id = g.id AND s.is_active = true) AS active_staff_count,
               (SELECT su.full_name FROM staff_users su
                WHERE su.gym_id = g.id AND su.role = 'manager'
                ORDER BY su.created_at ASC
                LIMIT 1) AS owner_full_name,
               (SELECT su.email FROM staff_users su
                WHERE su.gym_id = g.id AND su.role = 'manager'
                ORDER BY su.created_at ASC
                LIMIT 1) AS owner_email
        FROM gyms g
        LEFT JOIN billing_plans p ON p.id = g.plan_id
        WHERE g.id = $1`,
      [id]
    );

    await client.query('COMMIT');

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Gym not found.' });
      return;
    }

    // Get gym brand config / extended settings if any.
    // The gym_config table may not exist in all environments, so we
    // guard this lookup and fall back to defaults if it's unavailable.
    let config: Record<string, unknown> = {};
    try {
      const configResult = await client.query(
        `SELECT theme_color, accent_color, font_family, custom_domain, mobile_app_enabled, website_enabled
         FROM gym_config WHERE gym_id = $1`,
        [id]
      );
      config = configResult.rows[0] || {};
    } catch {
      config = {};
    }

    const gym = result.rows[0];

    res.json({
      data: {
        ...gym,
        theme_color: config.theme_color || '#114b5f',
        accent_color: config.accent_color || '#06b6d4',
        custom_domain: config.custom_domain || null,
        mobile_app_enabled: config.mobile_app_enabled || false,
        website_enabled: config.website_enabled || false,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('getGym failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// Suspend / reactivate a gym
// ====================================================================
export const setGymActive = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean') {
    res.status(400).json({ error: 'is_active (boolean) is required.' });
    return;
  }

  const client = await getAdminClient();
  try {
    const result = await client.query(
      `UPDATE gyms SET is_active = $1 WHERE id = $2 RETURNING id, name, is_active`,
      [is_active, id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(404).json({ error: 'Gym not found.' });
      return;
    }

    await client.query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, platform_admin_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, null, req.platformAdmin?.platform_admin_id, `Gym ${is_active ? 'reactivated' : 'suspended'}`, req.ip]
    );

    await client.query('COMMIT');
    await logPlatformAudit({
      action: is_active ? 'ACTIVATE' : 'DEACTIVATE', tableName: 'gyms', recordId: id,
      newValues: result.rows[0], req,
    });
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('setGymActive failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// Update a gym's subscription plan & expiry date
// ====================================================================
export const updateGymSubscription = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { plan_tier, plan_id, subscription_expires_at } = req.body;

  const VALID_TIERS = ['basic', 'professional', 'premium', 'enterprise'];

  if (plan_tier && !VALID_TIERS.includes(plan_tier)) {
    res.status(400).json({ error: `plan_tier must be one of: ${VALID_TIERS.join(', ')}` });
    return;
  }
  if (subscription_expires_at && isNaN(Date.parse(subscription_expires_at))) {
    res.status(400).json({ error: 'subscription_expires_at must be a valid ISO date.' });
    return;
  }
  if (!plan_tier && !plan_id && !subscription_expires_at) {
    res.status(400).json({ error: 'At least one of plan_id, plan_tier or subscription_expires_at is required.' });
    return;
  }

  const client = await getAdminClient();
  try {
    // §33-توحيد: plan_id هو مصدر الحقيقة؛ plan_tier صار مرآة DB-maintained.
    // المعالج القديم الذي يرسل plan_tier فقط لا يزال مدعومًا — الـtrigger
    // يربطه بالخطة المناسبة تلقائيًا.
    let resolvedPlanId: string | null = plan_id || null;
    if (plan_id) {
      const planCheck = await client.query('SELECT id FROM billing_plans WHERE id = $1', [plan_id]);
      if (planCheck.rows.length === 0) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(400).json({ error: 'plan_id does not reference an existing billing plan.' });
        return;
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (resolvedPlanId) {
      sets.push(`plan_id = $${idx++}`);
      params.push(resolvedPlanId);
    } else if (plan_tier) {
      sets.push(`plan_tier = $${idx++}`);
      params.push(plan_tier);
    }
    if (subscription_expires_at) {
      sets.push(`subscription_expires_at = $${idx++}`);
      params.push(subscription_expires_at);
    }

    const result = await client.query(
      `UPDATE gyms SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, name, plan_tier, plan_id, subscription_expires_at, is_active, created_at`,
      [...params, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(404).json({ error: 'Gym not found.' });
      return;
    }

    const gym = result.rows[0];
    const changes = [resolvedPlanId || plan_tier ? `plan → ${resolvedPlanId || plan_tier}` : '', subscription_expires_at ? `expires → ${subscription_expires_at}` : ''].filter(Boolean).join(', ');

    await client.query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, platform_admin_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, null, req.platformAdmin?.platform_admin_id, `Subscription updated: ${changes}`, req.ip]
    );

    await client.query('COMMIT');
    await logPlatformAudit({ action: 'UPDATE', tableName: 'gyms', recordId: id, newValues: { changes, ...gym }, req });
    res.json({ data: gym });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateGymSubscription failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// Full gym update (edit mode) — updates all editable fields including
// name, contact info, address, localization, branding, subscription.
// Used by the super-admin "Edit Gym" flow (CreateGymWizard in edit mode).
// ====================================================================
export const updateGymFull = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const {
    gym_name, dba_name, phone, gym_email, address_street, address_city,
    address_state, address_zip, address_country, timezone,
    date_format, time_format, first_day_of_week, language,
    units_system, logo_url, currency,
    plan_tier, subscription_expires_at, is_active,
  } = req.body;

  const client = await getAdminClient();
  try {
    // Verify gym exists
    const existing = await client.query('SELECT id FROM gyms WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(404).json({ error: 'Gym not found.' });
      return;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const add = (col: string, val: unknown) => {
      if (val !== undefined) {
        sets.push(`${col} = $${idx++}`);
        params.push(val);
      }
    };

    add('name', gym_name);
    add('dba_name', dba_name);
    add('phone', phone);
    add('email', gym_email);
    add('address_street', address_street);
    add('address_city', address_city);
    add('address_state', address_state);
    add('address_zip', address_zip);
    add('address_country', address_country);
    add('timezone', timezone);
    add('date_format', date_format);
    add('time_format', time_format);
    add('first_day_of_week', first_day_of_week);
    add('language', language);
    add('logo_url', logo_url);
    add('currency', currency);
    add('plan_tier', plan_tier);
    add('subscription_expires_at', subscription_expires_at);
    if (is_active !== undefined) add('is_active', is_active);

    if (sets.length === 0) {
      res.status(400).json({ error: 'No fields provided to update.' });
      return;
    }

     const result = await client.query(
       `UPDATE gyms SET ${sets.join(', ')} WHERE id = $${idx}
        RETURNING id, name, subdomain, plan_tier, plan_id, is_active, subscription_expires_at,
                  dba_name, phone, email, address_street, address_city, address_state, address_zip, address_country,
                  timezone, language, logo_url, currency`,
      [...params, id]
    );

    await client.query('COMMIT');
    await logPlatformAudit({ action: 'UPDATE', tableName: 'gyms', recordId: id, newValues: result.rows[0], req });
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateGymFull failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// Delete a gym — soft delete (archive). Super-admin only.
// A hard `DELETE FROM gyms` cascades into staff_users, while `activity_logs`
// keeps an immutable audit trail: its FK to staff_users is RESTRICT and the
// append-only trigger raises TABLE_IS_IMMUTABLE, so any gym whose manager has
// ever signed in could never be removed — pg error 23503 escaped as a bare
// 500 "Internal server error". Archiving gives the console the same outcome
// without breaking audit: `listGyms` already filters `deleted_at IS NULL`,
// and deactivating the staff accounts blocks both `/auth/login` and `/auth/me`
// (auth.ts rejects `!is_active`), so the tenant is unreachable immediately.
// Requires the explicit "DELETE" confirmation string in the body.
// ====================================================================
export const deleteGym = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { confirmation } = req.body;

  // Safety: require explicit confirmation string to prevent accidental deletes
  if (confirmation !== 'DELETE') {
    res.status(400).json({ error: 'Confirmation string "DELETE" is required to delete a gym.' });
    return;
  }

  const client = await getAdminClient();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id, name, deleted_at FROM gyms WHERE id = $1', [id]);
    // An archived gym is invisible to the console, so re-deleting it is a 404.
    if (existing.rows.length === 0 || existing.rows[0].deleted_at) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Gym not found.' });
      return;
    }
    const gymName = existing.rows[0].name;

    await client.query(
      'UPDATE gyms SET deleted_at = CURRENT_TIMESTAMP, is_active = false WHERE id = $1',
      [id],
    );
    const staffResult = await client.query(
      'UPDATE staff_users SET is_active = false WHERE gym_id = $1 AND is_active = true',
      [id],
    );
    await client.query('COMMIT');
    await logPlatformAudit({
      action: 'DELETE',
      tableName: 'gyms',
      recordId: id,
      oldValues: existing.rows[0],
      newValues: { archived: true, staff_deactivated: staffResult.rowCount ?? 0 },
      req,
    });

    // Shape kept identical to the old hard-delete reply so `deleteGym()` in
    // src/services/api.ts and the TenantDirectory mutation need no change.
    res.json({ data: { id, name: gymName, deleted: true } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('deleteGym failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// Impersonate a gym — generates a staff JWT for the gym owner
// ====================================================================
export const impersonateGym = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const client = await getAdminClient();
  try {
    // Find the gym's founding manager (earliest manager account)
    const ownerResult = await client.query(
      `SELECT id, gym_id, email, full_name, role FROM staff_users
       WHERE gym_id = $1 AND role = 'manager' AND is_active = true
       ORDER BY created_at ASC
       LIMIT 1`,
      [id]
    );

    if (ownerResult.rows.length === 0) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(404).json({ error: 'No active manager found for this gym.' });
      return;
    }

    const owner = ownerResult.rows[0];

    // Generate JWT with the gym owner's identity (use actual role from DB)
    const tokenPayload = {
      staff_user_id: owner.id,
      gym_id: owner.gym_id,
      role: owner.role,
      type: 'staff_user',
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '4h' });

    // Log the impersonation
    await client.query(
      `INSERT INTO activity_logs (gym_id, platform_admin_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [id, req.platformAdmin?.platform_admin_id, `Super Admin impersonated gym: ${owner.full_name} (${owner.email})`, req.ip]
    );
    await client.query('COMMIT');
    await logPlatformAudit({ action: 'IMPERSONATE', tableName: 'gyms', recordId: id, newValues: { staff_user_id: owner.id, email: owner.email, role: owner.role }, req });

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 4 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      data: {
        gym_id: owner.gym_id,
        user: { id: owner.id, email: owner.email, full_name: owner.full_name, role: owner.role },
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('impersonateGym failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// Check subdomain availability for Add Gym wizard
// ====================================================================
export const checkSubdomainAvailability = async (req: Request, res: Response): Promise<void> => {
  const { subdomain } = req.query;
  if (!subdomain || typeof subdomain !== 'string') {
    res.status(400).json({ error: 'subdomain query param is required.' });
    return;
  }
  const normalized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 100);
  if (!normalized) {
    res.status(400).json({ error: 'Invalid subdomain format.' });
    return;
  }
  const client = await getAdminClient();
  try {
    const result = await client.query('SELECT id FROM gyms WHERE subdomain = $1', [normalized]);
    await client.query('COMMIT');
    res.json({ data: { available: result.rows.length === 0, subdomain: normalized } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('checkSubdomainAvailability failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// Gym Settings (for super admin – operates on any gym by :id)
// ====================================================================

export const getGymSettings = async (req: Request, res: Response) => {
  const gym_id = req.params.id;
  try {
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
  } catch (e: any) { logger.error('getGymSettings failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const updateGymSettings = async (req: Request, res: Response) => {
  const gym_id = req.params.id;
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
    await logPlatformAudit({ action: 'SETTINGS_UPDATE', tableName: 'gyms', recordId: gym_id, newValues: settings, req });
    res.json({ success: true });
  } catch (e: any) { logger.error('updateGymSettings failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};
