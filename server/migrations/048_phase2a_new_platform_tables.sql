-- Phase 2أ.2: Create new platform-wide tables
-- Purpose: Support platform admin features (audit logs, notifications, usage tracking, recycle bin, versioning)

-- 1. Platform Audit Logs: Immutable audit trail for all super-admin actions
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL, -- super-admin user who performed the action
  action_type TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'DEACTIVATE'
  table_name TEXT NOT NULL, -- which table was affected (gyms, members, subscriptions, etc)
  record_id UUID, -- ID of affected record
  old_values JSONB, -- previous state (for UPDATE/DELETE)
  new_values JSONB, -- new state (for CREATE/UPDATE)
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES platform_admins(id) ON DELETE RESTRICT,
  CONSTRAINT audit_action_valid CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE', 'DEACTIVATE'))
);
CREATE INDEX idx_platform_audit_logs_created_at ON platform_audit_logs(created_at DESC);
CREATE INDEX idx_platform_audit_logs_actor_id ON platform_audit_logs(actor_id);
CREATE INDEX idx_platform_audit_logs_record_id ON platform_audit_logs(record_id);

-- 2. Platform Notifications: General notification system (usable by all roles)
-- Note: designed to serve super-admin, gym-admin, trainer, reception, player with role-based filtering
CREATE TABLE IF NOT EXISTS platform_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID, -- NULL for platform-wide, not NULL for gym-specific
  recipient_role TEXT NOT NULL, -- 'super-admin', 'gym-admin', 'trainer', 'reception', 'player'
  notification_type TEXT NOT NULL, -- 'alert', 'reminder', 'info', 'warning'
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_notifications_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE,
  CONSTRAINT notification_type_valid CHECK (notification_type IN ('alert', 'reminder', 'info', 'warning'))
);
CREATE INDEX idx_notifications_gym_id_role ON platform_notifications(gym_id, recipient_role);
CREATE INDEX idx_notifications_created_at ON platform_notifications(created_at DESC);
CREATE INDEX idx_notifications_read_at ON platform_notifications(read_at);

-- 3. Gym Daily Limits: Track daily usage limits and consumption per gym
CREATE TABLE IF NOT EXISTS gym_daily_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL UNIQUE,
  limit_date DATE NOT NULL,
  api_calls_limit INTEGER DEFAULT 10000,
  api_calls_used INTEGER DEFAULT 0,
  storage_limit_mb BIGINT DEFAULT 10240, -- 10GB
  storage_used_mb BIGINT DEFAULT 0,
  max_members_allowed INTEGER,
  current_members_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_daily_limits_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE
);
CREATE INDEX idx_gym_daily_limits_limit_date ON gym_daily_limits(limit_date);
CREATE INDEX idx_gym_daily_limits_gym_id ON gym_daily_limits(gym_id);

-- 4. Gym Daily Usage: Log daily usage metrics per gym (for analytics)
CREATE TABLE IF NOT EXISTS gym_daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL,
  usage_date DATE NOT NULL,
  api_calls_count INTEGER DEFAULT 0,
  storage_used_mb BIGINT DEFAULT 0,
  active_users_count INTEGER DEFAULT 0,
  check_ins_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_daily_usage_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE,
  CONSTRAINT unique_gym_usage_date UNIQUE(gym_id, usage_date)
);
CREATE INDEX idx_gym_daily_usage_usage_date ON gym_daily_usage(usage_date);

-- 5. Recycle Bin: Soft-deleted records viewable by super-admin
CREATE TABLE IF NOT EXISTS recycle_bin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID, -- NULL for platform-wide deletions
  record_type TEXT NOT NULL, -- 'gym', 'member', 'subscription', etc
  record_id UUID NOT NULL,
  record_data JSONB NOT NULL, -- full record snapshot
  deleted_by UUID NOT NULL, -- user who deleted
  deleted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  can_restore_until TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  restored_at TIMESTAMP,
  
  CONSTRAINT fk_recycle_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE SET NULL,
  CONSTRAINT fk_recycle_deleted_by FOREIGN KEY (deleted_by) REFERENCES platform_admins(id) ON DELETE RESTRICT
);
CREATE INDEX idx_recycle_bin_deleted_at ON recycle_bin(deleted_at DESC);
CREATE INDEX idx_recycle_bin_can_restore_until ON recycle_bin(can_restore_until);
CREATE INDEX idx_recycle_bin_record_type ON recycle_bin(record_type);

-- 6. Gym Versions: Track version history of gym configurations
CREATE TABLE IF NOT EXISTS gym_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  gym_data JSONB NOT NULL, -- snapshot of gym config
  changed_by UUID NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_gym_versions_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE,
  CONSTRAINT fk_gym_versions_user FOREIGN KEY (changed_by) REFERENCES platform_admins(id) ON DELETE RESTRICT,
  CONSTRAINT unique_gym_version UNIQUE(gym_id, version_number)
);
CREATE INDEX idx_gym_versions_created_at ON gym_versions(created_at DESC);

-- 7. Staff Sessions: Global staff session tracking (applicable to all roles)
-- Design: used for super-admin now, extensible to gym-admin/trainer/reception/player
CREATE TABLE IF NOT EXISTS staff_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  gym_id UUID, -- NULL for super-admin, not NULL for gym-specific roles
  role TEXT NOT NULL, -- 'super-admin', 'gym-admin', 'trainer', 'reception', 'player'
  session_token TEXT UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  login_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
  logout_at TIMESTAMP,
  
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES platform_admins(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE,
  CONSTRAINT role_valid CHECK (role IN ('super-admin', 'gym-admin', 'trainer', 'reception', 'player'))
);
CREATE INDEX idx_staff_sessions_user_id ON staff_sessions(user_id);
CREATE INDEX idx_staff_sessions_gym_id ON staff_sessions(gym_id);
CREATE INDEX idx_staff_sessions_logout_at ON staff_sessions(logout_at);
CREATE INDEX idx_staff_sessions_last_activity ON staff_sessions(last_activity_at DESC);
