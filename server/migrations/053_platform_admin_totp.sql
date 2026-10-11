-- Platform admin TOTP (2FA) columns — required by platformAdmin login controller
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS totp_verified BOOLEAN NOT NULL DEFAULT false;
