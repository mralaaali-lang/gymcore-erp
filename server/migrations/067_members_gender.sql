-- 067: gender column for members (nullable; UI select ذكر/أنثى).
-- Existing rows stay NULL and display «—» until edited.
ALTER TABLE members ADD COLUMN IF NOT EXISTS gender varchar(10);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_members_gender') THEN
    ALTER TABLE members
      ADD CONSTRAINT chk_members_gender CHECK (gender IS NULL OR gender IN ('male', 'female'));
  END IF;
END $$;
