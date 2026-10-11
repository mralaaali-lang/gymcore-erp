CREATE TABLE IF NOT EXISTS loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id),
  gym_id UUID NOT NULL REFERENCES gyms(id),
  points_earned INTEGER NOT NULL DEFAULT 0,
  points_redeemed INTEGER NOT NULL DEFAULT 0,
  points_balance INTEGER NOT NULL DEFAULT 0,
  tier VARCHAR(20) NOT NULL DEFAULT 'bronze',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id, gym_id)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id),
  gym_id UUID NOT NULL REFERENCES gyms(id),
  points INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('earn', 'redeem', 'expire', 'adjust')),
  reason VARCHAR(255) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  points_cost INTEGER NOT NULL CHECK (points_cost > 0),
  reward_type VARCHAR(50) NOT NULL DEFAULT 'discount',
  reward_value VARCHAR(255) NOT NULL,
  stock INTEGER NOT NULL DEFAULT -1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id),
  gym_id UUID NOT NULL REFERENCES gyms(id),
  reward_id UUID NOT NULL REFERENCES loyalty_rewards(id),
  points_spent INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON loyalty_points;
CREATE POLICY tenant_isolation ON loyalty_points
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON loyalty_transactions;
CREATE POLICY tenant_isolation ON loyalty_transactions
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON loyalty_rewards;
CREATE POLICY tenant_isolation ON loyalty_rewards
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

ALTER TABLE loyalty_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON loyalty_redemptions;
CREATE POLICY tenant_isolation ON loyalty_redemptions
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

CREATE INDEX IF NOT EXISTS idx_loyalty_points_member ON loyalty_points(member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_member ON loyalty_transactions(member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_gym ON loyalty_rewards(gym_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_member ON loyalty_redemptions(member_id, gym_id);
