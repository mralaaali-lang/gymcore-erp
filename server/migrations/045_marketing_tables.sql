-- ====================================================================
-- 045 — Marketing Tables: Campaigns, Broadcasts, Referral tracking
-- ====================================================================

BEGIN;

-- Marketing campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    type VARCHAR(30) NOT NULL CHECK (type IN ('email','sms','whatsapp','referral','social')),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','paused','completed','cancelled')),
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    platform_wide BOOLEAN DEFAULT false,
    budget NUMERIC(12, 2) DEFAULT 0.00,
    spent_amount NUMERIC(12, 2) DEFAULT 0.00,
    target_audience JSONB DEFAULT '{"all": true}',
    start_date DATE,
    end_date DATE,
    metrics JSONB DEFAULT '{"views":0,"clicks":0,"conversions":0,"cost_per_conversion":0}',
    created_by UUID REFERENCES staff_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_campaigns_gym_id ON marketing_campaigns(gym_id);
CREATE INDEX idx_campaigns_status ON marketing_campaigns(status, start_date);

-- Email templates
CREATE TABLE IF NOT EXISTS marketing_email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    subject_ar VARCHAR(500),
    body_html TEXT NOT NULL,
    body_text TEXT,
    type VARCHAR(30) NOT NULL CHECK (type IN ('welcome','renewal','offer','referral','broadcast','custom')),
    variables JSONB DEFAULT '[]',
    is_default BOOLEAN DEFAULT false,
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Broadcasts
CREATE TABLE IF NOT EXISTS marketing_broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
    subject VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('all_members','plan_specific','region_specific','selected')),
    target_filter JSONB DEFAULT '{}',
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    total_recipients INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    bounced_count INTEGER DEFAULT 0,
    unsubscribed_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','failed')),
    created_by UUID REFERENCES staff_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_broadcasts_campaign ON marketing_broadcasts(campaign_id);
CREATE INDEX idx_broadcasts_status ON marketing_broadcasts(status);

-- Referral tracking
CREATE TABLE IF NOT EXISTS marketing_referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    referred_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    referrer_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled','expired')),
    reward_amount NUMERIC(12, 2) DEFAULT 0.00,
    reward_status VARCHAR(20) DEFAULT 'pending' CHECK (reward_status IN ('pending','paid','rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_referrals_code ON marketing_referrals(referral_code);
CREATE INDEX idx_referrals_referrer ON marketing_referrals(referrer_gym_id);

COMMIT;
