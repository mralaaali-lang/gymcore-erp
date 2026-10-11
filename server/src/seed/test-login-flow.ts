import bcrypt from 'bcrypt';
import { getAdminClient } from '../config/database';

async function verifyPlatformAdminCredentials() {
  const email = process.env.PLATFORM_ADMIN_TEST_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('Set PLATFORM_ADMIN_TEST_EMAIL and PLATFORM_ADMIN_TEST_PASSWORD for a disposable test account.');
  }

  const client = await getAdminClient();
  try {
    const result = await client.query(
      'SELECT password_hash, is_active FROM platform_admins WHERE email = $1',
      [email]
    );
    const admin = result.rows[0];
    const matches = Boolean(admin?.is_active && await bcrypt.compare(password, admin.password_hash));
    await client.query('COMMIT');
    console.log(matches ? 'Platform admin credentials verified.' : 'Credentials did not match an active platform admin.');
    process.exit(matches ? 0 : 1);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

verifyPlatformAdminCredentials().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Credential check failed.');
  process.exit(1);
});