-- ====================================================================
-- Stitch / Tailoring Orders — Gym Gear Personalization Module
-- Tracks custom-fit uniform and merchandise tailoring requests
-- per member, isolated by gym_id via existing Row-Level Security.
-- ====================================================================

CREATE TABLE IF NOT EXISTS stitch_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    size_chest NUMERIC(5,2),
    size_waist NUMERIC(5,2),
    design_notes TEXT,
    order_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- INDEXES — Tenant + Status filtered for active order lookups
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_stitch_orders_gym ON stitch_orders(gym_id);
CREATE INDEX IF NOT EXISTS idx_stitch_orders_status ON stitch_orders(gym_id, order_status);
CREATE INDEX IF NOT EXISTS idx_stitch_orders_member ON stitch_orders(member_id);

-- ====================================================================
-- IMMUTABLE TRIGGER — Prevent tampering with completed orders
-- ====================================================================
CREATE OR REPLACE FUNCTION block_stitch_modifications()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.order_status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot modify a stitch order that is completed or cancelled.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_stitch_orders ON stitch_orders;
CREATE TRIGGER trg_protect_stitch_orders
    BEFORE UPDATE ON stitch_orders
    FOR EACH ROW EXECUTE FUNCTION block_stitch_modifications();

-- ====================================================================
-- ROW-LEVEL SECURITY — Multi-Tenant Isolation via existing app.gym_id
-- ====================================================================
ALTER TABLE stitch_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON stitch_orders;
CREATE POLICY tenant_isolation ON stitch_orders
    USING (gym_id = current_gym_id())
    WITH CHECK (gym_id = current_gym_id());
