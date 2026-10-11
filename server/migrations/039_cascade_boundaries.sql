-- ====================================================================
-- Migration 039: Cascade Boundaries
-- ====================================================================
-- Ensures strict ON DELETE CASCADE boundaries from tenant master record
-- to all tenant-scoped tables to maintain data integrity on tenant removal.

-- gym_usage_counters
ALTER TABLE IF EXISTS gym_usage_counters
  DROP CONSTRAINT IF EXISTS gym_usage_counters_gym_id_fkey,
  ADD CONSTRAINT gym_usage_counters_gym_id_fkey
    FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE;

-- branches
ALTER TABLE IF EXISTS branches
  DROP CONSTRAINT IF EXISTS branches_gym_id_fkey,
  ADD CONSTRAINT branches_gym_id_fkey
    FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE;

-- billing_invoices
ALTER TABLE IF EXISTS billing_invoices
  DROP CONSTRAINT IF EXISTS billing_invoices_gym_id_fkey,
  ADD CONSTRAINT billing_invoices_gym_id_fkey
    FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE;

-- Refresh existing indexes for clarity
CREATE INDEX IF NOT EXISTS idx_gym_usage_counters_gym ON gym_usage_counters(gym_id);
CREATE INDEX IF NOT EXISTS idx_branches_gym ON branches(gym_id);
