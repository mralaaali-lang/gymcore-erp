# Initial Platform Super Admin

The platform super admin is separate from every gym owner or staff account. There are no safe default credentials.

## First setup

1. Configure DATABASE_URL for the intended local or staging database.
2. Run the normal database migrations first: npm run migrate.
3. Provide these process environment variables through a secure local environment manager or the hosting provider's secret settings:
   - BOOTSTRAP_ADMIN_EMAIL
   - BOOTSTRAP_ADMIN_NAME
   - BOOTSTRAP_ADMIN_PASSWORD
4. From the server directory, run npm run bootstrap:platform-admin.
5. Open the platform login page and sign in with the email and password you supplied.
6. Remove the bootstrap variables from the process environment after successful creation.

The bootstrap command creates exactly one active super_admin and refuses to run if any platform-admin row already exists. It hashes the password with bcrypt and never prints the password. Use a strong password of at least 12 characters with uppercase, lowercase, and numeric characters.

Do not put real credentials in source files, deployment documentation, GitHub Actions YAML, or a committed .env file. On a staging database, use a separate email and password from production. Do not use real member or payment data there.

## Managing administrators

Open Platform Admins at /super-admin/admins. A super admin can add an administrator, update their name/email/role, set a new password, activate or deactivate access, and remove access. Password, email, role, activation, and removal changes revoke active sessions. Removing access deactivates the account so audit history remains attached.

At least one active super admin must remain. Gym owners, managers, receptionists, and other gym staff use the gym's Users/Staff area; they are not platform admins.

The forgot-password flow is also available on the platform login page, but it requires the email provider to be configured.