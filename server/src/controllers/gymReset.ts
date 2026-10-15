import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import logger from '../config/logger';
import { runTenantBackup } from './backup';
import { seedDefaultSports, seedDefaultOffers } from '../seed/seedNewGym';

// تصفير الصالة (factory reset): نسخة احتياطية أولًا (الفشل يوقف العملية)،
// ثم مسح بيانات التشغيل بترتيب FK آمن، ثم إعادة بذر الكتالوجات، مع بقاء:
// الصالة نفسها + كل الموظفين + الفروع + مفاتيح API + عقود المنصة.
// التأكيد باسم الصالة حرفيًا. جلسات الآخرين تُسقَط — صاحب العملية يبقى داخلًا.
export const resetGym = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  const confirm = String(req.body?.confirm_name ?? '').trim();
  if (!confirm) {
    res.status(400).json({ error: 'Confirmation with the gym name is required.' });
    return;
  }
  const client = await getClient();
  try {
    if (!gym_id) { res.status(401).json({ error: 'Access denied.' }); return; }
    const gym = await client.query(`SELECT id, name FROM gyms WHERE id = $1`, [gym_id]);
    if (gym.rows.length === 0) { res.status(404).json({ error: 'Gym not found.' }); return; }
    if (gym.rows[0].name.trim().toLowerCase() !== confirm.toLowerCase()) {
      res.status(400).json({ error: 'Gym name does not match.' });
      return;
    }

    // 1) Backup first — failure aborts the wipe
    let backupFolder = '';
    try {
      backupFolder = (await runTenantBackup(gym_id, staff_user_id || null)).folder;
    } catch (e: any) {
      logger.error('resetGym: safety backup failed, aborting', { error: e.message });
      res.status(500).json({ error: 'Safety backup failed — reset aborted, nothing was deleted.' });
      return;
    }

    await client.query('BEGIN');
    // marketing_referrals is scoped by referrer_gym_id (no gym_id column)
    await client.query(`DELETE FROM marketing_referrals WHERE referrer_gym_id = $1`, [gym_id]);
    const wiped: Record<string, number> = {};
    const wipe = async (table: string, extra = '') => {
      const r = await client.query(`DELETE FROM ${table} WHERE gym_id = $1 ${extra}`, [gym_id]);
      wiped[table] = r.rowCount ?? 0;
    };

    // Children with RESTRICT links first, then the rest dependency-order
    await client.query(
      `DELETE FROM pos_order_items poi USING pos_orders po WHERE poi.order_id = po.id AND po.gym_id = $1`,
      [gym_id]
    );
    for (const t of [
      'push_log', 'support_tickets', 'financial_transactions',
      'quick_sessions', 'pt_enrollments', 'pt_sessions', 'pos_orders',
      'class_bookings', 'attendance_logs', 'member_debts', 'member_subscriptions',
      'billing_invoices', 'billing_coupons', 'billing_coupon_usage', 'billing_cycles',
      'billing_payment_transactions', 'billing_refunds',
      'loyalty_accounts', 'loyalty_rewards',
      'marketing_campaigns', 'marketing_email_templates',
      'cashbox_sessions', 'products', 'purchases', 'suppliers', 'expense_categories',
      'staff_shifts', 'payroll_ledger',
      'hr_attendance', 'hr_leave_requests', 'hr_adjustments', 'hr_payroll_runs', 'hr_contracts',
      'gym_leads', 'fitness_classes', 'announcements',
      'trainer_progress_logs', 'pending_actions',
      'workflow_definitions', 'recycle_bin',
      'members', 'membership_offers', 'pt_packages', 'gym_sports',
    ]) {
      await wipe(t);
    }
    // Sessions/tokens: everyone else logged out, requester stays in
    for (const t of ['user_sessions', 'staff_sessions', 'refresh_tokens', 'push_tokens']) {
      const hasStaff = (await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'staff_user_id'`, [t]
      )).rows.length > 0;
      if (hasStaff) {
        const r = await client.query(
          `DELETE FROM ${t} WHERE gym_id = $1 AND staff_user_id IS DISTINCT FROM $2`, [gym_id, staff_user_id]
        );
        wiped[t] = r.rowCount ?? 0;
      } else {
        await wipe(t);
      }
    }
    await client.query(`DELETE FROM gym_settings WHERE gym_id = $1`, [gym_id]);
    // سجل الأنشطة محمي بـtrigger (ممنوع حذفه) — يُحفَظ عمدًا كـaudit trail
    // للتصفير نفسه، وصف الاستعادة يُوثَّق فيه أدناه.
    await client.query(
      `UPDATE gym_usage_counters SET current_members_count = 0, current_staff_count = 0, updated_at = CURRENT_TIMESTAMP WHERE gym_id = $1`,
      [gym_id]
    );

    // 2) Reseed operating catalogs (sports + default plans carry sport='gym')
    await seedDefaultSports(client, gym_id);
    await seedDefaultOffers(client, gym_id);

    await client.query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, staff_user_id, `Factory reset executed (safety backup: ${backupFolder})`, req.ip]
    );
    await client.query('COMMIT');
    res.json({ data: { backup: backupFolder, wiped } });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    logger.error('resetGym failed', { error: e.message });
    res.status(500).json({ error: 'Reset failed — nothing was deleted.' });
  } finally {
    client.release();
  }
};
