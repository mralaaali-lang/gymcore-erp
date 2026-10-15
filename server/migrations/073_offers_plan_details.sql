-- 073: plan identity + rules for the add-plan page (هوية الباقة وقواعدها).
-- sport classifies the plan itself (subscriptions filter by it); NULL = uncategorized.
-- total_sessions NULL = auto (open daily plan: sessions equal duration_days, 1/day).
-- freeze_days_max 0 = no freezing; weekly_days NULL = all days (member_subscriptions
-- copies the plan defaults into each new subscription, editable per subscription).
ALTER TABLE membership_offers
  ADD COLUMN IF NOT EXISTS sport character varying(30),
  ADD COLUMN IF NOT EXISTS total_sessions integer CHECK (total_sessions IS NULL OR total_sessions >= 1),
  ADD COLUMN IF NOT EXISTS freeze_days_max integer NOT NULL DEFAULT 0 CHECK (freeze_days_max >= 0),
  ADD COLUMN IF NOT EXISTS weekly_days text[],
  ADD COLUMN IF NOT EXISTS description text;
