-- ====================================================================
-- Migration 036: Gym Directory + Consumption Tracking + DB Architecture
-- ====================================================================
-- Builds on existing billing_plans (extends it), creates:
--   - tenants       — gym/tenant directory with billing cycle + subscription
--   - gym_usage_counters — live consumption counters per tenant
--   - branches      — branch locations per tenant
-- Plus seed/update for plans and triggers for automatic counter updates.

-- ====================================================================
-- 1. EXTEND billing_plans (existing table from 011/034)
-- ====================================================================
ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS max_employees int NOT NULL DEFAULT 5;
ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS max_branches int NOT NULL DEFAULT 1;
ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS has_dashboard boolean NOT NULL DEFAULT true;
ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS has_attendance boolean NOT NULL DEFAULT true;
ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS has_products boolean NOT NULL DEFAULT false;
ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS has_daily_reports boolean NOT NULL DEFAULT false;

-- Update the 4 canonical plans with full feature flags
UPDATE billing_plans SET
  max_employees = CASE name
    WHEN 'Starter' THEN 2
    WHEN 'Growth' THEN 5
    WHEN 'Pro' THEN -1
    WHEN 'Enterprise' THEN -1
    ELSE max_employees
  END,
  max_branches = CASE name
    WHEN 'Starter' THEN 1
    WHEN 'Growth' THEN 1
    WHEN 'Pro' THEN 1
    WHEN 'Enterprise' THEN -1
    ELSE max_branches
  END,
  has_dashboard = true,
  has_attendance = true,
  has_products = CASE WHEN name IN ('Growth','Pro','Enterprise') THEN true ELSE false END,
  has_daily_reports = CASE WHEN name IN ('Growth','Pro','Enterprise') THEN true ELSE false END
WHERE name IN ('Starter','Growth','Pro','Enterprise');

-- ====================================================================
-- 2. TENANTS TABLE
-- ====================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_name                varchar(255) NOT NULL,
  subdomain               varchar(100) UNIQUE NOT NULL,
  plan_id                 uuid REFERENCES billing_plans(id),
  billing_cycle           varchar(20) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  status                  varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','expired','trial')),
  subscription_expires_at timestamptz,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backfill tenants from existing gyms
INSERT INTO tenants (gym_name, subdomain, plan_id, billing_cycle, status, subscription_expires_at, is_active, created_at)
SELECT
  g.name,
  g.subdomain,
  g.plan_id,
  'monthly',
  COALESCE(g.subscription_status, 'active'),
  g.subscription_expires_at,
  g.is_active,
  g.created_at
FROM gyms g
ON CONFLICT (subdomain) DO NOTHING;

-- ====================================================================
-- 3. GYM USAGE COUNTERS TABLE
-- ====================================================================
CREATE TABLE IF NOT EXISTS gym_usage_counters (
  gym_id                uuid PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  current_members_count  int NOT NULL DEFAULT 0,
  current_staff_count    int NOT NULL DEFAULT 0,
  current_branches_count int NOT NULL DEFAULT 0,
  updated_at             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Initialize counters from existing data
INSERT INTO gym_usage_counters (gym_id, current_members_count, current_staff_count, current_branches_count)
SELECT
  g.id,
  (SELECT COUNT(*)::int FROM members m WHERE m.gym_id = g.id AND m.is_blacklisted = false),
  (SELECT COUNT(*)::int FROM staff_users s WHERE s.gym_id = g.id AND s.is_active = true),
  0
FROM gyms g
ON CONFLICT (gym_id) DO NOTHING;

-- ====================================================================
-- 4. BRANCHES TABLE
-- ====================================================================
CREATE TABLE IF NOT EXISTS branches (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id      uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name        varchar(255) NOT NULL,
  address     text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_branches_gym ON branches(gym_id);

-- ====================================================================
-- 5. TRIGGERS — auto-update gym_usage_counters
-- ====================================================================

-- Members: increment on insert, decrement on delete (or blacklist change)
CREATE OR REPLACE FUNCTION trg_update_member_counter()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO gym_usage_counters (gym_id, current_members_count, current_staff_count, current_branches_count, updated_at)
    VALUES (NEW.gym_id, 1, 0, 0, CURRENT_TIMESTAMP)
    ON CONFLICT (gym_id) DO UPDATE SET
      current_members_count = gym_usage_counters.current_members_count + 1,
      updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE gym_usage_counters
    SET current_members_count = GREATEST(current_members_count - 1, 0),
        updated_at = CURRENT_TIMESTAMP
    WHERE gym_id = OLD.gym_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_member_counter ON members;
CREATE TRIGGER trg_member_counter
AFTER INSERT OR DELETE ON members
FOR EACH ROW EXECUTE FUNCTION trg_update_member_counter();

-- Staff: increment on insert (active), decrement on delete or deactivation
CREATE OR REPLACE FUNCTION trg_update_staff_counter()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO gym_usage_counters (gym_id, current_members_count, current_staff_count, current_branches_count, updated_at)
    VALUES (NEW.gym_id, 0, CASE WHEN NEW.is_active THEN 1 ELSE 0 END, 0, CURRENT_TIMESTAMP)
    ON CONFLICT (gym_id) DO UPDATE SET
      current_staff_count = gym_usage_counters.current_staff_count + CASE WHEN NEW.is_active THEN 1 ELSE 0 END,
      updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE gym_usage_counters
    SET current_staff_count = GREATEST(current_staff_count - CASE WHEN OLD.is_active THEN 1 ELSE 0 END, 0),
        updated_at = CURRENT_TIMESTAMP
    WHERE gym_id = OLD.gym_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_active <> OLD.is_active THEN
      UPDATE gym_usage_counters
      SET current_staff_count = current_staff_count + CASE WHEN NEW.is_active THEN 1 ELSE -1 END,
          updated_at = CURRENT_TIMESTAMP
      WHERE gym_id = NEW.gym_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_counter ON staff_users;
CREATE TRIGGER trg_staff_counter
AFTER INSERT OR DELETE OR UPDATE OF is_active ON staff_users
FOR EACH ROW EXECUTE FUNCTION trg_update_staff_counter();

-- Branches: increment on insert, decrement on delete
CREATE OR REPLACE FUNCTION trg_update_branch_counter()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO gym_usage_counters (gym_id, current_members_count, current_staff_count, current_branches_count, updated_at)
    VALUES (NEW.gym_id, 0, 0, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (gym_id) DO UPDATE SET
      current_branches_count = gym_usage_counters.current_branches_count + 1,
      updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE gym_usage_counters
    SET current_branches_count = GREATEST(current_branches_count - 1, 0),
        updated_at = CURRENT_TIMESTAMP
    WHERE gym_id = OLD.gym_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_branch_counter ON branches;
CREATE TRIGGER trg_branch_counter
AFTER INSERT OR DELETE ON branches
FOR EACH ROW EXECUTE FUNCTION trg_update_branch_counter();

-- ====================================================================
-- 6. INDEXES
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_gyms_plan_id ON gyms(plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gyms_subscription_status ON gyms(subscription_status);
CREATE INDEX IF NOT EXISTS idx_tenants_plan_id ON tenants(plan_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_gym_usage_counters_gym ON gym_usage_counters(gym_id);
CREATE INDEX IF NOT EXISTS idx_branches_gym_id ON branches(gym_id);
