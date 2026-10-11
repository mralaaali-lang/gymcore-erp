CREATE TABLE IF NOT EXISTS gym_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  source VARCHAR(50) NOT NULL DEFAULT 'walk_in',
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  assigned_to UUID REFERENCES staff_users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gym_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON gym_leads;
CREATE POLICY tenant_isolation ON gym_leads
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

CREATE INDEX IF NOT EXISTS idx_gym_leads_gym_id ON gym_leads(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_leads_status ON gym_leads(status);
