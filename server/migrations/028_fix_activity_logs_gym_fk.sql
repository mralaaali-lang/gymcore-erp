-- ====================================================================
-- 020_fix_activity_logs_gym_fk.sql
-- --------------------------------------------------------------------
-- Problem: Deleting a gym cascaded to DELETE its activity_logs rows
-- via `ON DELETE CASCADE` on activity_logs(gym_id). The activity_logs
-- table is protected by trg_protect_activity_logs (immutable audit log)
-- which raises TABLE_IS_IMMUTABLE on any DELETE/UPDATE. This caused the
-- entire gym-delete transaction to fail.
--
-- Fix: Drop the FK entirely so a deleted gym leaves its audit trail
-- intact (orphaned rows with gym_id = NULL). Audit logs are never
-- destroyed, satisfying both the immutability requirement and allowing
-- gym deletion. (ON DELETE SET NULL was also rejected by the trigger
-- because nulling gym_id is an UPDATE on the protected table.)
-- ====================================================================

-- Allow gym_id to be nullable so orphaned logs can keep their row.
ALTER TABLE activity_logs ALTER COLUMN gym_id DROP NOT NULL;

-- Drop the FK entirely. The activity_logs table is an immutable audit
-- trail protected by trg_protect_activity_logs, which blocks BOTH DELETE
-- and UPDATE on its rows. The original ON DELETE CASCADE therefore failed
-- (tried to DELETE child rows), and ON DELETE SET NULL also failed (it
-- issues an UPDATE to null the gym_id, which the trigger blocks too).
-- The correct behavior for an audit log is to keep the rows forever, so we
-- remove the FK constraint completely. Orphaned logs (gym_id = NULL) remain
-- as a permanent record and never block gym deletion.
ALTER TABLE activity_logs
    DROP CONSTRAINT IF EXISTS activity_logs_gym_id_fkey;
