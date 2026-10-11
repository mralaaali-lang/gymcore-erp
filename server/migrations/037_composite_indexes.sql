-- ====================================================================
-- Migration 037: Composite Unique Indexes
-- ====================================================================
-- Adds composite unique constraints and supporting indexes to enforce
-- tenant-scoped uniqueness and improve lookup performance.

-- 1) staff_users: unique email within each tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_users_tenant_email
ON staff_users(gym_id, email);

-- 2) members: unique phone_number within each tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_tenant_phone
ON members(gym_id, phone_number);

-- 3) tenants: subdomain must remain globally unique
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_subdomain
ON tenants(subdomain);

-- 4) Supporting indexes for frequent lookups
CREATE INDEX IF NOT EXISTS idx_staff_users_gym ON staff_users(gym_id);
CREATE INDEX IF NOT EXISTS idx_members_gym ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_tenants_plan_id ON tenants(plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
