import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

// ====================================================================
// §37ب — Gym-manager class schedule (fitness_classes).
//
// Honest CRUD over the REAL schema (migration 001): id, gym_id,
// coach_id → staff_users, title, capacity, start_time/end_time
// (timestamptz), is_cancelled. There is no recurring-day column: a class
// is one dated occurrence, and the weekly grid is built by filtering
// start_time over the visible week range (?from&to) — week navigation
// refetches real rows, nothing is re-labelled client-side.
//
// Guards: coach must belong to the gym; a coach cannot have two
// non-cancelled classes overlapping in time; deletion is refused while
// confirmed bookings exist (cancel instead — bookings keep their truth).
// ====================================================================

interface ClassRow {
  id: string;
  title: string;
  coach_id: string;
  coach_name: string | null;
  capacity: number;
  start_time: string;
  end_time: string;
  is_cancelled: boolean;
  booked: number;
}

const CLASS_SELECT = `
  SELECT fc.id, fc.title, fc.coach_id, su.full_name AS coach_name,
         fc.capacity, fc.start_time, fc.end_time, fc.is_cancelled,
         COALESCE((SELECT COUNT(*) FROM class_bookings cb
                   WHERE cb.class_id = fc.id AND cb.status = 'confirmed'), 0)::int AS booked
  FROM fitness_classes fc
  LEFT JOIN staff_users su ON su.id = fc.coach_id`;

/** True when this gym's coach already has a non-cancelled class overlapping [start,end). */
async function findCoachConflict(
  gymId: string,
  coachId: string,
  start: string,
  end: string,
  excludeClassId?: string
): Promise<{ id: string; title: string; start_time: string } | null> {
  const r = await query(
    `SELECT id, title, start_time FROM fitness_classes
     WHERE gym_id = $1 AND coach_id = $2 AND is_cancelled = false
       AND start_time < $4::timestamptz AND end_time > $3::timestamptz
       AND ($5::uuid IS NULL OR id <> $5::uuid)
     ORDER BY start_time LIMIT 1`,
    [gymId, coachId, start, end, excludeClassId ?? null]
  );
  return r.rows[0] ?? null;
}

/** Coach must exist, belong to this gym, be active, and hold a coaching role. */
async function coachBelongsToGym(gymId: string, coachId: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM staff_users
     WHERE id = $1 AND gym_id = $2 AND is_active = true
       AND LOWER(role) IN ('coach', 'trainer')
     LIMIT 1`,
    [coachId, gymId]
  );
  return r.rows.length > 0;
}

export async function listClasses(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  try {
    const conds: string[] = ['fc.gym_id = $1'];
    const params: unknown[] = [gym_id];
    if (from) { params.push(from); conds.push(`fc.start_time >= $${params.length}::timestamptz`); }
    if (to) { params.push(to); conds.push(`fc.start_time < $${params.length}::timestamptz`); }
    const r = await query(
      `${CLASS_SELECT} WHERE ${conds.join(' AND ')} ORDER BY fc.start_time`,
      params
    );
    res.json({ data: r.rows });
  } catch (e: any) {
    logger.error('listClasses failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
}

export async function createClass(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  const { title, coach_id, capacity, start_time, end_time } = req.body as {
    title: string; coach_id: string; capacity: number; start_time: string; end_time: string;
  };
  try {
    if (!(await coachBelongsToGym(gym_id!, coach_id))) {
      res.status(400).json({ error: 'COACH_NOT_IN_GYM' });
      return;
    }
    if (new Date(end_time) <= new Date(start_time)) {
      res.status(400).json({ error: 'INVALID_TIME_RANGE' });
      return;
    }
    const conflict = await findCoachConflict(gym_id!, coach_id, start_time, end_time);
    if (conflict) {
      res.status(409).json({
        error: 'COACH_BUSY',
        details: { class_id: conflict.id, title: conflict.title, start_time: conflict.start_time },
      });
      return;
    }
    const r = await query(
      `INSERT INTO fitness_classes (gym_id, coach_id, title, capacity, start_time, end_time)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [gym_id, coach_id, title, capacity, start_time, end_time]
    );
    const created = await query(`${CLASS_SELECT} WHERE fc.id = $1 AND fc.gym_id = $2`, [r.rows[0].id, gym_id]);
    res.status(201).json({ data: created.rows[0] });
  } catch (e: any) {
    logger.error('createClass failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
}

export async function updateClass(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const { title, coach_id, capacity, start_time, end_time, is_cancelled } = req.body as {
    title?: string; coach_id?: string; capacity?: number;
    start_time?: string; end_time?: string; is_cancelled?: boolean;
  };
  try {
    const existing = await query(
      `SELECT coach_id, start_time, end_time FROM fitness_classes WHERE id = $1 AND gym_id = $2`,
      [id, gym_id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }
    const nextCoach = coach_id ?? existing.rows[0].coach_id;
    const nextStart = start_time ?? existing.rows[0].start_time;
    const nextEnd = end_time ?? existing.rows[0].end_time;
    if (new Date(nextEnd) <= new Date(nextStart)) {
      res.status(400).json({ error: 'INVALID_TIME_RANGE' });
      return;
    }
    if (coach_id && !(await coachBelongsToGym(gym_id!, coach_id))) {
      res.status(400).json({ error: 'COACH_NOT_IN_GYM' });
      return;
    }
    // Re-check conflicts only when timing/coach actually changes and the class stays active.
    if ((coach_id || start_time || end_time) && is_cancelled !== true) {
      const conflict = await findCoachConflict(gym_id!, nextCoach, nextStart, nextEnd, id);
      if (conflict) {
        res.status(409).json({
          error: 'COACH_BUSY',
          details: { class_id: conflict.id, title: conflict.title, start_time: conflict.start_time },
        });
        return;
      }
    }
    await query(
      `UPDATE fitness_classes
       SET title = COALESCE($1, title),
           coach_id = COALESCE($2, coach_id),
           capacity = COALESCE($3, capacity),
           start_time = COALESCE($4, start_time),
           end_time = COALESCE($5, end_time),
           is_cancelled = COALESCE($6, is_cancelled)
       WHERE id = $7 AND gym_id = $8`,
      [title ?? null, coach_id ?? null, capacity ?? null,
       start_time ?? null, end_time ?? null, is_cancelled ?? null, id, gym_id]
    );
    const updated = await query(`${CLASS_SELECT} WHERE fc.id = $1 AND fc.gym_id = $2`, [id, gym_id]);
    res.json({ data: updated.rows[0] });
  } catch (e: any) {
    logger.error('updateClass failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
}

export async function deleteClass(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const exists = await query(
      `SELECT 1 FROM fitness_classes WHERE id = $1 AND gym_id = $2`,
      [id, gym_id]
    );
    if (exists.rows.length === 0) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }
    const booked = await query(
      `SELECT COUNT(*)::int AS n FROM class_bookings WHERE class_id = $1 AND status = 'confirmed'`,
      [id]
    );
    if (booked.rows[0].n > 0) {
      // Honest refusal: members hold bookings on this occurrence.
      res.status(409).json({ error: 'HAS_BOOKINGS', booked: booked.rows[0].n });
      return;
    }
    await query(`DELETE FROM fitness_classes WHERE id = $1 AND gym_id = $2`, [id, gym_id]);
    res.json({ success: true });
  } catch (e: any) {
    logger.error('deleteClass failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
}
