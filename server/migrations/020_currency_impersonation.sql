-- ====================================================================
-- Gimawi v1.0 — Phase 1 Improvements
-- 1. Multi-currency support per gym
-- 2. Platform admins management (RBAC)
-- ====================================================================

-- 1. Add currency column to gyms
ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EGP' NOT NULL;

-- 2. Add role_type to platform_admins for RBAC
ALTER TABLE platform_admins
  ADD COLUMN IF NOT EXISTS role_type VARCHAR(50) DEFAULT 'super_admin' NOT NULL;

-- Update existing platform admins to super_admin
UPDATE platform_admins SET role_type = 'super_admin' WHERE role_type IS NULL;

-- 3. Add last_login_at to platform_admins if not exists
ALTER TABLE platform_admins
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
