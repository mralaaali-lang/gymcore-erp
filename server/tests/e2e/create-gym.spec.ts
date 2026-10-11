import { test, expect } from '@playwright/test';

test('tenants page loads', async ({ page }) => {
  const response = await page.goto('/super-admin/tenants');
  expect(response?.status()).toBeLessThan(400);
});
