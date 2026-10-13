-- §34ث (فواتير): financial_transactions recorded payments WITHOUT the member
-- or method the client actually sends (createPayment destructured member_id /
-- payment_method and dropped them; the list faked member_name as NULL).
-- Add the real columns so payments link to members honestly.
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method varchar(50);

CREATE INDEX IF NOT EXISTS idx_transactions_member
  ON financial_transactions (gym_id, member_id) WHERE member_id IS NOT NULL;
