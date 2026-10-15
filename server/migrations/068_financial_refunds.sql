-- 068: refund movement type for the cashbox (المرتجعات).
-- Refunds are money OUT of the drawer but tracked apart from expenses so the
-- month/day summaries can break them out (إيرادات/مصروفات/مرتجعات/صافي).
-- Aggregates were updated in code to bucket refunds separately; old rows are
-- untouched (none exist with this type yet).
ALTER TABLE financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_type_check;
ALTER TABLE financial_transactions
  ADD CONSTRAINT financial_transactions_type_check
  CHECK (type IN ('payment', 'expense', 'refund'));
CREATE INDEX IF NOT EXISTS idx_ft_refunds ON financial_transactions (gym_id, created_at) WHERE type = 'refund';
