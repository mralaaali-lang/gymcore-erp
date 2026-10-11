-- ====================================================================
-- 041 — Soft Delete Foundations & Audit Log Enhancements
-- ====================================================================

BEGIN;

-- 1. SOFT DELETE FOUNDATION
--    Add deleted_at timestamp to gyms as the entry point for soft delete.
--    This enables a 30-day retention window before physical sweep.
ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_gyms_deleted_at
  ON gyms(deleted_at);

-- 2. AUDIT LOG ENHANCEMENTS
--    Capture administrative adjustments against incoming IP variables.
ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS ip_address_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 3. SANDBOX MODE FLAG
--    Isolated state flag allowing dummy invoices and test attendance.
ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS sandbox_mode BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_gyms_sandbox_mode
  ON gyms(sandbox_mode);

COMMIT;
