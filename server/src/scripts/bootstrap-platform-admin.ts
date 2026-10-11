import bcrypt from 'bcrypt';
import { getAdminClient } from '../config/database';

const PASSWORD_HASH_COST = 12;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' is required; provide it through a secure environment variable.');
  return value;
}

async function bootstrapFirstPlatformAdmin(): Promise<string> {
  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const fullName = required('BOOTSTRAP_ADMIN_NAME');
  const password = required('BOOTSTRAP_ADMIN_PASSWORD');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address.');
  }
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters and include uppercase, lowercase, and a number.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Run migrations before bootstrapping the first account.');
  }

  const client = await getAdminClient();
  try {
    // Serialize concurrent bootstrap attempts and refuse to run after any account exists.
    await client.query('LOCK TABLE platform_admins IN SHARE ROW EXCLUSIVE MODE');
    const existing = await client.query('SELECT COUNT(*)::int AS count FROM platform_admins');
    if (Number(existing.rows[0]?.count ?? 0) > 0) {
      throw new Error('Bootstrap refused: a platform admin already exists. Use the admin management screen.');
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_COST);
    await client.query(
      'INSERT INTO platform_admins (email, password_hash, full_name, role_type, is_active) ' +
      "VALUES ($1, $2, $3, 'super_admin', true)",
      [email, passwordHash, fullName]
    );
    await client.query('COMMIT');
    return email;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

bootstrapFirstPlatformAdmin()
  .then((email) => {
    console.log('Created the first platform super admin: ' + email);
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Bootstrap failed.';
    console.error(message);
    process.exit(1);
  });
