-- 024_onboarding_wizard.sql
-- Onboarding Wizard: tracks super admin onboarding progress
-- Adds platform_settings table for global platform-level configuration

-- 1. Platform settings table (key-value store for platform-level config)
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(128) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Onboarding progress tracking per admin
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}';

-- 3. Default platform settings (seeded via INSERT ON CONFLICT)
INSERT INTO platform_settings (key, value) VALUES
  ('setup.onboarding_required', 'true'),
  ('setup.default_currency', '"EGP"'),
  ('setup.default_timezone', '"Africa/Cairo"'),
  ('setup.vat_percentage', '14'),
  ('setup.platform_name', '"GymCore"'),
  ('setup.platform_logo', '""'),
  ('setup.support_email', '"support@gymcore.app"')
ON CONFLICT (key) DO NOTHING;

-- 4. Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_platform_admins_onboarding ON platform_admins (onboarding_complete) WHERE onboarding_complete = false;
