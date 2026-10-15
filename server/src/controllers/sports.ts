import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { query } from '../config/database';
import logger from '../config/logger';

// Per-gym sports catalog — the end of the fixed code enum: every sport is a
// row (icon/color/order/active) the manager owns from /admin/sports.
// plan.sport و member_subscriptions.sport يخزنان code هنا.

export interface SportRow {
  id: string;
  code: string;
  name_ar: string;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  plan_count: number;
  active_sub_count: number;
}

export async function sportExists(gym_id: string | undefined, code: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM gym_sports WHERE gym_id = $1 AND code = $2`, [gym_id, code]);
  return r.rows.length > 0;
}

export const listSports = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(
      `SELECT s.id, s.code, s.name_ar, s.icon, s.color, s.sort_order, s.is_active,
              (SELECT COUNT(*)::int FROM membership_offers o
                WHERE o.gym_id = s.gym_id AND o.sport = s.code) AS plan_count,
              (SELECT COUNT(*)::int FROM member_subscriptions ms
                WHERE ms.gym_id = s.gym_id AND ms.sport = s.code
                  AND ms.deleted_at IS NULL AND ms.status = 'active') AS active_sub_count
       FROM gym_sports s
       WHERE s.gym_id = $1
       ORDER BY s.sort_order ASC, s.name_ar ASC`,
      [gym_id]
    );
    res.json({ data: r.rows });
  } catch (e: any) {
    logger.error('listSports failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

export const createSport = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const { name_ar, icon, color, sort_order } = req.body;
  try {
    const order = Number.isInteger(sort_order) && sort_order >= 0
      ? sort_order
      : Number((await query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM gym_sports WHERE gym_id = $1`, [gym_id])).rows[0]?.n ?? 0);
    const code = `c${randomBytes(4).toString('hex')}`;
    const r = await query(
      `INSERT INTO gym_sports (gym_id, code, name_ar, icon, color, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, code, name_ar, icon, color, sort_order, is_active`,
      [gym_id, code, name_ar.trim(), icon || 'fitness_center', color || '#0284c7', order]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) {
    logger.error('createSport failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

export const updateSport = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const { name_ar, icon, color, sort_order, is_active } = req.body;
  try {
    const sets: string[] = [];
    const vals: unknown[] = [];
    // code ثابت — تغييره يكسر الباقات/الاشتراكات المرتبطة
    if (name_ar !== undefined) { vals.push(name_ar.trim()); sets.push(`name_ar = $${vals.length}`); }
    if (icon !== undefined) { vals.push(icon); sets.push(`icon = $${vals.length}`); }
    if (color !== undefined) { vals.push(color); sets.push(`color = $${vals.length}`); }
    if (sort_order !== undefined) { vals.push(sort_order); sets.push(`sort_order = $${vals.length}`); }
    if (is_active !== undefined) { vals.push(is_active); sets.push(`is_active = $${vals.length}`); }
    if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }
    vals.push(id, gym_id);
    const r = await query(
      `UPDATE gym_sports SET ${sets.join(', ')}
       WHERE id = $${vals.length - 1} AND gym_id = $${vals.length}
       RETURNING id, code, name_ar, icon, color, sort_order, is_active`,
      vals
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Sport not found' }); return; }
    res.json({ data: r.rows[0] });
  } catch (e: any) {
    logger.error('updateSport failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

// الحذف ممنوع مع الاستخدام — الباقات والاشتراكات المرتبطة تمنعه بالأرقام
export const deleteSport = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const cur = await query(`SELECT code FROM gym_sports WHERE id = $1 AND gym_id = $2`, [id, gym_id]);
    if (cur.rows.length === 0) { res.status(404).json({ error: 'Sport not found' }); return; }
    const code = cur.rows[0].code as string;
    const used = await query(
      `SELECT (SELECT COUNT(*)::int FROM membership_offers WHERE gym_id = $1 AND sport = $2) AS plans,
              (SELECT COUNT(*)::int FROM member_subscriptions WHERE gym_id = $1 AND sport = $2 AND deleted_at IS NULL) AS subs`,
      [gym_id, code]
    );
    const plans = Number(used.rows[0]?.plans ?? 0);
    const subs = Number(used.rows[0]?.subs ?? 0);
    if (plans > 0 || subs > 0) {
      res.status(409).json({ error: 'Sport is in use and cannot be deleted.', plans, subs });
      return;
    }
    await query(`DELETE FROM gym_sports WHERE id = $1 AND gym_id = $2`, [id, gym_id]);
    res.json({ data: { id, deleted: true } });
  } catch (e: any) {
    logger.error('deleteSport failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};
