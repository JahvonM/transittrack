import { test, expect } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';

// Admin → Fleet workspace: buses with their location state and shift,
// alerts that link to where to act, and cameras as an opt-in trial that only
// offers road-facing driver tablet cameras.

test('shows each bus, what needs attention, and keeps cameras off until asked', async ({ page }) => {
  const data = fleetData();
  // Set both times here: the shared fixture's times are fixed when the test worker starts.
  Object.assign(data.vehicles[0], { tracking_active: true, last_location_update: new Date(Date.now() - 20_000).toISOString() });
  data.vehicles[1].last_location_update = new Date(Date.now() - 40 * 60_000).toISOString();
  Object.assign(data.kiosks[1].helper_health, { support_available: true, support_transport: 'webrtc', management_available: true, management_owner: true, kiosk_enabled: true, kiosk_locked: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockFleet(page, { role: 'admin', data });
  await page.goto('/admin/fleet-workspace');
  const buses = page.getByRole('list', { name: 'Buses' });
  await expect(buses.getByText(data.vehicles[0].name, { exact: true })).toBeVisible();
  await expect(buses.getByText(/Last known/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Fleet alerts' }).getByText(/kiosk protection failed/)).toBeVisible();
  // Cameras: off by default; switched on, only the driver tablet is offered.
  await expect(page.getByText(/Off\. Each view asks the tablet/)).toBeVisible();
  await page.getByRole('switch', { name: 'Show camera trial' }).click();
  await expect(page.getByRole('checkbox', { name: /Bus 1 driver/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /boarding/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});
