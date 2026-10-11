-- ====================================================================
-- 009 — Password Reset Tokens
-- ====================================================================
-- One table serves BOTH credential spaces (staff_users and
-- platform_admins) — exactly one of the two FK columns must be set.
-- Tokens are stored as a SHA-256 hash, never in plaintext, same principle
-- as refresh_tokens. The raw token only ever exists in the emailed link
-- and briefly in the request body of /auth/reset-password.
-- ====================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_user_id UUID REFERENCES staff_users(id) ON DELETE CASCADE,
    platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT chk_exactly_one_owner CHECK (
        (staff_user_id IS NOT NULL AND platform_admin_id IS NULL)
        OR (staff_user_id IS NULL AND platform_admin_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_staff ON password_reset_tokens(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_platform_admin ON password_reset_tokens(platform_admin_id);

COMMENT ON TABLE password_reset_tokens IS
  'Single-use, expiring tokens for the forgot-password flow. token_hash is '
  'sha256(raw_token) — the raw token is never stored, only emailed once.';
