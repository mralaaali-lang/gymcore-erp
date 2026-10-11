-- Phase 2ج: RLS Policies and Indexes for Multi-tenant Data Isolation
-- Purpose: Implement Row-Level Security to completely isolate each gym's data
-- Design: Extensible to support all 5 roles (super-admin, gym-admin, trainer, reception, player)

-- Enable RLS on all tenant-specific tables
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_daily_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE recycle_bin ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: Super Admin (can see all gyms and all data)
-- ============================================================================

-- Super Admin can see all gyms (app.gym_id = NULL means super-admin)
DROP POLICY IF EXISTS super_admin_gyms ON gyms;
CREATE POLICY super_admin_gyms ON gyms
  USING (current_setting('app.gym_id', true) IS NULL);

-- Super Admin can see all members across all gyms
DROP POLICY IF EXISTS super_admin_members ON members;
CREATE POLICY super_admin_members ON members
  USING (current_setting('app.gym_id', true) IS NULL);

-- Super Admin can see all subscriptions
DROP POLICY IF EXISTS super_admin_subscriptions ON member_subscriptions;
CREATE POLICY super_admin_subscriptions ON member_subscriptions
  USING (current_setting('app.gym_id', true) IS NULL);

-- Super Admin can see all invoices
DROP POLICY IF EXISTS super_admin_invoices ON billing_invoices;
CREATE POLICY super_admin_invoices ON billing_invoices
  USING (current_setting('app.gym_id', true) IS NULL);

-- Super Admin can see all attendance logs
DROP POLICY IF EXISTS super_admin_attendance ON attendance_logs;
CREATE POLICY super_admin_attendance ON attendance_logs
  USING (current_setting('app.gym_id', true) IS NULL);

-- Super Admin can see all staff sessions
DROP POLICY IF EXISTS super_admin_staff_sessions ON staff_sessions;
CREATE POLICY super_admin_staff_sessions ON staff_sessions
  USING (current_setting('app.gym_id', true) IS NULL);

-- ============================================================================
-- RLS POLICIES: Gym-Level Isolation (for gym-admin and future roles)
-- ============================================================================

-- Each gym (non-admin) can only see their own data
DROP POLICY IF EXISTS gym_isolation_gyms ON gyms;
CREATE POLICY gym_isolation_gyms ON gyms
  USING (
    current_setting('app.gym_id', true) IS NULL  -- Super admin bypass
    OR id = UUID(current_setting('app.gym_id', true))  -- Own gym only
  );

DROP POLICY IF EXISTS gym_isolation_members ON members;
CREATE POLICY gym_isolation_members ON members
  USING (
    current_setting('app.gym_id', true) IS NULL  -- Super admin
    OR gym_id = UUID(current_setting('app.gym_id', true))  -- Own gym only
  );

DROP POLICY IF EXISTS gym_isolation_subscriptions ON member_subscriptions;
CREATE POLICY gym_isolation_subscriptions ON member_subscriptions
  USING (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

-- Note: billing_plans is a global reference table (no gym_id); accessible to all

DROP POLICY IF EXISTS gym_isolation_invoices ON billing_invoices;
CREATE POLICY gym_isolation_invoices ON billing_invoices
  USING (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

DROP POLICY IF EXISTS gym_isolation_attendance ON attendance_logs;
CREATE POLICY gym_isolation_attendance ON attendance_logs
  USING (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

DROP POLICY IF EXISTS gym_isolation_staff ON staff_users;
CREATE POLICY gym_isolation_staff ON staff_users
  USING (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

DROP POLICY IF EXISTS gym_isolation_products ON products;
CREATE POLICY gym_isolation_products ON products
  USING (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

DROP POLICY IF EXISTS gym_isolation_branches ON branches;
CREATE POLICY gym_isolation_branches ON branches
  USING (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

DROP POLICY IF EXISTS gym_isolation_staff_sessions ON staff_sessions;
CREATE POLICY gym_isolation_staff_sessions ON staff_sessions
  USING (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id IS NULL  -- Super admin sessions have NULL gym_id
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

DROP POLICY IF EXISTS gym_isolation_daily_limits ON gym_daily_limits;
CREATE POLICY gym_isolation_daily_limits ON gym_daily_limits
  USING (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

DROP POLICY IF EXISTS gym_isolation_daily_usage ON gym_daily_usage;
CREATE POLICY gym_isolation_daily_usage ON gym_daily_usage
  USING (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

DROP POLICY IF EXISTS gym_isolation_recycle_bin ON recycle_bin;
CREATE POLICY gym_isolation_recycle_bin ON recycle_bin
  USING (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id IS NULL  -- Platform-wide deletions
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

-- ============================================================================
-- WRITE POLICIES (INSERT, UPDATE, DELETE)
-- ============================================================================

-- Members: Can only create in own gym
DROP POLICY IF EXISTS gym_write_members ON members;
CREATE POLICY gym_write_members ON members
  WITH CHECK (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

-- Attendance: Can only create in own gym
DROP POLICY IF EXISTS gym_write_attendance ON attendance_logs;
CREATE POLICY gym_write_attendance ON attendance_logs
  WITH CHECK (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

-- Subscriptions: Can only create in own gym
DROP POLICY IF EXISTS gym_write_subscriptions ON member_subscriptions;
CREATE POLICY gym_write_subscriptions ON member_subscriptions
  WITH CHECK (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

-- Invoices: Can only create in own gym
DROP POLICY IF EXISTS gym_write_invoices ON billing_invoices;
CREATE POLICY gym_write_invoices ON billing_invoices
  WITH CHECK (
    current_setting('app.gym_id', true) IS NULL
    OR gym_id = UUID(current_setting('app.gym_id', true))
  );

-- ============================================================================
-- OPTIMIZATION: Indexes for RLS-filtered queries
-- ============================================================================

-- Index for gym_id + other common filters (used by RLS policy filtering)
CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_gym_id ON member_subscriptions(gym_id);
CREATE INDEX IF NOT EXISTS idx_invoices_gym_id ON billing_invoices(gym_id);
CREATE INDEX IF NOT EXISTS idx_attendance_gym_id ON attendance_logs(gym_id);
CREATE INDEX IF NOT EXISTS idx_staff_gym_id ON staff_users(gym_id);
CREATE INDEX IF NOT EXISTS idx_products_gym_id ON products(gym_id);

-- Composite indexes for common filtered queries
-- Note: members uses is_blacklisted not is_active
-- Note: member_subscriptions already has idx_subs_active for active subscriptions
