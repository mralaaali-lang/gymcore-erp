-- 026_push_tokens.sql — Mobile push notification token storage
-- Stores Expo push tokens for member device registration.

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL,
  expo_token TEXT NOT NULL,
  platform VARCHAR(10) NOT NULL DEFAULT 'ios',
  device_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (member_id, expo_token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_member ON push_tokens(member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_tokens_expo ON push_tokens(expo_token);

-- Audit log for push notification attempts
CREATE TABLE IF NOT EXISTS push_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  gym_id UUID,
  expo_token TEXT,
  title TEXT,
  body TEXT,
  data JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_log_gym ON push_log(gym_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_log_status ON push_log(status);

COMMENT ON TABLE push_tokens IS 'Stores Expo push notification tokens per member device';
COMMENT ON TABLE push_log IS 'Audit log for all push notification attempts';
