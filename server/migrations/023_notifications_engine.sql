-- 023_notifications_engine.sql
-- Notification channels configuration and sent history
-- Part of Phase 3: Notifications Engine

CREATE TABLE IF NOT EXISTS notification_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'webhook', 'in_app')),
    provider VARCHAR(100),
    is_enabled BOOLEAN DEFAULT false,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Email SMTP configuration
-- config: { host, port, username, password, from_name, from_email, encryption (tls/ssl/none) }

-- SMS Gateway configuration (Egyptian providers)
-- config: { provider (vodafone/orange/etisalat/we), api_key, api_secret, sender_name }

-- Push (FCM) configuration
-- config: { server_key, sender_id, app_package }

-- Webhook configuration
-- config: { url, secret, events[], retry_count, timeout_ms }

-- In-app configuration
-- config: { max_per_user, retention_days, sound_enabled, badge_enabled }

INSERT INTO notification_settings (channel, is_enabled, config) VALUES
    ('email', false, '{"host":"","port":587,"username":"","password":"","from_name":"GymCore","from_email":"noreply@gymcore.app","encryption":"tls"}'),
    ('sms', false, '{"provider":"","api_key":"","api_secret":"","sender_name":"GymCore"}'),
    ('push', false, '{"server_key":"","sender_id":"","app_package":"com.gymcore.app"}'),
    ('webhook', false, '{"url":"","secret":"","events":[],"retry_count":3,"timeout_ms":5000}'),
    ('in_app', true, '{"max_per_user":50,"retention_days":30,"sound_enabled":true,"badge_enabled":true}')
ON CONFLICT DO NOTHING;

-- Notification history (across all channels)
CREATE TABLE IF NOT EXISTS notification_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel VARCHAR(50) NOT NULL,
    recipient_type VARCHAR(50), -- 'gym', 'member', 'staff', 'role'
    recipient_id UUID,
    recipient_label VARCHAR(255),
    title VARCHAR(255),
    content TEXT,
    template_id UUID,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'cancelled')),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES platform_admins(id)
);

CREATE INDEX idx_notification_history_channel ON notification_history(channel);
CREATE INDEX idx_notification_history_status ON notification_history(status);
CREATE INDEX idx_notification_history_created_at ON notification_history(created_at DESC);

-- Notification templates
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    title_template TEXT,
    content_template TEXT NOT NULL,
    variables TEXT[] DEFAULT '{}',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notification_templates (channel, name, title_template, content_template, variables, description) VALUES
    ('email', 'Welcome Email', 'أهلاً بك في {gym_name}!', '<h1>مرحباً {member_name}</h1><p>نرحب بك في {gym_name}. بيانات دخولك:<br>البريد: {email}<br>كلمة المرور: {password}</p>', ARRAY['member_name','gym_name','email','password'], 'Welcome email for new members'),
    ('sms', 'Membership Renewal', 'تجديد العضوية', 'عزيزي {member_name}، يرجى تجديد عضويتك في {gym_name} قبل {expiry_date}', ARRAY['member_name','gym_name','expiry_date'], 'SMS reminder for membership renewal'),
    ('push', 'Workout Reminder', 'حان وقت التمرين!', '{member_name}، لديك جلسة تدريب اليوم الساعة {time}', ARRAY['member_name','time'], 'Push notification for workout reminder'),
    ('email', 'Invoice Notification', 'فاتورة جديدة من {gym_name}', 'عزيزي {member_name}،<br>فاتورة جديدة بمبلغ {amount} {currency}<br>تاريخ الاستحقاق: {due_date}', ARRAY['member_name','gym_name','amount','currency','due_date'], 'Email notification for new invoice')
ON CONFLICT DO NOTHING;
