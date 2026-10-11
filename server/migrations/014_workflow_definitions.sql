CREATE TABLE IF NOT EXISTS workflow_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    description VARCHAR(500) NOT NULL,
    description_ar VARCHAR(500) NOT NULL,
    icon VARCHAR(100) NOT NULL DEFAULT 'settings',
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON workflow_definitions;
CREATE POLICY tenant_isolation ON workflow_definitions
    USING (gym_id = current_gym_id())
    WITH CHECK (gym_id = current_gym_id());

CREATE INDEX idx_workflow_definitions_gym ON workflow_definitions(gym_id);
