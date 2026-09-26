import { test, expect } from '@playwright/test';

// Real E2E against the live backend. Same reasoning as
// kiosk-bus-boarding.spec.js: pairing codes are one-time-use, so this seeds
// localStorage with a permanently-paired fixture device's id (the steady
// state a real driver tablet is in every day after its one-time pairing)
// rather than replaying the ?code= flow.
const DEVICE_ID = '6ab72f96a01e01329ada39dd'; // "E2E Driver Test Device", vehicle driver_pin "1111"

test('an already-paired driver device loads its session and PIN-unlocks', async ({ page }) => {
  await page.addInitScript((id) => {
    window.localStorage.setItem('tt_driver_device_id', id);
  }, DEVICE_ID);

  await page.goto('/driver');

  await expect(page.getByText('Driver PIN required')).toBeVisible({ timeout: 15000 });

  await page.locator('input[type="password"]').fill('1111');
  await page.getByRole('button', { name: /unlock/i }).click();

  // PIN gate is gone once unlocked — stage-independent (morning routes to
  // inspection, otherwise track), so this is the one time-safe success signal.
  await expect(page.getByText('Driver PIN required')).not.toBeVisible();
});
