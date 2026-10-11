-- ====================================================================
-- 015 — Allow 'cancelled' as a distinct subscription status
-- ====================================================================
-- BUG FOUND VIA LIVE TESTING: controllers/analytics.ts's getEnrollmentTrend
-- and getRevenueBreakdown both query
--   WHERE status IN ('cancelled', 'expired')
-- but chk_subscription_status only ever allowed
--   ('active', 'expired', 'frozen').
-- A subscription can never actually be inserted/updated with status =
-- 'cancelled', so that half of the analytics query was silently always
-- empty — the "Cancellations" series on the Enrollment/Retention chart was
-- undercounting real churn (only true natural 'expired' rows ever showed).
--
-- 'expired' (ran out naturally) and 'cancelled' (member proactively left
-- early) are meaningfully different for a retention chart, so we widen the
-- constraint rather than removing 'cancelled' from the application code.
-- ====================================================================

ALTER TABLE member_subscriptions DROP CONSTRAINT IF EXISTS chk_subscription_status;

ALTER TABLE member_subscriptions
  ADD CONSTRAINT chk_subscription_status
  CHECK (status IN ('active', 'expired', 'frozen', 'cancelled'));
