import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';
import bcrypt from 'bcrypt';
import { generateLoginCode, hashLoginCode, issueLoginCode, issueLoginCodes, sendLoginCode } from '../services/loginCode';
import { whatsapp } from '../services/whatsapp';

// === STAFF / USERS ===
export const listStaff = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT id, full_name, email, role, phone, salary, commission_pct, is_active, created_at,
      employee_code, department, job_title, national_id, birth_date, gender, address, hire_date,
      shift_start, shift_end, late_allowance_min, weekly_off,
      housing_allowance, transport_allowance, other_allowance,
      annual_leave_days, sick_leave_days, monthly_leave_days
      FROM staff_users WHERE gym_id=$1 ORDER BY created_at DESC`, [gym_id]);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listStaff failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const getStaff = async (req: Request, res: Response) => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT id, full_name, email, role, phone, salary, commission_pct, is_active, created_at,
      employee_code, department, job_title, national_id, birth_date, gender, address, hire_date,
      shift_start, shift_end, late_allowance_min, weekly_off,
      housing_allowance, transport_allowance, other_allowance,
      annual_leave_days, sick_leave_days, monthly_leave_days
      FROM staff_users WHERE id=$1 AND gym_id=$2`, [id, gym_id]);
    if (r.rows.length === 0) { res.status(404).json({ error: 'Staff not found' }); return; }
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('getStaff failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// Roles a gym manager is allowed to create (single gym-admin role model:
// managers may onboard managers, coaches and receptionists alike).
const MANAGER_CREATABLE_ROLES = new Set(['manager', 'coach', 'receptionist']);

export const createStaff = async (req: Request, res: Response) => {
  const { full_name, email, password, role, phone, salary, commission_pct, pin, ...profile } = req.body;
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
    const pinHash = pin ? await bcrypt.hash(String(pin), 12) : null;
    // Login code (083_staff_login_code.sql): receptionists and coaches sign in
    // with phone + code. Only issued when there IS a phone to sign in with — a
    // code nobody can use looks issued and never arrives. Managers are
    // excluded on purpose: they keep email + password on /login.
    const loginCode = phone && role !== 'manager' ? generateLoginCode() : null;
    const loginCodeHash = loginCode ? await hashLoginCode(loginCode) : null;
    // كود مسلسل لا يُعاد (EMP0001…) — الفجوات طبيعية بعد الحذف
    const codeRes = await query(
      `SELECT COALESCE(MAX(CASE WHEN employee_code ~ '^EMP[0-9]+$'
        THEN SUBSTRING(employee_code FROM 4)::int END), 0) + 1 AS next_no
       FROM staff_users WHERE gym_id = $1`,
      [gym_id]
    );
    const code = `EMP${String(codeRes.rows[0].next_no).padStart(4, '0')}`;
    const p = pickProfile(profile);
    const r = await query(
      `INSERT INTO staff_users (gym_id, full_name, email, password_hash, role, phone, salary, commission_pct,
        employee_code, department, job_title, national_id, birth_date, gender, address, hire_date,
        shift_start, shift_end, late_allowance_min, weekly_off, pin_hash,
        housing_allowance, transport_allowance, other_allowance,
        annual_leave_days, sick_leave_days, monthly_leave_days, login_code_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       RETURNING id, full_name, email, role, phone, salary, commission_pct, employee_code`,
      [gym_id, full_name, email, password_hash, role, phone || null, salary || null, commission_pct ?? 0, code,
        p.department, p.job_title, p.national_id, p.birth_date, p.gender, p.address, p.hire_date,
        p.shift_start, p.shift_end, p.late_allowance_min ?? 0, p.weekly_off, pinHash,
        p.housing_allowance ?? 0, p.transport_allowance ?? 0, p.other_allowance ?? 0,
        p.annual_leave_days ?? 21, p.sick_leave_days ?? 7, p.monthly_leave_days ?? 2, loginCodeHash]
    );
    // `login_code` is the only time this code exists in plaintext — the caller
    // has to show it to the manager right now or it is gone for good.
    res.status(201).json({ data: { ...r.rows[0], login_code: loginCode } });
  } catch (e: any) {
    if (e.code === '23505') { res.status(400).json({ error: 'Email already exists in this gym' }); return; }
    logger.error('createStaff failed', { error: e.message }); res.status(500).json({ error: 'Internal error' });
  }
};

// حقول الملف الوظيفي — تُمرَّر للـINSERT/UPDATE بعد تنظيف القوائم
function pickProfile(b: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const days = Array.isArray(b.weekly_off)
    ? [...new Set((b.weekly_off as unknown[]).filter((d) => typeof d === 'string'))]
    : null;
  return {
    department: str(b.department), job_title: str(b.job_title), national_id: str(b.national_id),
    birth_date: str(b.birth_date), gender: str(b.gender), address: str(b.address),
    hire_date: str(b.hire_date), shift_start: str(b.shift_start), shift_end: str(b.shift_end),
    late_allowance_min: b.late_allowance_min as number | undefined,
    weekly_off: days && days.length ? days : null,
    housing_allowance: b.housing_allowance as number | undefined,
    transport_allowance: b.transport_allowance as number | undefined,
    other_allowance: b.other_allowance as number | undefined,
    annual_leave_days: b.annual_leave_days as number | undefined,
    sick_leave_days: b.sick_leave_days as number | undefined,
    monthly_leave_days: b.monthly_leave_days as number | undefined,
  };
}

export const updateStaff = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { full_name, email, role, phone, salary, is_active, commission_pct, pin, ...profile } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const sets: string[] = [
      'full_name=COALESCE($1,full_name)', 'email=COALESCE($2,email)', 'role=COALESCE($3,role)',
      'phone=COALESCE($4,phone)', 'salary=COALESCE($5,salary)', 'is_active=COALESCE($6,is_active)',
      'commission_pct=COALESCE($7,commission_pct)',
    ];
    const vals: unknown[] = [full_name, email, role, phone, salary, is_active, commission_pct ?? null];
    // الكود ثابت بعد الإنشاء (سلامة التسلسل) — PIN يُصفَّر بإرسال فارغ؟ لا:
    // PIN يُضبط فقط بقيمة 4-8 أرقام، والفارغ يُتجاهل (لا مسح صامت)
    if (pin) {
      const pinHash = await bcrypt.hash(String(pin), 12);
      vals.push(pinHash);
      sets.push(`pin_hash=$${vals.length}`);
    }
    const p = pickProfile(profile);
    const map: [string, unknown][] = [
      ['department', p.department], ['job_title', p.job_title], ['national_id', p.national_id],
      ['birth_date', p.birth_date], ['gender', p.gender], ['address', p.address],
      ['hire_date', p.hire_date], ['shift_start', p.shift_start], ['shift_end', p.shift_end],
      ['housing_allowance', p.housing_allowance], ['transport_allowance', p.transport_allowance],
      ['other_allowance', p.other_allowance], ['annual_leave_days', p.annual_leave_days],
      ['sick_leave_days', p.sick_leave_days], ['monthly_leave_days', p.monthly_leave_days],
    ];
    for (const [col, v] of map) {
      if (col in profile) { vals.push(v); sets.push(`${col}=$${vals.length}`); }
    }
    if ('late_allowance_min' in profile) { vals.push(profile.late_allowance_min ?? 0); sets.push(`late_allowance_min=$${vals.length}`); }
    if ('weekly_off' in profile) {
      const days = Array.isArray(profile.weekly_off)
        ? [...new Set((profile.weekly_off as unknown[]).filter((d) => typeof d === 'string'))]
        : null;
      vals.push(days && days.length ? days : null);
      sets.push(`weekly_off=$${vals.length}`);
    }
    const r = await query(
      `UPDATE staff_users SET ${sets.join(', ')} WHERE id=$${vals.length + 1} AND gym_id=$${vals.length + 2}
       RETURNING id, full_name, email, role, phone, salary, is_active, commission_pct, employee_code`,
      [...vals, id, gym_id]
    );
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

// === COACHES SUMMARY (trainers page cards) ===
// One row per coach (active AND inactive): live subscription load
// (active member_subscriptions via coach_id), on-shift flag (open
// staff_shifts row), and the dominant sport of their active subs
// (sport lives per-subscription — a coach with no sported subs reports
// sport_mode NULL, shown as «عام»).
export const listCoachesSummary = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(
      `SELECT su.id, su.full_name, su.email, su.phone, su.salary,
              su.commission_pct, su.is_active, su.created_at,
              (SELECT COUNT(*)::int FROM member_subscriptions ms
                WHERE ms.coach_id = su.id AND ms.gym_id = su.gym_id
                  AND ms.deleted_at IS NULL AND ms.status = 'active') AS sub_count,
              EXISTS (SELECT 1 FROM staff_shifts ss
                WHERE ss.staff_user_id = su.id AND ss.gym_id = su.gym_id
                  AND ss.clock_out IS NULL) AS on_shift,
              (SELECT ms.sport FROM member_subscriptions ms
                WHERE ms.coach_id = su.id AND ms.gym_id = su.gym_id
                  AND ms.deleted_at IS NULL AND ms.status = 'active'
                  AND ms.sport IS NOT NULL
                GROUP BY ms.sport ORDER BY COUNT(*) DESC LIMIT 1) AS sport_mode
       FROM staff_users su
       WHERE su.gym_id = $1 AND su.role = 'coach' AND su.deleted_at IS NULL
       ORDER BY su.is_active DESC, su.full_name ASC`,
      [gym_id]
    );
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listCoachesSummary failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
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
  const callerRole = req.staff?.role;
  // المدير يسجّل حضور مدرب (staff_user_id صريح)؛ غيره يسجّل نفسه فقط
  const targetId = (callerRole === 'manager' && req.body?.staff_user_id) || req.staff?.staff_user_id;
  if (callerRole !== 'manager' && req.body?.staff_user_id && req.body.staff_user_id !== req.staff?.staff_user_id) {
    res.status(403).json({ error: 'Only a manager can clock in other staff.' });
    return;
  }
  // وقت صريح للحالات الاستثنائية (صفحة التسجيل) — الافتراضي الآن.
  // staff_shifts بلا عمود ملاحظات: الملاحظة تُوثَّق في سجل الأنشطة.
  let at: Date | null = null;
  if (req.body?.clock_in !== undefined && req.body.clock_in !== null && req.body.clock_in !== '') {
    at = new Date(req.body.clock_in);
    if (Number.isNaN(at.getTime())) { res.status(400).json({ error: 'Invalid clock-in time.' }); return; }
    if (at.getTime() > Date.now() + 5 * 60_000) { res.status(400).json({ error: 'Clock-in time cannot be in the future.' }); return; }
  }
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
  try {
    const who = await query(
      `SELECT id, full_name, role, is_active FROM staff_users WHERE id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
      [targetId, gym_id]
    );
    if (who.rows.length === 0 || !who.rows[0].is_active) {
      res.status(400).json({ error: 'Staff not found or inactive in this gym.' });
      return;
    }
    const open = await query(`SELECT id FROM staff_shifts WHERE staff_user_id=$1 AND gym_id=$2 AND clock_out IS NULL`, [targetId, gym_id]);
    if (open.rows.length > 0) { res.status(400).json({ error: 'Already clocked in' }); return; }
    const r = await query(
      `INSERT INTO staff_shifts (gym_id, staff_user_id, clock_in) VALUES ($1,$2,$3) RETURNING *`,
      [gym_id, targetId, at ? at.toISOString() : new Date().toISOString()]
    );
    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description) VALUES ($1,$2,$3)`,
      [gym_id, req.staff?.staff_user_id, `Coach clock-in: ${who.rows[0].full_name}${note ? ` — ملاحظة: ${note}` : ''}`]
    ).catch(() => undefined);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('clockIn failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// التسجيل الجماعي: حضور كل المدربين النشطين بلا شيفت مفتوح (أو المحددين)
// — يُوثَّق كحدث واحد في السجل لا N حدثًا متطابقًا.
export const bulkClockInCoaches = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const ids: string[] | undefined = Array.isArray(req.body?.coach_ids) ? req.body.coach_ids : undefined;
  try {
    const eligible = await query(
      `SELECT su.id, su.full_name FROM staff_users su
       WHERE su.gym_id = $1 AND su.role = 'coach' AND su.is_active = true AND su.deleted_at IS NULL
         ${ids && ids.length ? 'AND su.id = ANY($2)' : ''}
         AND NOT EXISTS (SELECT 1 FROM staff_shifts ss
           WHERE ss.staff_user_id = su.id AND ss.gym_id = su.gym_id AND ss.clock_out IS NULL)`,
      ids && ids.length ? [gym_id, ids] : [gym_id]
    );
    if (eligible.rows.length === 0) {
      res.status(400).json({ error: 'No eligible coaches — everyone is already clocked in.' });
      return;
    }
    const r = await query(
      `INSERT INTO staff_shifts (gym_id, staff_user_id)
       SELECT $1, unnest($2::uuid[]) RETURNING id`,
      [gym_id, eligible.rows.map((x) => x.id)]
    );
    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description) VALUES ($1,$2,$3)`,
      [gym_id, req.staff?.staff_user_id, `تسجيل حضور جماعي: ${eligible.rows.length} مدرب (${eligible.rows.map((x) => x.full_name).join('، ')})`]
    ).catch(() => undefined);
    res.status(201).json({ data: { count: r.rows.length, coaches: eligible.rows.map((x) => x.full_name) } });
  } catch (e: any) { logger.error('bulkClockInCoaches failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// تصحيح يدوي لصف حضور (وقت دخول/انصراف) — المدير فقط
export const updateShift = async (req: Request, res: Response) => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const { clock_in, clock_out } = req.body as { clock_in?: string | null; clock_out?: string | null };
  try {
    const cur = await query(`SELECT id, clock_in, clock_out FROM staff_shifts WHERE id = $1 AND gym_id = $2`, [id, gym_id]);
    if (cur.rows.length === 0) { res.status(404).json({ error: 'Shift not found' }); return; }
    const nextIn = clock_in !== undefined ? (clock_in ? new Date(clock_in) : null) : new Date(cur.rows[0].clock_in);
    const nextOut = clock_out !== undefined ? (clock_out ? new Date(clock_out) : null) : (cur.rows[0].clock_out ? new Date(cur.rows[0].clock_out) : null);
    if (!nextIn || Number.isNaN(nextIn.getTime())) { res.status(400).json({ error: 'Invalid clock-in time.' }); return; }
    if (nextOut && (Number.isNaN(nextOut.getTime()) || nextOut <= nextIn)) {
      res.status(400).json({ error: 'Clock-out must be after clock-in.' });
      return;
    }
    const r = await query(
      `UPDATE staff_shifts SET clock_in = $1, clock_out = $2 WHERE id = $3 AND gym_id = $4 RETURNING *`,
      [nextIn.toISOString(), nextOut ? nextOut.toISOString() : null, id, gym_id]
    );
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('updateShift failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// === COACH ATTENDANCE (trainer-attendance page) ===
// سجل يوم + إحصائيات (الإجمالي/حضر/متواجد/غائب) + تخصص كل مدرب
export const listCoachAttendance = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const raw = String(req.query.date ?? '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().split('T')[0];
  const coachId = String(req.query.coach_id ?? '').trim() || null;
  try {
    const rows = await query(
      `SELECT ss.id AS shift_id, su.id AS staff_id, su.full_name, su.phone, su.is_active,
              ss.clock_in, ss.clock_out,
              CASE WHEN ss.clock_out IS NULL THEN NULL
                   ELSE (EXTRACT(EPOCH FROM (ss.clock_out - ss.clock_in)) / 60)::int END AS duration_min,
              (SELECT ms.sport FROM member_subscriptions ms
                WHERE ms.coach_id = su.id AND ms.gym_id = su.gym_id
                  AND ms.deleted_at IS NULL AND ms.status = 'active' AND ms.sport IS NOT NULL
                GROUP BY ms.sport ORDER BY COUNT(*) DESC LIMIT 1) AS sport_mode
       FROM staff_shifts ss
       JOIN staff_users su ON su.id = ss.staff_user_id
       WHERE ss.gym_id = $1 AND su.role = 'coach' AND su.deleted_at IS NULL
         AND ss.clock_in::date = $2::date
         ${coachId ? 'AND su.id = $3' : ''}
       ORDER BY ss.clock_in ASC`,
      coachId ? [gym_id, date, coachId] : [gym_id, date]
    );
    const stats = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM staff_users WHERE gym_id = $1 AND role = 'coach' AND is_active = true AND deleted_at IS NULL) AS total,
         (SELECT COUNT(DISTINCT ss.staff_user_id)::int FROM staff_shifts ss
           JOIN staff_users su ON su.id = ss.staff_user_id
           WHERE ss.gym_id = $1 AND su.role = 'coach' AND ss.clock_in::date = $2::date) AS present,
         (SELECT COUNT(DISTINCT ss.staff_user_id)::int FROM staff_shifts ss
           JOIN staff_users su ON su.id = ss.staff_user_id
           WHERE ss.gym_id = $1 AND su.role = 'coach' AND ss.clock_out IS NULL) AS now_present`,
      [gym_id, date]
    );
    const total = Number(stats.rows[0]?.total ?? 0);
    const present = Number(stats.rows[0]?.present ?? 0);
    res.json({
      data: rows.rows,
      stats: { total, present, now_present: Number(stats.rows[0]?.now_present ?? 0), absent: Math.max(0, total - present) },
      date,
    });
  } catch (e: any) { logger.error('listCoachAttendance failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

// تقرير حضور المدربين الشهري: أيام الحضور + مجموع المدد الفعلية (مجموع
// دقائق الشيفتات المغلقة — لا صفر وهمي) + أبكر حضور/آخر انصراف (min/max).
// المقام الموثق لنسبة الحضور: أيام العمل في الشهر = أيام الشهر ناقص
// الجمعات، وبحد أقصى الأيام المنقضية للشهر الجاري.
export const coachAttendanceReport = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const raw = String(req.query.month ?? '').trim();
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 7);
  try {
    const work = await query(
      `SELECT COUNT(*)::int AS working_days
       FROM generate_series(
         date_trunc('month', ($1 || '-01')::date),
         LEAST((date_trunc('month', ($1 || '-01')::date) + interval '1 month' - interval '1 day')::date, CURRENT_DATE),
         '1 day') d
       WHERE EXTRACT(DOW FROM d) <> 5`,
      [month]
    );
    const workingDays = Number(work.rows[0]?.working_days ?? 0);
    const coachId = String(req.query.coach_id ?? '').trim() || null;
    const r = await query(
      `SELECT su.id, su.full_name,
              COUNT(DISTINCT ss.clock_in::date)::int AS days_present,
              COALESCE(SUM(CASE WHEN ss.clock_out IS NOT NULL
                THEN EXTRACT(EPOCH FROM (ss.clock_out - ss.clock_in)) / 60 END), 0)::int AS total_min,
              to_char(MIN(ss.clock_in), 'HH24:MI') AS earliest_in,
              to_char(MAX(ss.clock_out), 'HH24:MI') AS latest_out,
              (SELECT ms.sport FROM member_subscriptions ms
                WHERE ms.coach_id = su.id AND ms.gym_id = su.gym_id
                  AND ms.deleted_at IS NULL AND ms.status = 'active' AND ms.sport IS NOT NULL
                GROUP BY ms.sport ORDER BY COUNT(*) DESC LIMIT 1) AS sport_mode
       FROM staff_users su
       LEFT JOIN staff_shifts ss ON ss.staff_user_id = su.id AND ss.gym_id = su.gym_id
         AND to_char(ss.clock_in, 'YYYY-MM') = $2
       WHERE su.gym_id = $1 AND su.role = 'coach' AND su.is_active = true AND su.deleted_at IS NULL
         ${coachId ? 'AND su.id = $3' : ''}
       GROUP BY su.id, su.full_name
       ORDER BY days_present DESC, su.full_name ASC`,
      coachId ? [gym_id, month, coachId] : [gym_id, month]
    );
    res.json({
      data: r.rows.map((x) => ({
        ...x,
        attendance_pct: workingDays > 0 ? Math.round((Number(x.days_present) * 100) / workingDays) : 0,
      })),
      month,
      working_days: workingDays,
    });
  } catch (e: any) { logger.error('coachAttendanceReport failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
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

// ====================================================================
// LOGIN CODES — receptionist/coach phone + code sign-in
// (083_staff_login_code.sql; the credential itself lives in loginCode.ts)
// ====================================================================

/** Roles that sign in with a phone + code. Managers keep email + password. */
const CODE_LOGIN_ROLE_FILTER = `role <> 'manager'`;

/**
 * POST /api/staff/:id/login-code-reset
 * Issues a new code for one staff member and returns it ONCE (same contract as
 * the member PIN reset). `?send=whatsapp` also pushes it to the staff phone.
 */
export const resetStaffLoginCode = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  const { id } = req.params;
  const wantsSend = req.query.send === 'whatsapp' || req.body?.send === 'whatsapp';
  try {
    const r = await query(
      `SELECT id, full_name, phone, role FROM staff_users
        WHERE id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
      [id, gym_id]
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Staff not found' }); return; }

    const staff = r.rows[0];
    if (staff.role === 'manager') {
      res.status(400).json({
        error: 'MANAGER_ACCOUNT',
        message: 'حساب الإدارة بيدخل بالإيميل وكلمة المرور — مش بالكود.',
      });
      return;
    }
    if (!staff.phone) {
      res.status(400).json({
        error: 'NO_PHONE',
        message: 'ضيف رقم موبايل للموظف الأول — الكود بيتكتب مع الرقم.',
      });
      return;
    }

    const code = await issueLoginCode('staff', id, gym_id);
    const sent = wantsSend ? await sendLoginCode(staff.phone, code, staff.full_name) : false;

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, staff_user_id, `Issued a login code for ${staff.full_name}`, req.ip]
    );

    // `sent` says the provider accepted it; `channel` says whether a provider
    // exists at all — `console` only writes a log line (see whatsapp.ts), so the
    // UI must not claim a message was delivered.
    res.status(200).json({ data: { code, sent, phone: staff.phone, full_name: staff.full_name, channel: whatsapp.getProvider() } });
  } catch (e: any) { logger.error('resetStaffLoginCode failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

/**
 * POST /api/staff/login-codes/bulk  { limit?, send? }
 *
 * Issues a code for every receptionist/coach that has a phone and none yet —
 * the cut-over path for accounts created before 083. Chunked on purpose: see
 * issueLoginCodes() for the measured bcrypt budget, and note the response's
 * `remaining`, which the client loops on (no long-lived request).
 *
 * `skipped_no_phone` is reported rather than hidden: a staff account without a
 * phone can never sign in this way, and the manager has to fix the profile.
 */
export const staffLoginCodesBulk = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  const limit = Math.min(Math.max(Number(req.body?.limit) || 100, 1), 200);
  const wantsSend = req.body?.send === true || req.body?.send === 'whatsapp';
  try {
    const r = await query(
      `SELECT id, full_name, phone FROM staff_users
        WHERE gym_id = $1 AND deleted_at IS NULL AND is_active
          AND ${CODE_LOGIN_ROLE_FILTER}
          AND phone IS NOT NULL AND BTRIM(phone) <> ''
          AND login_code_hash IS NULL
        ORDER BY employee_code NULLS LAST, full_name
        LIMIT $2`,
      [gym_id, limit]
    );

    const codes = await issueLoginCodes('staff', r.rows.map((s: any) => s.id), gym_id);
    const generated = r.rows.map((s: any, i: number) => ({ id: s.id, name: s.full_name, phone: s.phone, code: codes[i] }));

    if (wantsSend && generated.length) {
      // Sequential: each send is a network round trip to the provider.
      for (const g of generated) await sendLoginCode(g.phone, g.code, g.name);
    }

    const rest = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM staff_users
           WHERE gym_id = $1 AND deleted_at IS NULL AND is_active AND ${CODE_LOGIN_ROLE_FILTER}
             AND phone IS NOT NULL AND BTRIM(phone) <> '' AND login_code_hash IS NULL) AS remaining,
         (SELECT COUNT(*)::int FROM staff_users
           WHERE gym_id = $1 AND deleted_at IS NULL AND is_active AND ${CODE_LOGIN_ROLE_FILTER}
             AND (phone IS NULL OR BTRIM(phone) = '')) AS skipped_no_phone`,
      [gym_id]
    );

    const summary = rest.rows[0] || { remaining: 0, skipped_no_phone: 0 };
    if (generated.length) {
      await query(
        `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [gym_id, staff_user_id, `Issued login codes for ${generated.length} staff member(s)`, req.ip]
      );
    }

    res.status(200).json({ data: { generated, ...summary, sent: wantsSend, channel: whatsapp.getProvider() } });
  } catch (e: any) { logger.error('staffLoginCodesBulk failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};
