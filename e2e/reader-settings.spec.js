import { test, expect } from '@playwright/test';
import { mockFleet } from './helpers/fleetFixture.js';

// Admin → Kiosk tablets: a boarding tablet's reader can record boarding and
// getting off (asks), boarding only, or getting off only, and can require an
// open driver shift. Saved with the device; the tablet follows it.

test('a boarding tablet can be set to record boarding only and need an open shift', async ({ page }) => {
  const { calls } = await mockFleet(page, { role: 'admin' });
  await page.goto('/admin/kiosks');
  await page.getByRole('button', { name: /Reassign/ }).first().click();
  const dialog = page.getByRole('dialog');
  const mode = dialog.getByRole('combobox', { name: 'What this reader records' });
  await expect(mode).toHaveText(/Boarding and getting off/);
  await mode.click();
  await page.getByRole('option', { name: /Boarding only/ }).click();
  await dialog.getByLabel(/Only accept taps while a driver shift is open/).check();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);
  const update = calls.find((c) => c.fn === 'entityAccess' && c.body?.entity === 'KioskDevice' && c.body?.operation === 'update');
  expect(update.body.data).toMatchObject({ reader_mode: 'boarding', require_active_trip: true });
});
