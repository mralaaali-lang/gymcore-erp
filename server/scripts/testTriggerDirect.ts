import pool from '../src/config/database';

async function main() {
  // Test trigger directly
  const key = process.env.ENCRYPTION_KEY;
  if (!key) { console.error('No key'); process.exit(1); }

  await pool.query(`SELECT set_config('app.encryption_key', $1, false)`, [key]);
  await pool.query(`SELECT set_config('app.gym_id', (SELECT id::text FROM gyms LIMIT 1), false)`);

  const testName = 'TriggerTest ' + Date.now();
  const result = await pool.query(
    `INSERT INTO members (gym_id, full_name, phone_number, medical_notes)
     VALUES ((SELECT id FROM gyms LIMIT 1), $1, $2, $3) RETURNING *`,
    [testName, '+966500011122', 'Some test notes']
  );
  const row = result.rows[0];
  console.log('phone_number (should be NULL):', row.phone_number);
  console.log('medical_notes (should be NULL):', row.medical_notes);
  console.log('phone_encrypted (should be BYTEA):', row.phone_encrypted?.subtype, 'length:', row.phone_encrypted?.data?.length);
  console.log('notes_encrypted (should be BYTEA):', row.notes_encrypted?.subtype, 'length:', row.notes_encrypted?.data?.length);
  console.log('phone_hash:', row.phone_hash);

  // Verify decryption
  const check = await pool.query(
    `SELECT decrypt_sensitive(phone_encrypted) as pn, decrypt_sensitive(notes_encrypted) as mn FROM members WHERE id = $1`,
    [row.id]
  );
  console.log('Decrypted phone:', check.rows[0].pn);
  console.log('Decrypted notes:', check.rows[0].mn);

  await pool.end();
}

main().catch(console.error);
