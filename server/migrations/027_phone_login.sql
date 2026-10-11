-- ====================================================================
-- 027 — Phone login support for platform admins
-- ====================================================================
-- WHY THIS MIGRATION EXISTS:
-- The AdminLoginPage now supports phone-number-based login alongside
-- email login. Platform admins previously only had an `email` column;
-- this adds `phone_number` so they can sign in with either credential.
--
-- The `staff_users` table already has `phone_number` (unique per gym),
-- so no changes are needed there — only the staffLogin controller needs
-- to accept phone_number as an alternative to email.
-- ====================================================================

ALTER TABLE platform_admins
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50) UNIQUE;

COMMENT ON COLUMN platform_admins.phone_number IS
  'Optional phone number for platform admin login. UNIQUE when set.';
