import pool from '../src/config/database';

async function main() {
  await pool.query(`
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
  `);
  console.log('Trigger function updated successfully.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
