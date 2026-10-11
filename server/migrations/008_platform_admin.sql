-- ====================================================================
-- 008 — Platform Admin (true, cross-tenant Super Admin)
-- ====================================================================
-- WHY THIS MIGRATION EXISTS:
-- Today, `staff_users.role = 'owner'` is being treated by the app as a
-- global "super admin" (see server/src/routes/admin.ts, ROLE_MAP in the
-- frontend). But `staff_users.gym_id` is NOT NULL — every staff_users row
-- is structurally bound to exactly one gym. That means there is currently
-- NO way to represent a true cross-tenant super admin in the schema, and
-- any gym's "owner" can be handed platform-wide access by mistake — a real
-- privilege-escalation risk across tenants.
--
-- This migration adds a separate, deliberately tiny table for platform
-- operators, completely outside the tenant model. Application code should
-- stop treating `role = 'owner'` as "super admin" — see the accompanying
-- backend changes (platformAuth middleware + controllers/platformAdmin.ts).
-- ====================================================================

CREATE TABLE IF NOT EXISTS platform_admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE platform_admins IS
  'True cross-tenant super admins. Never given a gym_id. Completely separate '
  'credential space from staff_users — a platform_admins JWT and a staff_users '
  'JWT must never be interchangeable.';

-- Platform admins are NOT subject to any gym's RLS policy (there is no
-- gym_id column at all here, so no tenant_isolation policy is needed or
-- possible for this table). Access to this table is controlled purely by
-- who can call the platformAuth-protected endpoints.

-- ====================================================================
-- Activity logs: allow platform-admin-authored entries (gym_id nullable
-- for platform-level actions like "created gym X")
-- ====================================================================
ALTER TABLE activity_logs
  ALTER COLUMN gym_id DROP NOT NULL;

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS platform_admin_id UUID REFERENCES platform_admins(id);

-- ====================================================================
-- Bootstrap: create your first platform admin
-- ====================================================================
-- Run this manually AFTER deploying, with a real bcrypt hash (cost 12) —
-- generate one with: node -e "require('bcrypt').hash('yourpassword',12).then(console.log)"
--
--   INSERT INTO platform_admins (email, password_hash, full_name)
--   VALUES ('admin@yourcompany.com', '<bcrypt-hash-here>', 'اسمك هنا');
