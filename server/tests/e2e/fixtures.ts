import { Page } from '@playwright/test';

export async function loginAsSuperAdmin(page: Page) {
  const email = process.env.E2E_PLATFORM_ADMIN_EMAIL;
  const password = process.env.E2E_PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set E2E_PLATFORM_ADMIN_EMAIL and E2E_PLATFORM_ADMIN_PASSWORD to a disposable local test account.');
  }

  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/.*super-admin|.*dashboard|.*billing/, { timeout: 15000 });
}