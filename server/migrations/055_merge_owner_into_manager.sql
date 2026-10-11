-- Merge gym Owner role into Manager (single gym-admin role)
-- 1) Move existing owners to manager
UPDATE staff_users SET role = 'manager' WHERE role = 'owner';
-- 2) Tighten the role CHECK (owner no longer valid)
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS chk_staff_role;
ALTER TABLE staff_users ADD CONSTRAINT chk_staff_role
CHECK (role IN ('manager', 'receptionist', 'coach'));
