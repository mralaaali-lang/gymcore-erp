-- 076: quick sessions (الحصة السريعة) — SKU مستقل بسعر ثابت للزائر.
-- Not a membership_offers row: no subscription is created, ever.
-- paid>0 ⇒ financial_transactions payment row; remaining>0 ⇒ member_debts
-- row (registered members only — debts require a member_id).
-- with_attendance inserts attendance_logs.entry_method='quick_session'.
CREATE TABLE IF NOT EXISTS quick_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  client_name character varying(255) NOT NULL,
  session_name character varying(255) NOT NULL DEFAULT 'حصة',
  price numeric NOT NULL CHECK (price >= 0),
  paid numeric NOT NULL DEFAULT 0 CHECK (paid >= 0),
  remaining numeric NOT NULL DEFAULT 0 CHECK (remaining >= 0),
  payment_method character varying(30) NOT NULL DEFAULT 'cash',
  coach_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  session_time timestamptz NOT NULL DEFAULT NOW(),
  attendance_logged boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qs_gym_time ON quick_sessions(gym_id, session_time DESC);

ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS chk_entry_method;
ALTER TABLE attendance_logs ADD CONSTRAINT chk_entry_method
  CHECK (entry_method IN ('qr_code', 'manual_phone', 'import', 'quick_session'));
