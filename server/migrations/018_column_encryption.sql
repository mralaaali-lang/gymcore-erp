CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION get_encryption_key()
RETURNS TEXT AS $$
DECLARE
  key TEXT;
BEGIN
  BEGIN
    key := NULLIF(current_setting('app.encryption_key', true), '');
  EXCEPTION WHEN OTHERS THEN
    key := NULL;
  END;
  RETURN key;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION encrypt_sensitive(plaintext TEXT)
RETURNS BYTEA AS $$
DECLARE
  key TEXT := get_encryption_key();
BEGIN
  IF plaintext IS NULL OR key IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_encrypt(plaintext, key);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION decrypt_sensitive(ciphertext BYTEA)
RETURNS TEXT AS $$
DECLARE
  key TEXT := get_encryption_key();
BEGIN
  IF ciphertext IS NULL OR key IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(ciphertext, key);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION phone_hash(plaintext TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
  RETURN LOWER(ENCODE(DIGEST(COALESCE(plaintext, ''), 'sha256'), 'hex'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER TABLE members ADD COLUMN IF NOT EXISTS phone_encrypted BYTEA;
ALTER TABLE members ADD COLUMN IF NOT EXISTS notes_encrypted BYTEA;
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64);

-- Populate phone_hash for existing members (immutable, doesn't need encryption key)
UPDATE members SET phone_hash = phone_hash(phone_number) WHERE phone_hash IS NULL AND phone_number IS NOT NULL;

-- Drop old plaintext UNIQUE constraint, replace with hash-based uniqueness
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_gym_id_phone_number_key;
DROP INDEX IF EXISTS idx_members_phone_hash;
CREATE UNIQUE INDEX idx_members_phone_hash ON members(gym_id, phone_hash) WHERE phone_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION trg_members_encrypt()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.phone_number IS DISTINCT FROM OLD.phone_number THEN
    NEW.phone_encrypted = encrypt_sensitive(NEW.phone_number);
    NEW.phone_hash = phone_hash(NEW.phone_number);
    NEW.phone_number = NULL;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.medical_notes IS DISTINCT FROM OLD.medical_notes THEN
    NEW.notes_encrypted = encrypt_sensitive(NEW.medical_notes);
    NEW.medical_notes = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_members_encrypt ON members;
CREATE TRIGGER trg_members_encrypt
  BEFORE INSERT OR UPDATE OF phone_number, medical_notes ON members
  FOR EACH ROW EXECUTE FUNCTION trg_members_encrypt();

-- The trigger nulls the plaintext phone_number (moved to phone_encrypted),
-- so the column MUST be nullable — otherwise every INSERT fails the NOT NULL constraint.
ALTER TABLE members ALTER COLUMN phone_number DROP NOT NULL;
