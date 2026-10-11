-- Phase 2أ.3: Add member_id to billing_invoices
-- Purpose: Link invoices directly to members for better tracking and member-specific billing operations
-- This allows filtering invoices by member without joining through subscriptions
-- Note: Currently invoices are gym-level (for gym subscription plans), not member-level.
-- This column prepares for future member-specific invoices (PT sessions, products, etc.)

ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS member_id UUID;

-- Drop and recreate constraint for idempotency
ALTER TABLE billing_invoices DROP CONSTRAINT IF EXISTS fk_invoices_member;
ALTER TABLE billing_invoices ADD CONSTRAINT fk_invoices_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_billing_invoices_member_id ON billing_invoices(member_id);

-- Add helpful composite index for common query pattern (member invoices, not deleted, ordered by date)
CREATE INDEX IF NOT EXISTS idx_invoices_member_created ON billing_invoices(member_id, created_at DESC) WHERE deleted_at IS NULL;
