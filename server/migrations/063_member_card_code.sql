-- §35ج — real printed membership card codes.
-- Until now the UI's «كود العضوية» was just SUBSTRING(m.id,1,8) — a UUID
-- fragment nobody can print, remember, or scan as a stable identifier.
-- Adds members.card_code: a per-gym sequential 6-digit number (100001,
-- 100002, …) assigned atomically by a BEFORE INSERT trigger, so EVERY
-- insertion path (createMember, CSV import, backup restore, seeds) gets a
-- genuine code without touching application code.
--
-- Assignment uses a per-gym counter row with an upsert (INSERT … ON
-- CONFLICT … RETURNING) — no max(card_code) scan, no race window. The
-- unique index is the backstop: a collision under any exotic path fails
-- loudly instead of printing two identical cards.

ALTER TABLE members ADD COLUMN IF NOT EXISTS card_code VARCHAR(6);

CREATE TABLE IF NOT EXISTS gym_card_counters (
  gym_id    UUID PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  last_code INTEGER NOT NULL DEFAULT 100000
);

-- Backfill existing members oldest-first per gym, through the same counter
-- so the sequence continues seamlessly for future joins.
DO $$
DECLARE
  r RECORD;
  next_code INTEGER;
BEGIN
  FOR r IN
    SELECT id, gym_id FROM members
    WHERE card_code IS NULL
    ORDER BY gym_id, created_at, id
  LOOP
    INSERT INTO gym_card_counters (gym_id, last_code)
    VALUES (r.gym_id, 100001)
    ON CONFLICT (gym_id)
    DO UPDATE SET last_code = gym_card_counters.last_code + 1
    RETURNING last_code INTO next_code;

    UPDATE members SET card_code = next_code::text WHERE id = r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION set_member_card_code() RETURNS trigger AS $$
DECLARE
  next_code INTEGER;
BEGIN
  IF NEW.card_code IS NULL THEN
    INSERT INTO gym_card_counters (gym_id, last_code)
    VALUES (NEW.gym_id, 100001)
    ON CONFLICT (gym_id)
    DO UPDATE SET last_code = gym_card_counters.last_code + 1
    RETURNING last_code INTO next_code;
    NEW.card_code := next_code::text;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_members_card_code ON members;
CREATE TRIGGER trg_members_card_code
  BEFORE INSERT ON members
  FOR EACH ROW EXECUTE FUNCTION set_member_card_code();

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_card_code
  ON members (gym_id, card_code)
  WHERE card_code IS NOT NULL;

-- The unique partial index above already serves the reception lookup
-- (gym_id, card_code) — no second index needed.
