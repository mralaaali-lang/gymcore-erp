import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import logger from '../config/logger';

export const listWorkflows = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  try {
    let result = await query(
      `SELECT * FROM workflow_definitions WHERE gym_id = $1 ORDER BY created_at ASC`,
      [gym_id]
    );
    if (result.rows.length === 0) {
      await query(
        `INSERT INTO workflow_definitions (gym_id, name, name_ar, description, description_ar, icon) VALUES
         ($1, 'Membership Expiry Notification', 'إشعار انتهاء العضوية', 'Send automatic notification when membership expires', 'إرسال إشعار تلقائي عند انتهاء صلاحية العضوية', 'timer_off'),
         ($1, 'Billing Reminder', 'تذكير الفوترة', 'Send invoice reminder 3 days before due date', 'إرسال تذكير بالفواتير قبل الاستحقاق بـ 3 أيام', 'payments'),
         ($1, 'Welcome Email', 'البريد الترحيبي', 'Send automatic welcome email when a new member registers', 'إرسال بريد إلكتروني ترحيبي تلقائي عند تسجيل عضو جديد', 'mail'),
         ($1, 'Account Deactivation', 'تعطيل الحساب', 'Auto-deactivate member account 30 days after membership expiry', 'تعطيل حساب العضو تلقائياً بعد 30 يوماً من انتهاء العضوية', 'block'),
         ($1, 'Weekly Report', 'التقرير الأسبوعي', 'Generate and send weekly report every Saturday', 'توليد وإرسال التقرير الأسبوعي للإدارة كل يوم سبت', 'assignment'),
         ($1, 'PT Session Booking', 'حجز جلسة PT', 'Notify trainer when a new PT session is booked', 'إشعار المدرب عند حجز جلسة تدريب شخصي جديدة', 'fitness_center')`,
        [gym_id]
      );
      result = await query(
        `SELECT * FROM workflow_definitions WHERE gym_id = $1 ORDER BY created_at ASC`,
        [gym_id]
      );
    }
    res.json({ data: result.rows });
  } catch (error) {
    logger.error('Failed to list workflows', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const updateWorkflow = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { enabled } = req.body;
  const gym_id = req.staff?.gym_id;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled (boolean) is required.' });
    return;
  }
  try {
    const result = await query(
      `UPDATE workflow_definitions SET enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND gym_id = $3 RETURNING *`,
      [enabled, id, gym_id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to update workflow', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const triggerWorkflow = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  try {
    const wfResult = await query(
      `SELECT * FROM workflow_definitions WHERE id = $1 AND gym_id = $2`,
      [id, gym_id]
    );
    if (wfResult.rows.length === 0) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }
    const wf = wfResult.rows[0];
    await query(
      `UPDATE workflow_definitions SET last_triggered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND gym_id = $2`,
      [id, gym_id]
    );
    await query(
      `INSERT INTO pending_actions (gym_id, requested_by_staff_id, action_type, target_table, target_record_id, old_data_json, new_data_json, reason)
       VALUES ($1, $2, 'trigger_workflow', 'fitness_classes', $3, '{}'::jsonb, $4, $5)`,
      [gym_id, staff_user_id, id, JSON.stringify({ enabled: wf.enabled, triggered_at: new Date().toISOString() }), `Manual trigger: ${wf.name}`]
    );
    res.json({ success: true, data: { ...wf, last_triggered_at: new Date().toISOString() } });
  } catch (error) {
    logger.error('Failed to trigger workflow', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};
