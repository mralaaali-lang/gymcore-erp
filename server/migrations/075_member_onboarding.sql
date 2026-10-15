-- 075: member onboarding fields (حقول تسجيل العضو).
-- national_id / emergency_phone / address / notes: plain nullable profile data.
-- allowed_days NULL/empty = all days; else check-in is refused on other days
-- (rules enforced in performCheckIn for QR + manual flows alike).
-- sales_rep_id: responsible staffer (nullable, SET NULL on staff delete).
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS national_id character varying(30),
  ADD COLUMN IF NOT EXISTS emergency_phone character varying(50),
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS allowed_days text[],
  ADD COLUMN IF NOT EXISTS sales_rep_id uuid REFERENCES staff_users(id) ON DELETE SET NULL;
