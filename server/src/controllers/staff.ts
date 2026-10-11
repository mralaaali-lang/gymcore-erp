import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';
import bcrypt from 'bcrypt';

// === STAFF / USERS ===
export const listStaff = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT id, full_name, email, role, phone, salary, is_active, created_at FROM staff_users WHERE gym_id=$1 ORDER BY created_at DESC`, [gym_id]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listStaff failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const getStaff = async (req: Request, res: Response) => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT id, full_name, email, role, phone, salary, is_active, created_at FROM staff_users WHERE id=$1 AND gym_id=$2`, [id, gym_id]);
    if (r.rows.length === 0) { res.status(404).json({ error: 'Staff not found' }); return; }
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('getStaff failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// Roles a gym manager is allowed to create (single gym-admin role model:
// managers may onboard managers, coaches and receptionists alike).
const MANAGER_CREATABLE_ROLES = new Set(['manager', 'coach', 'receptionist']);

export const createStaff = async (req: Request, res: Response) => {
  const { full_name, email, password, role, phone, salary } = req.body;
  const gym_id = req.staff?.gym_id;
  const creatorRole = req.staff?.role;

  if (creatorRole === 'manager' && !MANAGER_CREATABLE_ROLES.has(role)) {
    res.status(403).json({
      error: 'Invalid role. Allowed: manager, coach, receptionist.',
    });
    return;
  }

  try {
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);
    const r = await query(`INSERT INTO staff_users (gym_id, full_name, email, password_hash, role, phone, salary) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, full_name, email, role, phone, salary`, [gym_id, full_name, email, password_hash, role, phone || null, salary || null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) {
    if (e.code === '23505') { res.status(400).json({ error: 'Email already exists in this gym' }); return; }
    logger.error('createStaff failed', { error: e.message }); res.status(500).json({ error: 'Internal error' });
  }
};

export const updateStaff = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { full_name, email, role, phone, salary, is_active } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`UPDATE staff_users SET full_name=COALESCE($1,full_name), email=COALESCE($2,email), role=COALESCE($3,role), phone=COALESCE($4,phone), salary=COALESCE($5,salary), is_active=COALESCE($6,is_active) WHERE id=$7 AND gym_id=$8 RETURNING id, full_name, email, role, phone, salary, is_active`, [full_name, email, role, phone, salary, is_active, id, gym_id]);
    if (r.rows.length === 0) { res.status(404).json({ error: 'Staff not found' }); return; }
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('updateStaff failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const deleteStaff = async (req: Request, res: Response) => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const requestingStaffId = req.staff?.staff_user_id;

  if (id === requestingStaffId) {
    res.status(400).json({ error: 'You cannot delete your own account.' });
    return;
  }

  try {
    // Only ever act within the caller's own gym, and never allow deleting
    // the gym's founding manager account through this endpoint (removing
    // the first manager would orphan the gym — that's a privilege path,
    // not routine staff management).
    const target = await query(
      `SELECT id, role FROM staff_users WHERE id = $1 AND gym_id = $2`,
      [id, gym_id]
    );
    if (target.rows.length === 0) {
      res.status(404).json({ error: 'Staff not found.' });
      return;
    }
    const founder = await query(
      `SELECT id FROM staff_users WHERE gym_id = $1 AND role = 'manager' AND is_active = true ORDER BY created_at ASC LIMIT 1`,
      [gym_id]
    );
    if (founder.rows.length > 0 && founder.rows[0].id === id) {
      res.status(403).json({ error: 'The founding manager account cannot be deleted.' });
      return;
    }

    await query(`DELETE FROM staff_users WHERE id = $1 AND gym_id = $2`, [id, gym_id]);
    res.status(204).send();
  } catch (e: any) {
    if (e.code === '23503') {
      // foreign_key_violation — this staff member has historical records
      // (shifts, PT sessions, class bookings, payroll, CRM assignments...)
      // that reference them, and those tables don't cascade-delete on
      // purpose (deleting a trainer shouldn't silently erase attendance/
      // payroll history). Hard delete isn't possible in that case.
      res.status(409).json({
        error: 'Cannot permanently delete this staff member — they have historical records ' +
          '(shifts, sessions, payroll, etc.) linked to them. Deactivate the account instead ' +
          "(PUT /api/staff/:id with is_active: false) to preserve that history.",
      });
      return;
    }
    logger.error('deleteStaff failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
};

// === TRAINERS (staff_users with role='coach') ===
export const listTrainers = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT id, full_name, email, phone, salary FROM staff_users WHERE gym_id=$1 AND role='coach' AND is_active=true ORDER BY full_name`, [gym_id]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listTrainers failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === SHIFTS ===
export const listShifts = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT ss.*, su.full_name AS staff_name, su.role AS staff_role FROM staff_shifts ss LEFT JOIN staff_users su ON ss.staff_user_id=su.id WHERE ss.gym_id=$1 ORDER BY ss.clock_in DESC LIMIT 100`, [gym_id]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listShifts failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const clockIn = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  try {
    const open = await query(`SELECT id FROM staff_shifts WHERE staff_user_id=$1 AND gym_id=$2 AND clock_out IS NULL`, [staff_user_id, gym_id]);
    if (open.rows.length > 0) { res.status(400).json({ error: 'Already clocked in' }); return; }
    const r = await query(`INSERT INTO staff_shifts (gym_id, staff_user_id) VALUES ($1,$2) RETURNING *`, [gym_id, staff_user_id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('clockIn failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const clockOut = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  try {
    const r = await query(`UPDATE staff_shifts SET clock_out=NOW() WHERE staff_user_id=$1 AND gym_id=$2 AND clock_out IS NULL RETURNING *`, [staff_user_id, gym_id]);
    if (r.rows.length === 0) { res.status(400).json({ error: 'No active shift found' }); return; }
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('clockOut failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === HR / PAYROLL ===
export const listPayroll = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT pl.*, su.full_name AS staff_name, su.role FROM payroll_ledger pl LEFT JOIN staff_users su ON pl.staff_user_id=su.id WHERE pl.gym_id=$1 ORDER BY pl.payment_date DESC`, [gym_id]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listPayroll failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const processPayroll = async (req: Request, res: Response) => {
  const { staff_user_id, base_salary_paid, commissions_paid } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`INSERT INTO payroll_ledger (gym_id, staff_user_id, base_salary_paid, commissions_paid) VALUES ($1,$2,$3,$4) RETURNING *`, [gym_id, staff_user_id, base_salary_paid || 0, commissions_paid || 0]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('processPayroll failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === STAFF ATTENDANCE SUMMARY ===
export const getStaffAttendanceSummary = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT su.id, su.full_name, su.role, COUNT(ss.id) FILTER (WHERE ss.clock_in >= DATE_TRUNC('month', CURRENT_DATE)) AS monthly_shifts, COUNT(ss.id) FILTER (WHERE ss.clock_in >= CURRENT_DATE) AS today_clocked FROM staff_users su LEFT JOIN staff_shifts ss ON ss.staff_user_id=su.id AND ss.gym_id=su.gym_id WHERE su.gym_id=$1 AND su.is_active=true GROUP BY su.id, su.full_name, su.role ORDER BY su.full_name`, [gym_id]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('getStaffAttendanceSummary failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};
