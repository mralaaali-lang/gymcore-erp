-- ====================================================================
-- Migration 035: Cleanup legacy plans after 034
-- ====================================================================
-- Removes old plans seeded by migration 011 that don't match the
-- canonical 4-plan system (Starter, Growth, Pro, Enterprise).

-- Remove legacy plans by name+price combo that no longer exists in 034
DELETE FROM billing_plans
WHERE (name = 'Starter' AND price_monthly = 299.00)
   OR (name = 'Professional' AND price_monthly = 599.00)
   OR (name = 'Enterprise' AND price_monthly = 999.00);

-- Ensure any gyms pointing to deleted plans get Starter as default
UPDATE gyms
SET plan_id = (SELECT id FROM billing_plans WHERE name = 'Starter' LIMIT 1),
    member_limit = (SELECT max_members FROM billing_plans WHERE name = 'Starter' LIMIT 1)
WHERE plan_id NOT IN (SELECT id FROM billing_plans);
