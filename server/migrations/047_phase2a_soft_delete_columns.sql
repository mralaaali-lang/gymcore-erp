-- Phase 2أ.1: Add soft_delete (deleted_at) columns to main tables
-- Purpose: Enable soft delete for gyms, members, subscriptions, and billing-related tables
-- This allows data recovery and audit trails without physical deletion

-- Add deleted_at to core tables (IF NOT EXISTS for idempotent re-runs)
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE member_subscriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- Create composite indexes for soft_delete queries (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_gyms_deleted_at ON gyms(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_deleted_at ON members(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_member_subscriptions_deleted_at ON member_subscriptions(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_plans_deleted_at ON billing_plans(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_invoices_deleted_at ON billing_invoices(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_logs_deleted_at ON attendance_logs(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_users_deleted_at ON staff_users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NOT NULL;

-- Create helper function to get non-deleted records (commonly used pattern)
CREATE OR REPLACE FUNCTION get_active_records() RETURNS BOOLEAN AS $$
BEGIN
  -- This is a placeholder; actual usage will be in WHERE clauses as deleted_at IS NULL
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
