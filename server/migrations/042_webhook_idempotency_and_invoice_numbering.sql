-- ====================================================================
-- 042 — Payment Webhook Idempotency & Isolated Invoice Numbering
-- ====================================================================

BEGIN;

-- 1. IDEMPOTENCY TABLE
--    Maps unique payment tokens sent by payment processors
--    (Paymob / Fawry) to prevent double-activation.
CREATE TABLE IF NOT EXISTS webhook_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gateway VARCHAR(50) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'processed',
  UNIQUE(gateway, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_gateway_event
  ON webhook_idempotency_keys(gateway, event_id);

-- 2. ISOLATED INVOICE NUMBERING
--    Enforce tenant-scoped sequential numbering so Tenant A
--    and Tenant B both sequence independently from INV-001.
--    This obfuscates gross platform transaction metrics.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_invoices' AND column_name = 'invoice_number'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_billing_invoices_gym_number'
  ) THEN
    CREATE UNIQUE INDEX uq_billing_invoices_gym_number
      ON billing_invoices(gym_id, invoice_number);
  END IF;
END $$;

COMMIT;
