import { test, expect } from '@playwright/test';

// No auth needed — these just confirm the app boots and routes correctly
// against the real backend (via the preview proxy in vite.config.js).
test.describe('public pages', () => {
  test('welcome page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveTitle(/error/i);
    await page.waitForLoadState('networkidle');
  });

  test('login page loads with email/password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('register page loads', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
