import { test, expect } from '@playwright/test';

test('billing page loads', async ({ page }) => {
  const response = await page.goto('/super-admin/billing');
  expect(response?.status()).toBeLessThan(400);
});
