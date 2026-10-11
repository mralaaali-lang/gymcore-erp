-- 025_developer_portal.sql
-- Developer Portal: API keys management for enterprise gyms

-- 1. API keys table for gym-level API access
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of the actual key
  key_prefix VARCHAR(8) NOT NULL, -- First 8 chars of the key for display
  permissions JSONB NOT NULL DEFAULT '["read"]',
  allowed_ips TEXT[] DEFAULT '{}',
  rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES platform_admins(id)
);

-- 2. API request log for audit
CREATE TABLE IF NOT EXISTS api_requests_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  gym_id UUID REFERENCES gyms(id) ON DELETE SET NULL,
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Rate limit tracking
CREATE TABLE IF NOT EXISTS rate_limit_tracker (
  key_identifier VARCHAR(128) NOT NULL, -- API key hash or IP
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key_identifier, window_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_gym_id ON api_keys(gym_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_requests_log_api_key_id ON api_requests_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_log_gym_id ON api_requests_log(gym_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_log_created_at ON api_requests_log(created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracker_key_window ON rate_limit_tracker(key_identifier, window_start);
