-- ====================================================================
-- Extend members table: add email, birth_date, medical_notes
-- ====================================================================
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS medical_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_members_email ON members(gym_id, email);
