import { test, expect } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';

// Admin → Fleet workspace, laid out as a monitoring screen: a tile per bus,
// the map and a bus list; Playback, Alerts and Reports tabs. Live cameras
// keep the same rules: only when an admin opens one, driver tablets' front
// and back cameras only (never a boarding tablet), at most 4 at once.

async function open(page, { camera = true } = {}) {
  const data = fleetData();
  // Set both times here: the shared fixture's times are fixed when the test worker starts.
  Object.assign(data.vehicles[0], { tracking_active: true, speed: 10, last_location_update: new Date(Date.now() - 20_000).toISOString() });
  data.vehicles[1].last_location_update = new Date(Date.now() - 40 * 60_000).toISOString();
  Object.assign(data.kiosks[1].helper_health, { support_available: camera, support_transport: 'webrtc', recordings_available: true, management_available: true, management_owner: true, kiosk_enabled: true, kiosk_locked: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const session = await mockFleet(page, { role: 'admin', data });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/fleet-workspace');
  return { data, errors, session };
}

test('shows each bus as a tile and in the list, with its location, speed and shift', async ({ page }) => {
  const { data, errors } = await open(page);
  const buses = page.getByRole('list', { name: 'Buses' });
  await expect(buses.getByText(data.vehicles[0].name, { exact: true })).toBeVisible();
  await expect(buses.getByText(/Last known/)).toBeVisible();
  await expect(buses.getByText('36 km/h')).toBeVisible();
  const tiles = page.getByRole('list', { name: 'Bus tiles' });
  const bus1 = tiles.getByRole('listitem', { name: data.vehicles[0].name });
  await expect(bus1).toContainText('2 cams');
  await expect(bus1).toContainText(/On shift since/);
  await expect(tiles.getByRole('listitem', { name: data.vehicles[1].name })).toContainText('No live camera');
  // Search and filter.
  await page.getByLabel('Search buses').fill(data.vehicles[1].name);
  await expect(tiles.getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('Search buses').fill('');
  await expect(tiles.getByRole('listitem')).toHaveCount(2);
  // A row in the list shows that bus on the map; it opens no camera.
  await buses.getByRole('button', { name: `Show ${data.vehicles[0].name} on the map` }).click();
  await expect(page.getByRole('region', { name: 'Remote tablet viewing' })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/tt-fleet-monitor.png' });
  await page.getByLabel('Show', { exact: true }).selectOption('camera');
  await expect(tiles.getByRole('listitem')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a live camera opens only when asked, offers the driver tablet\'s cameras only', async ({ page }) => {
  const { data, errors } = await open(page);
  const tiles = page.getByRole('list', { name: 'Bus tiles' });
  await expect(page.getByRole('region', { name: 'Remote tablet viewing' })).toHaveCount(0);
  await expect(page.getByText(/Live cameras are a trial until they're tested on a bus/)).toBeVisible();
  await expect(tiles.getByRole('button', { name: `${data.vehicles[1].name}: no live camera` })).toBeDisabled();
  await tiles.getByRole('button', { name: `Open live camera: ${data.vehicles[0].name}` }).click();
  const viewer = page.getByRole('region', { name: 'Remote tablet viewing' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'View back camera' })).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'View front camera' })).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'View screen' })).toHaveCount(0);
  await expect(page.getByText(/1 of 4 live views open/)).toBeVisible();
  await tiles.getByRole('button', { name: `Close camera: ${data.vehicles[0].name}` }).click();
  await expect(viewer).toHaveCount(0);
  // A view whose tile is searched off the screen ends and stops counting.
  await tiles.getByRole('button', { name: `Open live camera: ${data.vehicles[0].name}` }).click();
  await expect(page.getByText(/1 of 4 live views open/)).toBeVisible();
  await page.getByLabel('Search buses').fill(data.vehicles[1].name);
  await expect(viewer).toHaveCount(0);
  await expect(page.getByText(/live views open/)).toHaveCount(0);
  await page.getByLabel('Search buses').fill('');
  await expect(tiles.getByRole('button', { name: `Open live camera: ${data.vehicles[0].name}` })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('alerts, playback and reports are tabs', async ({ page }) => {
  const { errors } = await open(page);
  const tabs = page.getByRole('group', { name: 'Fleet workspace' });
  await tabs.getByRole('button', { name: /^Alerts/ }).click();
  await expect(page.getByRole('list', { name: 'Fleet alerts' }).getByText(/kiosk protection failed/)).toBeVisible();
  await tabs.getByRole('button', { name: /^Playback/ }).click();
  await expect(page.getByRole('group', { name: 'Choose a bus' }).getByRole('button')).toHaveCount(1);
  await tabs.getByRole('button', { name: /^Reports/ }).click();
  await expect(page.getByRole('list', { name: 'Reports' }).getByRole('link', { name: /Driving reports/ })).toHaveAttribute('href', '/admin/driving-reports');
  expect(errors).toEqual([]);
});
