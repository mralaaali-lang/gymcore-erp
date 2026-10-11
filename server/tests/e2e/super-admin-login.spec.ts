import { test, expect } from '@playwright/test';

test('login page loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('login rejects invalid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'invalid@test.com');
  await page.fill('input[type="password"]', 'wrong');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  expect(page.url()).toContain('login');
});
