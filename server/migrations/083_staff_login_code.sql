-- ====================================================================
-- 083 — Staff login code (phone + code sign-in for reception & trainers)
-- ====================================================================
-- WHY THIS MIGRATION EXISTS:
-- Member accounts have signed in with phone + code since 010_member_pin.sql
-- (members.pin_code_hash). Reception and trainer accounts had no equivalent:
-- they signed in with email + password, and the only code they owned was
-- staff_users.pin_hash — which is the HR self check-in PIN, typed on the
-- shared front-desk kiosk and easily watched over a shoulder. One secret
-- must not be both a kiosk punch-in and a full application login, so the
-- login code gets its own column.
--
-- Runtime behaviour lives in:
--   services/loginCode.ts        issue / hash (every caller shows the code once)
--   controllers/auth.ts          staffLoginByCode, forgotLoginCode
--   controllers/staff.ts         resetStaffLoginCode, staffLoginCodesCsv
-- ====================================================================

ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS login_code_hash VARCHAR(255);

COMMENT ON COLUMN staff_users.login_code_hash IS
  'Bcrypt hash of the staff member''s login code (phone + code sign-in for '
  'receptionist/coach accounts). Deliberately separate from pin_hash, which '
  'is the HR self check-in PIN. Never store or query this in plaintext.';

-- Sign-in looks the account up by phone (`staff_users` was only ever indexed
-- by id/email before), so give that lookup an index of its own. Partial: rows
-- without a phone or already soft-deleted can never match.
CREATE INDEX IF NOT EXISTS idx_staff_users_phone
  ON staff_users (phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;
