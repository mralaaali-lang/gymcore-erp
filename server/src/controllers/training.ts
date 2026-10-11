import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

// === PT PACKAGES ===
export const listPtPackages = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT * FROM pt_packages WHERE gym_id=$1 ORDER BY name`, [gym_id]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listPtPackages failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createPtPackage = async (req: Request, res: Response) => {
  const { name, session_count, total_price } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`INSERT INTO pt_packages (gym_id, name, session_count, total_price) VALUES ($1,$2,$3,$4) RETURNING *`, [gym_id, name, session_count, total_price]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createPtPackage failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === PT SESSIONS ===
export const listPtSessions = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const member_id = req.query.member_id as string;
  const trainer_id = req.query.trainer_id as string;
  try {
    let sql = `SELECT ps.*, pkg.name AS package_name, m.full_name AS member_name, su.full_name AS trainer_name FROM pt_sessions ps JOIN pt_packages pkg ON ps.package_id=pkg.id JOIN members m ON ps.member_id=m.id JOIN staff_users su ON ps.trainer_id=su.id WHERE ps.gym_id=$1`;
    const params: unknown[] = [gym_id];
    let idx = 2;
    if (member_id) { sql += ` AND ps.member_id=$${idx++}`; params.push(member_id); }
    if (trainer_id) { sql += ` AND ps.trainer_id=$${idx++}`; params.push(trainer_id); }
    sql += ' ORDER BY ps.scheduled_at DESC';
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listPtSessions failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createPtSession = async (req: Request, res: Response) => {
  const { package_id, member_id, trainer_id, session_number, scheduled_at } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`INSERT INTO pt_sessions (gym_id, package_id, member_id, trainer_id, session_number, scheduled_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [gym_id, package_id, member_id, trainer_id, session_number, scheduled_at || null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createPtSession failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const completePtSession = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`UPDATE pt_sessions SET status='completed', completed_at=NOW(), notes=COALESCE($1,notes) WHERE id=$2 AND gym_id=$3 RETURNING *`, [notes, id, gym_id]);
    if (r.rows.length === 0) { res.status(404).json({ error: 'Session not found' }); return; }
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('completePtSession failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};
