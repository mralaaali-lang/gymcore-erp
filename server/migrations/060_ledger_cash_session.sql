-- §34ث (يومية الكاش وتسوية الوردية): three ledger truths in one migration.
-- (1) type had three competing vocabularies ('payment' | 'expense' | 'income')
--     with no constraint — the 178 'income' rows (stitch orders, seeds) were
--     invisible to every type='payment' aggregation, so revenue was understated.
-- (2) POS sales lived only in pos_orders and NEVER posted to the finance
--     ledger — a structural revenue leak. Backfill them with a traceable link.
-- (3) cashbox sessions held free-typed opening/closing numbers with no way to
--     reconcile them against actual cash movement — add cash_session_id so
--     every ledger row is attributed to the shift that physically held the cash.
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS pos_order_id uuid REFERENCES pos_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES cashbox_sessions(id) ON DELETE SET NULL;

-- (1) Normalize income -> payment BEFORE adding the constraint.
UPDATE financial_transactions SET type = 'payment' WHERE type = 'income';

ALTER TABLE financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_type_check;
ALTER TABLE financial_transactions
  ADD CONSTRAINT financial_transactions_type_check CHECK (type IN ('payment', 'expense'));

-- (2) Backfill: every existing pos_order gets its ledger row, idempotent via NOT EXISTS.
INSERT INTO financial_transactions
  (gym_id, type, amount, description, staff_user_id, member_id, payment_method, created_at, pos_order_id)
SELECT
  po.gym_id, 'payment', po.total_amount,
  'مبيعات نقطة البيع (ترحيل §34ث)', po.staff_user_id, po.member_id, po.payment_method, po.created_at, po.id
FROM pos_orders po
WHERE po.total_amount > 0
  AND NOT EXISTS (SELECT 1 FROM financial_transactions ft WHERE ft.pos_order_id = po.id);

CREATE INDEX IF NOT EXISTS idx_transactions_pos_order
  ON financial_transactions (pos_order_id) WHERE pos_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_cash_session
  ON financial_transactions (cash_session_id, created_at) WHERE cash_session_id IS NOT NULL;
