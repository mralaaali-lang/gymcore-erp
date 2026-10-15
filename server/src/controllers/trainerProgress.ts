import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

// ====================================================================
// TRAINER DAILY PROGRESS LOGS (§41)
// Real backend for the trainer-progress feature. Rows live in
// trainer_progress_logs (migration 069), tenant-scoped by gym_id and
// unique per (gym, trainer, day). Coaches only ever read/write their own
// logs; managers may read any trainer's logs inside their gym.
// ====================================================================

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Resolves which trainer the request targets. A coach is always pinned to
// themselves; a manager may pass trainer_id explicitly or get their own.
function targetTrainerId(req: Request): string | null {
  const staff = req.staff;
  if (!staff?.gym_id || !staff.staff_user_id) return null;
  if (staff.role === 'coach') return staff.staff_user_id;
  const requested = (req.query.trainer_id || req.body?.trainer_id) as string | undefined;
  return requested || staff.staff_user_id;
}

export const getTodayProgress = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const trainer_id = targetTrainerId(req);
  if (!gym_id || !trainer_id) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const r = await query(
      `SELECT * FROM trainer_progress_logs
       WHERE gym_id=$1 AND trainer_id=$2 AND log_date=$3`,
      [gym_id, trainer_id, todayIso()],
    );
    res.json({ data: r.rows[0] ?? null });
  } catch (e: any) { logger.error('getTodayProgress failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const getProgressHistory = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const trainer_id = targetTrainerId(req);
  if (!gym_id || !trainer_id) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const days = Math.min(parseInt((req.query.days as string) || '30', 10) || 30, 365);
  try {
    const r = await query(
      `SELECT l.*, s.full_name AS trainer_name
       FROM trainer_progress_logs l
       JOIN staff_users s ON s.id = l.trainer_id
       WHERE l.gym_id=$1 AND l.trainer_id=$2
         AND l.log_date >= CURRENT_DATE - ($3 || ' days')::interval
       ORDER BY l.log_date DESC
       LIMIT 100`,
      [gym_id, trainer_id, String(days)],
    );
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('getProgressHistory failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// Create-or-replace the log for a day (the unique constraint is the arbiter),
// so a coach saving "today" twice updates instead of erroring.
export const saveProgressLog = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const trainer_id = targetTrainerId(req);
  if (!gym_id || !trainer_id) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { log_date, client_count, session_count, duration_minutes, notes } = req.body ?? {};
  const date = (log_date as string) || todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: 'log_date must be YYYY-MM-DD' }); return; }
  const counts = [client_count, session_count, duration_minutes].map(v => Number(v) || 0);
  if (counts.some(v => v < 0)) { res.status(400).json({ error: 'counts must be non-negative' }); return; }
  try {
    const r = await query(
      `INSERT INTO trainer_progress_logs
         (gym_id, trainer_id, log_date, client_count, session_count, duration_minutes, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (gym_id, trainer_id, log_date)
       DO UPDATE SET client_count=EXCLUDED.client_count, session_count=EXCLUDED.session_count,
                     duration_minutes=EXCLUDED.duration_minutes, notes=EXCLUDED.notes,
                     updated_at=NOW()
       RETURNING *`,
      [gym_id, trainer_id, date, counts[0], counts[1], counts[2], (notes as string) ?? null],
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('saveProgressLog failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const updateProgressLog = async (req: Request, res: Response) => {
  const staff = req.staff;
  const { id } = req.params;
  const { client_count, session_count, duration_minutes, notes } = req.body ?? {};
  const coach = staff?.role === 'coach';
  try {
    // Coaches may only edit their own rows; managers edit anyone in the gym.
    // Placeholders are numbered in the exact order values are pushed.
    let n = 0;
    const next = () => `$${++n}`;
    const pId = next();
    const pGym = next();
    const pTrainer = coach ? next() : '';
    const pCc = next();
    const pSc = next();
    const pDur = next();
    const pNotes = next();
    const values: unknown[] = [id, staff?.gym_id];
    if (coach) values.push(staff?.staff_user_id);
    values.push(client_count ?? null, session_count ?? null, duration_minutes ?? null, notes ?? null);
    const r = await query(
      `UPDATE trainer_progress_logs
       SET client_count=COALESCE(${pCc},client_count), session_count=COALESCE(${pSc},session_count),
           duration_minutes=COALESCE(${pDur},duration_minutes), notes=COALESCE(${pNotes},notes), updated_at=NOW()
       WHERE id=${pId} AND gym_id=${pGym}${coach ? ` AND trainer_id=${pTrainer}` : ''}
       RETURNING *`,
      values,
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Log not found' }); return; }
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('updateProgressLog failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const deleteProgressLog = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const { id } = req.params;
  try {
    const ownerClause = req.staff?.role === 'coach' ? ' AND trainer_id=$3' : '';
    const params: unknown[] = [id, gym_id];
    if (ownerClause) params.push(req.staff?.staff_user_id);
    const r = await query(`DELETE FROM trainer_progress_logs WHERE id=$1 AND gym_id=$2${ownerClause} RETURNING id`, params);
    if (r.rows.length === 0) { res.status(404).json({ error: 'Log not found' }); return; }
    res.json({ data: { id: r.rows[0].id, deleted: true } });
  } catch (e: any) { logger.error('deleteProgressLog failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};
