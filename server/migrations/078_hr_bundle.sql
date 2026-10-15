-- 078: HR bundle (شئون الموظفين).
-- staff_users: كود مسلسل + ملف وظيفي (قسم/مسمى/تعيين/شيفت/سماح تأخير/
-- إجازة أسبوعية/PIN حضور ذاتي مشفّر) + بدلات + 3 أرصدة إجازات.
-- hr_leave_requests: الطلب يُخصم من الرصيد لحظة الاعتماد لا الطلب.
-- hr_adjustments: مكافأة/خصم/سلفة (السلفة تُسدد بالتقسيط عبر المسير).
-- hr_payroll_runs + items: مسير شهري (مسودة ← معتمد ← مصروف).
-- hr_contracts: أرقام CON- متسلسلة لا تُعاد (الفجوات audit trail).
-- hr_attendance: تحضير يومي (حاضر/متأخر/غائب/إجازة/مرضية).
ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS employee_code character varying(20),
  ADD COLUMN IF NOT EXISTS department character varying(100),
  ADD COLUMN IF NOT EXISTS job_title character varying(100),
  ADD COLUMN IF NOT EXISTS national_id character varying(30),
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender character varying(10),
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS shift_start time,
  ADD COLUMN IF NOT EXISTS shift_end time,
  ADD COLUMN IF NOT EXISTS late_allowance_min integer NOT NULL DEFAULT 0 CHECK (late_allowance_min >= 0),
  ADD COLUMN IF NOT EXISTS weekly_off text[],
  ADD COLUMN IF NOT EXISTS pin_hash character varying(255),
  ADD COLUMN IF NOT EXISTS housing_allowance numeric NOT NULL DEFAULT 0 CHECK (housing_allowance >= 0),
  ADD COLUMN IF NOT EXISTS transport_allowance numeric NOT NULL DEFAULT 0 CHECK (transport_allowance >= 0),
  ADD COLUMN IF NOT EXISTS other_allowance numeric NOT NULL DEFAULT 0 CHECK (other_allowance >= 0),
  ADD COLUMN IF NOT EXISTS annual_leave_days numeric NOT NULL DEFAULT 21 CHECK (annual_leave_days >= 0),
  ADD COLUMN IF NOT EXISTS sick_leave_days numeric NOT NULL DEFAULT 7 CHECK (sick_leave_days >= 0),
  ADD COLUMN IF NOT EXISTS monthly_leave_days numeric NOT NULL DEFAULT 2 CHECK (monthly_leave_days >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_gym_code ON staff_users(gym_id, employee_code);

-- Backfill EMP0001… per gym by creation order (NULLs never collide).
DO $$
DECLARE g record;
BEGIN
  FOR g IN SELECT id FROM gyms LOOP
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
      FROM staff_users WHERE gym_id = g.id AND employee_code IS NULL
    )
    UPDATE staff_users s SET employee_code = 'EMP' || LPAD((COALESCE((
      SELECT MAX(CASE WHEN employee_code ~ '^EMP[0-9]+$'
        THEN SUBSTRING(employee_code FROM 4)::int END)
      FROM staff_users WHERE gym_id = g.id), 0) + ranked.rn)::text, 4, '0')
    FROM ranked WHERE s.id = ranked.id;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS hr_leave_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  staff_user_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  leave_type character varying(20) NOT NULL CHECK (leave_type IN ('annual', 'sick', 'unpaid')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL CHECK (days > 0),
  status character varying(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes text,
  decided_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leave_gym_status ON hr_leave_requests(gym_id, status);

CREATE TABLE IF NOT EXISTS hr_adjustments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  staff_user_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  kind character varying(20) NOT NULL CHECK (kind IN ('bonus', 'deduction', 'advance')),
  amount numeric NOT NULL CHECK (amount >= 0),
  repaid numeric NOT NULL DEFAULT 0 CHECK (repaid >= 0),
  installment numeric CHECK (installment IS NULL OR installment >= 0),
  month character varying(7) NOT NULL,
  reason text,
  created_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adj_gym_month ON hr_adjustments(gym_id, month);

CREATE TABLE IF NOT EXISTS hr_payroll_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  month character varying(7) NOT NULL,
  status character varying(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  total_net numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  approved_at timestamptz,
  paid_at timestamptz,
  UNIQUE (gym_id, month)
);
CREATE TABLE IF NOT EXISTS hr_payroll_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id uuid NOT NULL REFERENCES hr_payroll_runs(id) ON DELETE CASCADE,
  staff_user_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  staff_name character varying(255) NOT NULL,
  base numeric NOT NULL DEFAULT 0,
  allowances numeric NOT NULL DEFAULT 0,
  bonus numeric NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  advance_deduction numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  status character varying(20) NOT NULL DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS hr_contracts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  staff_user_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  contract_no character varying(20) NOT NULL,
  contract_type character varying(30) NOT NULL DEFAULT 'دائم',
  start_date date NOT NULL,
  end_date date,
  salary numeric NOT NULL DEFAULT 0 CHECK (salary >= 0),
  status character varying(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  notes text,
  created_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (gym_id, contract_no)
);

CREATE TABLE IF NOT EXISTS hr_attendance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  staff_user_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  status character varying(20) NOT NULL CHECK (status IN ('present', 'late', 'absent', 'leave', 'sick')),
  late_min integer NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (gym_id, staff_user_id, work_date)
);
