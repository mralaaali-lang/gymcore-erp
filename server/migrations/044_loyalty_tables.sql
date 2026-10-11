-- ====================================================================
-- 044 — Loyalty Program Tables
-- ====================================================================

BEGIN;

-- Drop old loyalty tables if they were seeded by legacy migrations with
-- incompatible schemas. These tables are empty in the current database,
-- so dropping and recreating them here is safe.
DROP TABLE IF EXISTS loyalty_transactions CASCADE;
DROP TABLE IF EXISTS loyalty_redemptions CASCADE;
DROP TABLE IF EXISTS loyalty_points CASCADE;
DROP TABLE IF EXISTS loyalty_rewards CASCADE;
DROP TABLE IF EXISTS loyalty_settings CASCADE;
DROP TABLE IF EXISTS loyalty_accounts CASCADE;
DROP TABLE IF EXISTS loyalty_tiers CASCADE;

-- Loyalty tiers
CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    name_ar VARCHAR(100),
    level INTEGER NOT NULL UNIQUE,
    color VARCHAR(20) DEFAULT '#A0AEC0',
    min_points INTEGER NOT NULL DEFAULT 0,
    discount_percent NUMERIC(5, 2) DEFAULT 0.00,
    free_subscription_months INTEGER DEFAULT 0,
    benefits JSONB DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO loyalty_tiers (name, name_ar, level, min_points, color, discount_percent, benefits) VALUES
('Bronze', 'برونزي', 1, 0, '#CD7F32', 0.00, '[]'),
('Silver', 'فضي', 2, 500, '#C0C0C0', 5.00, '[]'),
('Gold', 'ذهبي', 3, 2000, '#FFD700', 10.00, '[]'),
('Platinum', 'بلاتيني', 4, 5000, '#E5E4E2', 15.00, '["free_monthly_class", "priority_support"]');

-- Loyalty program settings (per gym or global)
CREATE TABLE IF NOT EXISTS loyalty_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    points_per_currency NUMERIC(10, 2) NOT NULL DEFAULT 10,
    min_redemption_points INTEGER NOT NULL DEFAULT 100,
    points_expiry_days INTEGER NOT NULL DEFAULT 365,
    max_points_per_transaction INTEGER DEFAULT 10000,
    allow_partial_redemption BOOLEAN DEFAULT true,
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Member loyalty accounts
CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    tier_id UUID REFERENCES loyalty_tiers(id),
    current_points INTEGER NOT NULL DEFAULT 0,
    lifetime_points INTEGER NOT NULL DEFAULT 0,
    total_redeemed INTEGER NOT NULL DEFAULT 0,
    total_expired INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','suspended','inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_id, gym_id)
);

CREATE INDEX idx_loyalty_member ON loyalty_accounts(member_id, gym_id);
CREATE INDEX idx_loyalty_tier ON loyalty_accounts(tier_id);

-- Points transaction log
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('earned','redeemed','expired','adjusted','refunded')),
    points INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    reference_type VARCHAR(50),
    reference_id UUID,
    created_by UUID REFERENCES staff_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_loyalty_tx_account ON loyalty_transactions(account_id, created_at);

-- Loyalty rewards catalog
CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    description TEXT,
    points_cost INTEGER NOT NULL,
    reward_type VARCHAR(20) NOT NULL CHECK (reward_type IN ('discount','free_subscription_period','free_product','cashback')),
    reward_value NUMERIC(10, 2),
    max_claims_per_member INTEGER DEFAULT 1,
    claims_count INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rewards_gym_id ON loyalty_rewards(gym_id);
CREATE INDEX idx_rewards_active ON loyalty_rewards(is_active, points_cost);

COMMIT;
