-- ====================================================================
-- 010 — Member PIN login (bug fix)
-- ====================================================================
-- WHY THIS MIGRATION EXISTS:
-- controllers/mobile.ts's memberLogin has always queried
-- `WHERE m.phone_number = $1 AND m.pin_code = $2`, but no `pin_code` column
-- ever existed on `members`, and nothing anywhere ever set one. Verified by
-- actually running the app end-to-end: member login throws a Postgres
-- "column does not exist" error on every attempt — the member self-login
-- feature has never worked.
--
-- Storing a plaintext PIN column (which the original query implies) is also
-- not great practice even for a short PIN, since it's still a credential.
-- This migration adds a HASHED column instead; the fix in createMember /
-- memberLogin (application code) generates the PIN, hashes it with bcrypt,
-- and compares with bcrypt.compare rather than a plain SQL equality check.
-- ====================================================================

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS pin_code_hash VARCHAR(255);

COMMENT ON COLUMN members.pin_code_hash IS
  'Bcrypt hash of the member''s login PIN (used for phone+PIN self-service '
  'login). Never store or query this in plaintext.';
