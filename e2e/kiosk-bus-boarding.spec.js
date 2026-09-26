import { test, expect } from '@playwright/test';

// Real E2E against the live backend. Pairing codes are one-time-use
// (confirmed in base44/functions/pairKioskDevice/entry.ts — re-pairing an
// already-paired device 409s), so this doesn't replay the ?code= flow every
// run. Instead it seeds localStorage with a permanently-paired fixture
// device's id before the app boots, exactly the steady state every real
// kiosk tablet is in on any ordinary day after its one-time pairing — and
// the only way to make this test idempotent.
const DEVICE_ID = '6ab72f96a01e01329ada39dc'; // "E2E Bus Boarding Test Kiosk", kept paired

test('an already-paired bus boarding kiosk heartbeats and shows the lock screen', async ({ page }) => {
  await page.addInitScript((id) => {
    window.localStorage.setItem('tt_kiosk_device_id', id);
  }, DEVICE_ID);

  await page.goto('/kiosk');

  await expect(page.getByText('Slide to check in')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('hvyurtet')).toBeVisible();
});
