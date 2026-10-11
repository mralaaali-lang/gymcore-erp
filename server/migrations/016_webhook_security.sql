-- ====================================================================
-- 016 — Webhook security hardening
-- ====================================================================
-- Two bugs found via live audit + testing:
--
-- 1. handlePaymentWebhook had no replay/idempotency protection — the same
--    "payment succeeded" event replayed (accidentally by the provider's
--    retry logic, or maliciously) would just re-run the same UPDATE
--    every time. Harmless for an idempotent "set status = active" today,
--    but unsafe the moment this handler grows to include side effects
--    like extending an end_date or granting loyalty points per event.
--
-- 2. handlePaymentWebhook's failure path sets
--      status = 'suspended'
--    but chk_subscription_status never allowed that value — every failed-
--    payment webhook has been throwing a DB error instead of actually
--    suspending the subscription. Payment failures were silently NOT
--    being enforced.
-- ====================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(255) NOT NULL,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, transaction_id)
);

COMMENT ON TABLE webhook_events IS
  'Idempotency guard: insert (provider, transaction_id) before processing '
  'a webhook; a unique_violation means this event was already handled.';

ALTER TABLE member_subscriptions DROP CONSTRAINT IF EXISTS chk_subscription_status;

ALTER TABLE member_subscriptions
  ADD CONSTRAINT chk_subscription_status
  CHECK (status IN ('active', 'expired', 'frozen', 'cancelled', 'suspended'));
