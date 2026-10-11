-- Normalize platform-admin roles to the canonical values used by the API.
-- Legacy aliases are mapped explicitly; unknown roles receive least privilege.
UPDATE platform_admins
SET role_type = CASE LOWER(role_type)
  WHEN 'super-admin' THEN 'super_admin'
  WHEN 'support' THEN 'support_admin'
  WHEN 'billing' THEN 'billing_admin'
  WHEN 'readonly' THEN 'readonly_admin'
  WHEN 'super_admin' THEN 'super_admin'
  WHEN 'support_admin' THEN 'support_admin'
  WHEN 'billing_admin' THEN 'billing_admin'
  WHEN 'readonly_admin' THEN 'readonly_admin'
  ELSE 'readonly_admin'
END
WHERE role_type NOT IN ('super_admin', 'support_admin', 'billing_admin', 'readonly_admin');

ALTER TABLE platform_admins
  ALTER COLUMN role_type SET DEFAULT 'support_admin';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_admins_role_type_check'
      AND conrelid = 'platform_admins'::regclass
  ) THEN
    ALTER TABLE platform_admins
      ADD CONSTRAINT platform_admins_role_type_check
      CHECK (role_type IN ('super_admin', 'support_admin', 'billing_admin', 'readonly_admin'));
  END IF;
END $$;