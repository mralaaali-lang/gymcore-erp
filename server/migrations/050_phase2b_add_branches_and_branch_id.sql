-- Phase 2ب.1: Create branches table and add branch_id to key tables
-- Purpose: Support multi-branch gyms where a single gym operates multiple physical locations
-- NOTE: branches table already created by migration 036 (with fewer columns)
-- This migration adds missing columns, indexes, and constraints

-- Create branches table if not already present (safe: IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns to branches (for multi-branch enterprise support)
ALTER TABLE branches ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_branches_gym_id ON branches(gym_id);
CREATE INDEX IF NOT EXISTS idx_branches_is_active ON branches(is_active);
CREATE INDEX IF NOT EXISTS idx_branches_deleted_at ON branches(deleted_at);

-- Add unique constraints (drop first for idempotency)
ALTER TABLE branches DROP CONSTRAINT IF EXISTS unique_branch_code;
ALTER TABLE branches ADD CONSTRAINT unique_branch_code UNIQUE(gym_id, code);
ALTER TABLE branches DROP CONSTRAINT IF EXISTS unique_branch_name;
ALTER TABLE branches ADD CONSTRAINT unique_branch_name UNIQUE(gym_id, name);

-- Create default "Main" branch for gyms that don't have one yet
INSERT INTO branches (gym_id, name, code, is_active)
SELECT id, 'Main', CONCAT('DEFAULT-', SUBSTRING(id::TEXT, 1, 8)), TRUE
FROM gyms
WHERE id NOT IN (SELECT gym_id FROM branches)
ON CONFLICT DO NOTHING;

-- Add branch_id to members table
ALTER TABLE members ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Drop and recreate foreign key for idempotency
ALTER TABLE members DROP CONSTRAINT IF EXISTS fk_members_branch;
ALTER TABLE members ADD CONSTRAINT fk_members_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_members_branch_id ON members(branch_id);

-- Backfill branch_id for existing members (assign to "Main" branch of their gym)
UPDATE members m
SET branch_id = (
  SELECT b.id FROM branches b 
  WHERE b.gym_id = m.gym_id 
  ORDER BY b.created_at ASC 
  LIMIT 1
)
WHERE m.branch_id IS NULL;

-- Add NOT NULL constraint after backfill (only if currently nullable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'branch_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE members ALTER COLUMN branch_id SET NOT NULL;
  END IF;
END $$;

-- Add branch_id to attendance_logs
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Drop and recreate foreign key for idempotency
ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS fk_attendance_branch;
ALTER TABLE attendance_logs ADD CONSTRAINT fk_attendance_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_branch_id ON attendance_logs(branch_id);

-- Backfill branch_id for attendance logs (from member's current branch)
UPDATE attendance_logs al
SET branch_id = (SELECT branch_id FROM members m WHERE m.id = al.member_id)
WHERE al.branch_id IS NULL;

-- Create composite indexes for common queries (branch + member/date)
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON attendance_logs(branch_id, check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_members_gym_branch ON members(gym_id, branch_id);
