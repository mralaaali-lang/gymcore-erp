import bcrypt from 'bcrypt';

async function checkSuppliedHash() {
  const password = process.env.PLATFORM_ADMIN_TEST_PASSWORD;
  const hash = process.env.PLATFORM_ADMIN_TEST_HASH;
  if (!password || !hash) {
    throw new Error('Set PLATFORM_ADMIN_TEST_PASSWORD and PLATFORM_ADMIN_TEST_HASH for a disposable test account.');
  }
  const matches = await bcrypt.compare(password, hash);
  console.log(matches ? 'Password matches the supplied hash.' : 'Password does not match the supplied hash.');
  process.exit(matches ? 0 : 1);
}

checkSuppliedHash().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Hash check failed.');
  process.exit(1);
});