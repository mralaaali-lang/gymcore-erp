-- ====================================================================
-- Fix: Prevent duplicate daily check-ins
-- Partial unique index: one check-in per member per day
-- ====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_daily
ON attendance_logs (gym_id, member_id, ((check_in_time AT TIME ZONE 'UTC')::date));

-- ====================================================================
-- Fix: Add CHECK constraint for staff_users.role
-- ====================================================================
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS chk_staff_role;
ALTER TABLE staff_users ADD CONSTRAINT chk_staff_role
CHECK (role IN ('owner', 'manager', 'receptionist', 'coach'));

-- ====================================================================
-- Fix: Add CHECK constraint for member_subscriptions.status
-- ====================================================================
ALTER TABLE member_subscriptions DROP CONSTRAINT IF EXISTS chk_subscription_status;
ALTER TABLE member_subscriptions ADD CONSTRAINT chk_subscription_status
CHECK (status IN ('active', 'expired', 'frozen'));

-- ====================================================================
-- Fix: Add CHECK constraint for attendance_logs.entry_method
-- ====================================================================
ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS chk_entry_method;
ALTER TABLE attendance_logs ADD CONSTRAINT chk_entry_method
CHECK (entry_method IN ('qr_code', 'manual_phone'));
