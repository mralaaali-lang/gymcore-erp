-- ====================================================================
-- Migration 021: Security Center — platform admin sessions + settings
-- ====================================================================

-- 1. Platform Admin Sessions (for session management in Security Center)
CREATE TABLE IF NOT EXISTS platform_admin_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_admin_id UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
    token_jti VARCHAR(64) NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    device_name VARCHAR(255),
    last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_pa_sessions_admin ON platform_admin_sessions(platform_admin_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_pa_sessions_jti ON platform_admin_sessions(token_jti);

-- Keep max 10 active sessions per admin
CREATE OR REPLACE FUNCTION clean_pa_expired_sessions()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM platform_admin_sessions
  WHERE platform_admin_id = NEW.platform_admin_id
    AND revoked_at IS NULL
    AND id NOT IN (
      SELECT id FROM platform_admin_sessions
      WHERE platform_admin_id = NEW.platform_admin_id
      ORDER BY last_active_at DESC
      LIMIT 9
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clean_pa_sessions ON platform_admin_sessions;
CREATE TRIGGER trg_clean_pa_sessions
  AFTER INSERT ON platform_admin_sessions
  FOR EACH ROW EXECUTE FUNCTION clean_pa_expired_sessions();

-- 2. Platform Security Settings (single-row config)
CREATE TABLE IF NOT EXISTS platform_security_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- ensures single row
    two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
    two_factor_method VARCHAR(20) DEFAULT 'app',  -- 'app', 'sms', 'email'
    password_min_length INTEGER NOT NULL DEFAULT 8,
    password_require_uppercase BOOLEAN NOT NULL DEFAULT true,
    password_require_lowercase BOOLEAN NOT NULL DEFAULT true,
    password_require_numbers BOOLEAN NOT NULL DEFAULT true,
    password_require_symbols BOOLEAN NOT NULL DEFAULT false,
    password_expiry_days INTEGER NOT NULL DEFAULT 90,
    max_login_attempts INTEGER NOT NULL DEFAULT 5,
    lockout_duration_minutes INTEGER NOT NULL DEFAULT 15,
    ip_whitelist_enabled BOOLEAN NOT NULL DEFAULT false,
    ip_whitelist TEXT[] NOT NULL DEFAULT '{}',
    session_timeout_minutes INTEGER NOT NULL DEFAULT 480,  -- 8 hours
    updated_by UUID REFERENCES platform_admins(id),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings row
INSERT INTO platform_security_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 3. Add last_login_ip to platform_admins (for session tracking)
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45);
