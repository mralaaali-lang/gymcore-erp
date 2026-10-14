import { Request } from 'express';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';

/**
 * §40: سجل تدقيق المنصة — الكتابة الوحيدة المعتمدة إلى platform_audit_logs.
 * كل mutation إدارية (عقود/صالات/أدمنين/كتالوج/أمان/تذاكر/بث) تُسجَّل هنا
 * بفاعل حقيقي من req.platformAdmin؛ أحداث النظام (cron/backfill) بفاعل NULL.
 * الفشل هنا لا يُسقط الطلب الأساسي أبدًا (best-effort + log).
 */

export type PlatformAuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'DEACTIVATE' | 'ACTIVATE' | 'CANCEL'
  | 'RENEW' | 'IMPERSONATE' | 'ISSUE' | 'MARK_PAID' | 'GRANT' | 'REVOKE'
  | 'LOGIN' | 'LOGOUT' | '2FA_ENABLE' | '2FA_DISABLE' | 'SETTINGS_UPDATE'
  | 'FEATURE_FLAG_UPDATE' | 'BROADCAST' | 'TICKET_UPDATE';

interface AuditEntry {
  action: PlatformAuditAction;
  tableName: string;
  recordId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  /** بديل لفاعل req عند أحداث النظامية؛ NULL = system */
  actorId?: string | null;
  req?: Request;
}

function clientIp(req?: Request): string | null {
  if (!req) return null;
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.ip ?? null;
}

function userAgent(req?: Request): string | null {
  return req?.headers['user-agent'] ?? null;
}

function actorFromReq(req?: Request): string | null {
  return req?.platformAdmin?.platform_admin_id ?? null;
}

/** حقل inet صحيح أو NULL — أي قيمة غير قابلة للتمثيل تُسقط بصمت بدل تفجير السجل. */
function safeInet(ip: string | null): string | null {
  if (!ip) return null;
  const v = ip.replace(/^::ffff:/, '');
  return /^[\w:.+-]{1,64}$/.test(v) ? v : null;
}

export async function logPlatformAudit(entry: AuditEntry): Promise<void> {
  const client = await getAdminClient();
  try {
    await client.query(
      `INSERT INTO platform_audit_logs
         (actor_id, action_type, table_name, record_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.actorId !== undefined ? entry.actorId : actorFromReq(entry.req),
        entry.action,
        entry.tableName,
        entry.recordId ?? null,
        entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        entry.newValues ? JSON.stringify(entry.newValues) : null,
        safeInet(clientIp(entry.req)),
        userAgent(entry.req),
      ]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('logPlatformAudit failed', {
      action: entry.action,
      table: entry.tableName,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    client.release();
  }
}

/** نسخ الصف السابق لتسجيل old_values — استخدام محدود داخل معالجات العقود. */
export async function fetchRowForAudit(
  run: () => Promise<{ rows: Record<string, unknown>[] }>
): Promise<Record<string, unknown> | null> {
  try {
    const r = await run();
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}
