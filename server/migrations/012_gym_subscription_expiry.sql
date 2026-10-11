-- ====================================================================
-- 012 — Add subscription_expires_at to gyms for the super-admin
--        TenantDirectory dashboard (members count + expiry date columns)
-- ====================================================================

ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

COMMENT ON COLUMN gyms.subscription_expires_at IS
  'Date/time when the gym''s current subscription plan expires. Managed by
   the super-admin via the platform billing UI.';
