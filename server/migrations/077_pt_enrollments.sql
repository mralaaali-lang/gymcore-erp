-- 077: private training enrollments (البرايفت) — منتج مستقل بذاته:
-- عضو + مدرب + رصيد حصص + فلوس. ليس باشتراك ولا باقة (تسعير حر).
-- used/total للحصص + total/paid/remaining للفلوس ظاهران معًا دائمًا.
-- ديون البرايفت تُشتق kind='pt' من نص السبب (نفس عرف الديون المشتقة).
CREATE TABLE IF NOT EXISTS pt_enrollments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  coach_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  total_sessions integer NOT NULL CHECK (total_sessions >= 1),
  sessions_used integer NOT NULL DEFAULT 0 CHECK (sessions_used >= 0),
  session_price numeric NOT NULL CHECK (session_price >= 0),
  total_amount numeric NOT NULL CHECK (total_amount >= 0),
  paid_amount numeric NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  remaining numeric NOT NULL DEFAULT 0 CHECK (remaining >= 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status character varying(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  notes text,
  created_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pte_gym_status ON pt_enrollments(gym_id, status);
CREATE INDEX IF NOT EXISTS idx_pte_member ON pt_enrollments(member_id);
