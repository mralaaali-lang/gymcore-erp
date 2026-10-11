-- ====================================================================
-- 046 — Support Tickets Schema
-- ====================================================================

BEGIN;

-- Drop old support ticket tables if they were seeded by legacy migrations with
-- incompatible schemas. These tables are empty in the current database,
-- so dropping and recreating them here is safe.
DROP TABLE IF EXISTS support_ticket_tag_map CASCADE;
DROP TABLE IF EXISTS support_ticket_tags CASCADE;
DROP TABLE IF EXISTS support_sla_configs CASCADE;
DROP TABLE IF EXISTS support_ticket_messages CASCADE;
DROP TABLE IF EXISTS support_tickets CASCADE;

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    subject VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(30) CHECK (category IN ('billing','technical','subscription','general','other')),
    priority VARCHAR(20) NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low','medium','high','critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','in_progress','waiting_customer','closed','escalated')),
    assigned_to UUID REFERENCES staff_users(id),
    resolved_by UUID REFERENCES staff_users(id),
    resolution TEXT,
    resolution_code VARCHAR(20),
    satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    sla_breach BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tickets_gym_id ON support_tickets(gym_id);
CREATE INDEX idx_tickets_status ON support_tickets(status, priority);
CREATE INDEX idx_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX idx_tickets_created ON support_tickets(created_at);
CREATE INDEX idx_tickets_number ON support_tickets(ticket_number);

-- Ticket messages (conversation history)
CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('customer','support','system')),
    sender_id UUID,
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]',
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_ticket ON support_ticket_messages(ticket_id, created_at);

-- Ticket SLA configuration
CREATE TABLE IF NOT EXISTS support_sla_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    priority VARCHAR(20) NOT NULL UNIQUE,
    response_minutes INTEGER NOT NULL,
    resolution_hours INTEGER NOT NULL,
    escalation_minutes INTEGER DEFAULT NULL
);

INSERT INTO support_sla_configs (priority, response_minutes, resolution_hours) VALUES
('low', 480, 72),
('medium', 240, 48),
('high', 60, 24),
('critical', 15, 4);

-- Ticket tags
CREATE TABLE IF NOT EXISTS support_ticket_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(10) DEFAULT '#E2E8F0'
);

CREATE TABLE IF NOT EXISTS support_ticket_tag_map (
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES support_ticket_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (ticket_id, tag_id)
);

COMMIT;
