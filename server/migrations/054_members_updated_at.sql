-- Members updated_at (required by platform churn/overview reports)
ALTER TABLE members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
UPDATE members SET updated_at = created_at WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION trg_members_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_members_set_updated_at ON members;
CREATE TRIGGER trg_members_set_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION trg_members_set_updated_at();
