import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

/**
 * §63 — الحملات التسويقية على مستوى الصالة.
 *
 * الجدول (`marketing_campaigns` + `marketing_broadcasts` من migration 045) كان
 * مقروءًا من واجهة المنصة وحدها (`platformMarketing.ts`)، فمدير الصالة مفيش
 * حاجة يسمّيها حملته ولا يقيس أثرها. الملفات دي بتدي نفس الجدول للصالة:
 * الصالة تشوف حملاتها هي فقط، وكل رقم أثر بيتجمّع من إرسالاتها المرتبطة بها.
 *
 * تنبيه صدق البيانات: مفيش pipeline إرسال للحملة على مستوى الصالة — الإندبوينت
 * ده بيخزّن ويقيس، مش بيبعت. عدادات التأثير بتفضل صفر لحد ما إرسال فعلي يتسجّل،
 * فـ«صفر» هنا معناه «ما اتبعتش حاجة» مش «فاشل» (مُعلَن في التسليم لجلسة A).
 *
 * ملاحظات أمان: `marketing_campaigns` مش مفعّل عليه RLS (عكس `pos_orders`)،
 * فعزل المستأجر هنا مرتبط بالحرف `WHERE gym_id = $` في كل استعلام — أي تعديل
 * مستقبلي لازم يحافظ عليه. والحذف مسموح للحملة اللي ما ليهاش إرسالات لأن
 * `marketing_broadcasts.campaign_id` ON DELETE CASCADE: حذف غلط كان بيمسح سجل إرسال.
 */

// نفس قاموس platformMarketing (migration 045) — مصدر واحد للقيم المقبولة.
const CAMPAIGN_TYPES = ['email', 'sms', 'whatsapp', 'referral', 'social'];
const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'];

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number): number => Math.round(n * 100) / 100;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function logAction(req: Request, description: string): Promise<void> {
  await query(
    `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
     VALUES ($1, $2, $3, $4)`,
    [req.staff?.gym_id, req.staff?.staff_user_id ?? null, description, req.ip],
  );
}

const CAMPAIGN_SELECT = `
  SELECT c.id, c.name, c.name_ar, c.type, c.status, c.budget, c.spent_amount,
         c.start_date, c.end_date, c.created_at, c.updated_at,
         COALESCE(b.broadcasts, 0)::int AS broadcasts,
         COALESCE(b.sent, 0)::int AS broadcasts_sent,
         COALESCE(b.recipients, 0)::int AS recipients,
         COALESCE(b.delivered, 0)::int AS delivered,
         COALESCE(b.opened, 0)::int AS opened,
         COALESCE(b.clicked, 0)::int AS clicked,
         COALESCE(b.bounced, 0)::int AS bounced,
         COALESCE(b.unsubscribed, 0)::int AS unsubscribed
    FROM marketing_campaigns c
    LEFT JOIN (
      SELECT campaign_id,
             COUNT(*) AS broadcasts,
             COUNT(*) FILTER (WHERE sent_at IS NOT NULL) AS sent,
             SUM(COALESCE(total_recipients, 0)) AS recipients,
             SUM(COALESCE(delivered_count, 0)) AS delivered,
             SUM(COALESCE(opened_count, 0)) AS opened,
             SUM(COALESCE(clicked_count, 0)) AS clicked,
             SUM(COALESCE(bounced_count, 0)) AS bounced,
             SUM(COALESCE(unsubscribed_count, 0)) AS unsubscribed
        FROM marketing_broadcasts
       GROUP BY campaign_id
    ) b ON b.campaign_id = c.id`;

/**
 * تجميع أثر الحملة من إرسالاتها. نِسب التسليم/الفتح محسوبة على المسلَّم فعلًا،
 * وبلا مُسلَّم القيمة `null` (مش صفر) — الصفر معناه «ولا حد فتح»، والـnull
 * معناه «ما كانش في إرسال أصلًا»، والفرق ده هو اللي بيمنح الواجهة حق تقول
 * حالة فاضية صادقة بدل مقاس كداب.
 */
export function buildCampaignImpact(c: {
  broadcasts?: unknown;
  sent?: unknown;
  recipients?: unknown;
  delivered?: unknown;
  opened?: unknown;
  clicked?: unknown;
  bounced?: unknown;
  unsubscribed?: unknown;
}): Record<string, number | null> {
  const delivered = num(c.delivered);
  return {
    broadcasts: num(c.broadcasts),
    broadcasts_sent: num(c.sent),
    recipients: num(c.recipients),
    delivered,
    opened: num(c.opened),
    clicked: num(c.clicked),
    bounced: num(c.bounced),
    unsubscribed: num(c.unsubscribed),
    open_rate_pct: delivered > 0 ? Math.round((num(c.opened) / delivered) * 1000) / 10 : null,
    click_rate_pct: delivered > 0 ? Math.round((num(c.clicked) / delivered) * 1000) / 10 : null,
  };
}

const shape = (c: any) => ({
  id: c.id,
  name: c.name,
  name_ar: c.name_ar,
  type: c.type,
  status: c.status,
  budget: r2(num(c.budget)),
  spent: r2(num(c.spent_amount)),
  start_date: c.start_date,
  end_date: c.end_date,
  created_at: c.created_at,
  updated_at: c.updated_at,
  impact: buildCampaignImpact({
    broadcasts: c.broadcasts,
    sent: c.broadcasts_sent,
    recipients: c.recipients,
    delivered: c.delivered,
    opened: c.opened,
    clicked: c.clicked,
    bounced: c.bounced,
    unsubscribed: c.unsubscribed,
  }),
});

export const listGymCampaigns = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
  const type = typeof req.query.type === 'string' && req.query.type ? req.query.type : null;
  try {
    const r = await query(
      `${CAMPAIGN_SELECT}
       WHERE c.gym_id = $1
         AND ($2::text IS NULL OR c.status = $2)
         AND ($3::text IS NULL OR c.type = $3)
       ORDER BY c.created_at DESC
       LIMIT 100`,
      [gym_id, status, type],
    );
    res.json({ data: r.rows.map(shape) });
  } catch (e: any) {
    logger.error('listGymCampaigns failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

export const createGymCampaign = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const { name, name_ar, type, budget, start_date, end_date } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'اسم الحملة مطلوب' });
    return;
  }
  if (!CAMPAIGN_TYPES.includes(type)) {
    res.status(400).json({ error: `نوع غير صالح — المقبول: ${CAMPAIGN_TYPES.join(', ')}` });
    return;
  }
  const amount = budget === undefined || budget === null || budget === '' ? 0 : Number(budget);
  if (!Number.isFinite(amount) || amount < 0) {
    res.status(400).json({ error: 'ميزانية غير صالحة' });
    return;
  }
  for (const d of [start_date, end_date]) {
    if (d != null && d !== '' && !ISO_DATE.test(String(d))) {
      res.status(400).json({ error: 'التاريخ لازم يكون YYYY-MM-DD' });
      return;
    }
  }
  if (start_date && end_date && String(start_date) > String(end_date)) {
    res.status(400).json({ error: 'بداية الحملة بعد نهايتها' });
    return;
  }
  try {
    const r = await query(
      `INSERT INTO marketing_campaigns
         (name, name_ar, type, status, gym_id, budget, start_date, end_date, created_by)
       VALUES ($1, $2, $3, 'draft', $4, $5, NULLIF($6::text,'')::date, NULLIF($7::text,'')::date, $8)
       RETURNING id, name, name_ar, type, status, budget, start_date, end_date, created_at, updated_at`,
      [name.trim(), name_ar || null, type, gym_id, amount, start_date || null, end_date || null, req.staff?.staff_user_id ?? null],
    );
    await logAction(req, `Created marketing campaign ${r.rows[0].id} (${type})`);
    res.status(201).json({ data: shape({ ...r.rows[0], broadcasts: 0, sent: 0, recipients: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 }) });
  } catch (e: any) {
    logger.error('createGymCampaign failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

export const updateGymCampaignStatus = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const { status } = req.body;
  if (!CAMPAIGN_STATUSES.includes(status)) {
    res.status(400).json({ error: `حالة غير صالحة — المقبول: ${CAMPAIGN_STATUSES.join(', ')}` });
    return;
  }
  try {
    // الحرف gym_id في WHERE هو العزل: العمود ده بلا RLS.
    const r = await query(
      `UPDATE marketing_campaigns SET status = $3, updated_at = NOW()
        WHERE id = $1 AND gym_id = $2
        RETURNING id, name, status, updated_at`,
      [req.params.id, gym_id, status],
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'الحملة غير موجودة' });
      return;
    }
    await logAction(req, `Set marketing campaign ${req.params.id} status=${status}`);
    res.json({ data: r.rows[0] });
  } catch (e: any) {
    logger.error('updateGymCampaignStatus failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

export const deleteGymCampaign = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  try {
    const linked = await query(
      `SELECT COUNT(*)::int AS n FROM marketing_broadcasts
        WHERE campaign_id = $1
          AND EXISTS (SELECT 1 FROM marketing_campaigns c
                       WHERE c.id = $1 AND c.gym_id = $2)`,
      [req.params.id, gym_id],
    );
    if (num(linked.rows[0]?.n) > 0) {
      // cascade كان بيمسح سجل الإرسال مع الحملة.
      res.status(409).json({
        error: 'الحملة ليها إرسالات مسجّلة — ما يتحذفش غير وهي بلا أثر',
        data: { broadcasts: num(linked.rows[0]?.n) },
      });
      return;
    }
    const r = await query(
      `DELETE FROM marketing_campaigns WHERE id = $1 AND gym_id = $2 RETURNING id, name`,
      [req.params.id, gym_id],
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'الحملة غير موجودة' });
      return;
    }
    await logAction(req, `Deleted marketing campaign ${req.params.id}`);
    res.json({ success: true });
  } catch (e: any) {
    logger.error('deleteGymCampaign failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};
