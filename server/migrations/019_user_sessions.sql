CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_user_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    token_jti VARCHAR(64) NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    device_name VARCHAR(255),
    last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_staff ON user_sessions(staff_user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_jti ON user_sessions(token_jti);
CREATE INDEX IF NOT EXISTS idx_user_sessions_gym ON user_sessions(gym_id);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON user_sessions;
CREATE POLICY tenant_isolation ON user_sessions
    USING (gym_id = current_gym_id())
    WITH CHECK (gym_id = current_gym_id());

CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM user_sessions
  WHERE staff_user_id = NEW.staff_user_id
    AND revoked_at IS NULL
    AND id NOT IN (
      SELECT id FROM user_sessions
      WHERE staff_user_id = NEW.staff_user_id
      ORDER BY last_active_at DESC
      LIMIT 9
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clean_expired_sessions ON user_sessions;
CREATE TRIGGER trg_clean_expired_sessions
  AFTER INSERT ON user_sessions
  FOR EACH ROW EXECUTE FUNCTION clean_expired_sessions();
