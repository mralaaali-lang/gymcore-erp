import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * §40 — رؤى المنصة الحية للوحة السوبر-أدمان: كل رقم هنا من استعلام فعلي،
 * لا تقديرات ولا قيم افتراضية (قاعدة «لا أوهام في الشاشة»).
 */

// ====================================================================
// GET /overview — مؤشرات المنصة + أهم الأحداث الجارية
// ====================================================================
export const getPlatformOverview = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const [
      gymCounts, trialCounts, newGyms, mrr, expiringSoon, liveItems,
      tickets, enforcement, invoices, contracts,
    ] = await Promise.all([
      client.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE is_active)::int AS active,
                count(*) FILTER (WHERE NOT is_active)::int AS suspended
         FROM gyms WHERE deleted_at IS NULL`
      ),
      client.query(
        `SELECT count(*)::int AS on_trial
         FROM gym_trials WHERE trial_end > now()
           AND gym_id IN (SELECT id FROM gyms WHERE deleted_at IS NULL)`
      ),
      client.query(
        `SELECT count(*)::int AS new_this_month
         FROM gyms WHERE deleted_at IS NULL AND created_at >= date_trunc('month', now())`
      ),
      // MRR: العقود والبنود السارية — السنوي يُقْسَم على 12، مجمّعة لكل عملة
      client.query(
        `SELECT currency, round(sum(mrr), 2) AS mrr FROM (
           SELECT c.currency, c.price / 12.0 AS mrr
             FROM platform_contracts c WHERE c.status = 'active' AND c.cycle = 'yearly'
           UNION ALL
           SELECT c.currency, c.price
             FROM platform_contracts c WHERE c.status = 'active' AND c.cycle = 'monthly'
           UNION ALL
           SELECT c.currency, (pca.unit_price * pca.quantity) / 12.0
             FROM platform_contract_addons pca
             JOIN platform_contracts c ON c.id = pca.contract_id
            WHERE pca.status = 'active' AND c.status = 'active' AND pca.cycle = 'yearly'
           UNION ALL
           SELECT c.currency, (pca.unit_price * pca.quantity)
             FROM platform_contract_addons pca
             JOIN platform_contracts c ON c.id = pca.contract_id
            WHERE pca.status = 'active' AND c.status = 'active' AND pca.cycle = 'monthly'
         ) m GROUP BY currency`
      ),
      client.query(
        `SELECT count(*)::int AS renewals_due_7d
         FROM platform_contracts
         WHERE status = 'active' AND renewal_date IS NOT NULL
           AND renewal_date <= CURRENT_DATE + 7`
      ),
      client.query(
        `SELECT count(*)::int AS live_items,
                coalesce(sum(pca.unit_price * pca.quantity), 0)::numeric(12,2) AS items_month_total
         FROM platform_contract_addons pca
         JOIN platform_contracts c ON c.id = pca.contract_id
         WHERE pca.status = 'active' AND c.status = 'active' AND pca.cycle = 'monthly'`
      ),
      client.query(
        `SELECT count(*)::int AS open_tickets
         FROM support_tickets WHERE status IN ('open', 'in_progress')`
      ),
      client.query(
        `SELECT count(*)::int AS enforcement_actioned,
                count(*) FILTER (WHERE tenant_status <> 'active' OR subscription_status <> 'active')::int AS non_active_gyms
         FROM gyms
         WHERE deleted_at IS NULL
           AND (is_active = false
                OR tenant_status <> 'active'
                OR subscription_status <> 'active'
                OR (subscription_expires_at IS NOT NULL AND subscription_expires_at < now()))`
      ),
      client.query(
        `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending_invoices,
                coalesce(sum(total_amount) FILTER (WHERE status = 'pending'), 0)::numeric(12,2) AS pending_amount,
                count(*) FILTER (WHERE status = 'overdue')::int AS overdue_invoices,
                coalesce(sum(total_amount) FILTER (WHERE status = 'overdue'), 0)::numeric(12,2) AS overdue_amount
         FROM billing_invoices
         WHERE deleted_at IS NULL AND contract_id IS NOT NULL AND member_id IS NULL
           AND status IN ('pending', 'overdue')`
      ),
      client.query(
        `SELECT count(*)::int AS active_contracts
         FROM platform_contracts WHERE status = 'active'`
      ),
    ]);

    // كروت الأحداث: تجديدات قادمة + آخر إيقافات تلقائية + تذاكر مفتوحة حديثة
    const renewals = await client.query(
      `SELECT c.id, c.renewal_date, c.cycle, c.price, c.currency,
              g.id AS gym_id, g.name AS gym_name, g.subdomain
       FROM platform_contracts c JOIN gyms g ON g.id = c.gym_id
       WHERE c.status = 'active' AND c.renewal_date IS NOT NULL
         AND c.renewal_date <= CURRENT_DATE + 14
       ORDER BY c.renewal_date ASC LIMIT 8`
    );
    const suspensions = await client.query(
      `SELECT al.gym_id, g.name AS gym_name, al.action_description, al.created_at
       FROM activity_logs al JOIN gyms g ON g.id = al.gym_id
       WHERE al.ip_address = 'system'
       ORDER BY al.created_at DESC LIMIT 5`
    );
    const openTicketRows = await client.query(
      `SELECT st.id, st.ticket_number, st.subject, st.priority, st.status, st.created_at,
              g.name AS gym_name
       FROM support_tickets st LEFT JOIN gyms g ON g.id = st.gym_id
       WHERE st.status IN ('open', 'in_progress')
       ORDER BY CASE st.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                st.created_at ASC LIMIT 5`
    );

    res.json({
      data: {
        gyms: { ...gymCounts.rows[0], ...trialCounts.rows[0], ...newGyms.rows[0] },
        billing: {
          active_contracts: contracts.rows[0].active_contracts,
          mrr_by_currency: mrr.rows,
          renewals_due_7d: expiringSoon.rows[0].renewals_due_7d,
          live_items: liveItems.rows[0].live_items,
          items_month_total: liveItems.rows[0].items_month_total,
          ...invoices.rows[0],
        },
        operations: {
          open_tickets: tickets.rows[0].open_tickets,
          ...enforcement.rows[0],
        },
        feeds: {
          renewals_next_14d: renewals.rows,
          last_system_actions: suspensions.rows,
          open_tickets_recent: openTicketRows.rows,
        },
      },
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('getPlatformOverview failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// GET /enforcement — قائمة الصالات غير النشطة/منتهية + آخر إجراء لكل صالة
// ====================================================================
export const listEnforcementQueue = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const r = await client.query(
      `SELECT g.id, g.name, g.subdomain, g.is_active, g.tenant_status, g.subscription_status,
              g.subscription_expires_at,
              (g.subscription_expires_at IS NOT NULL AND g.subscription_expires_at < now()) AS expired,
              (SELECT max(al.created_at) FROM activity_logs al
                WHERE al.gym_id = g.id AND al.ip_address = 'system') AS last_system_action,
              (SELECT al.action_description FROM activity_logs al
                WHERE al.gym_id = g.id AND al.ip_address = 'system'
                ORDER BY al.created_at DESC LIMIT 1) AS last_system_note,
              c.id AS contract_id, c.status AS contract_status, c.cycle, c.price, c.currency,
              p.name AS plan_name,
              (SELECT count(*)::int FROM members m WHERE m.gym_id = g.id AND m.deleted_at IS NULL) AS member_count
       FROM gyms g
       LEFT JOIN platform_contracts c ON c.gym_id = g.id AND c.status = 'active'
       LEFT JOIN billing_plans p ON p.id = coalesce(c.plan_id, g.plan_id)
       WHERE g.deleted_at IS NULL
         AND (g.is_active = false
              OR g.tenant_status <> 'active'
              OR g.subscription_status <> 'active'
              OR (g.subscription_expires_at IS NOT NULL AND g.subscription_expires_at < now()))
       ORDER BY g.subscription_expires_at ASC NULLS LAST, g.name ASC
       LIMIT 200`
    );
    res.json({ data: r.rows });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listEnforcementQueue failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};

// ====================================================================
// GET /security/audit — platform_audit_logs (الكاتب الحقيقي الجديد)
// ====================================================================
export const listPlatformAuditLogs = async (req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const { action, table_name: tableName, gym_id: gymId, from, to, search } = req.query;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset), 10) || 0, 0);

    const clauses: string[] = [];
    const params: unknown[] = [];
    const push = (v: unknown): number => { params.push(v); return params.length; };
    if (action) { clauses.push(`pal.action_type = $${push(String(action))}`); }
    if (tableName) { clauses.push(`pal.table_name = $${push(String(tableName))}`); }
    if (gymId) {
      const i = push(String(gymId));
      clauses.push(`pal.record_id IN (
          SELECT $${i}::uuid
          UNION SELECT c.id FROM platform_contracts c WHERE c.gym_id = $${i}
          UNION SELECT pca.id FROM platform_contract_addons pca
              JOIN platform_contracts c2 ON c2.id = pca.contract_id WHERE c2.gym_id = $${i}
          UNION SELECT bi.id FROM billing_invoices bi WHERE bi.gym_id = $${i})`);
    }
    if (from) { clauses.push(`pal.created_at >= $${push(String(from))}::date`); }
    if (to) { clauses.push(`pal.created_at < ($${push(String(to))}::date + INTERVAL '1 day')`); }
    if (search) {
      const i = push(`%${String(search)}%`);
      clauses.push(`(pal.action_type ILIKE $${i} OR pal.table_name ILIKE $${i} OR pa.email ILIKE $${i})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = await client.query(
      `SELECT pal.id, pal.actor_id, pa.email AS actor_email,
              pal.action_type, pal.table_name, pal.record_id,
              pal.old_values, pal.new_values, pal.ip_address, pal.user_agent, pal.created_at
       FROM platform_audit_logs pal
       LEFT JOIN platform_admins pa ON pa.id = pal.actor_id
       ${where}
       ORDER BY pal.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const count = await client.query(
      `SELECT count(*)::int AS total FROM platform_audit_logs pal
       LEFT JOIN platform_admins pa ON pa.id = pal.actor_id ${where}`,
      params
    );
    res.json({ data: rows.rows, total: count.rows[0].total, limit, offset });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listPlatformAuditLogs failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
};
