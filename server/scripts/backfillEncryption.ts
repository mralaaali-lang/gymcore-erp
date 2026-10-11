import pool from '../src/config/database';

/**
 * Re-encrypts all existing member data with the current ENCRYPTION_KEY.
 * Needed once after the 018 migration to fix data that was encrypted with
 * a temporary migration key instead of the real runtime key.
 *
 * Requires ENCRYPTION_KEY in environment.
 * Run: $env:ENCRYPTION_KEY='...'; npx ts-node --transpile-only scripts/backfillEncryption.ts
 */
async function main() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    console.error('FATAL: ENCRYPTION_KEY environment variable is not set.');
    process.exit(1);
  }

  await pool.query(`SELECT set_config('app.encryption_key', $1, false)`, [key]);

  const result = await pool.query(`
    UPDATE members
    SET
      phone_encrypted = encrypt_sensitive(phone_number),
      notes_encrypted = encrypt_sensitive(medical_notes),
      phone_hash = COALESCE(phone_hash, phone_hash(phone_number))
    WHERE phone_number IS NOT NULL
  `);

  console.log(`Re-encrypted ${result.rowCount} member(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
