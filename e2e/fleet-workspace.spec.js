import { test, expect } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';

// Admin → Live fleet is one page: the map and every bus; tap a bus for
// everything about it in one panel. The camera wall (a tile per bus), saved
// clips, the whole-fleet health table, past trips and reports open on the
// same page. Live cameras keep the same rules: only when an admin opens one,
// driver tablets' front and back cameras only (never a boarding tablet), at
// most 4 at once.

async function open(page, { camera = true, path = '/admin/fleet-workspace' } = {}) {
  const data = fleetData();
  // Set both times here: the shared fixture's times are fixed when the test worker starts.
  Object.assign(data.vehicles[0], { tracking_active: true, speed: 10, last_location_update: new Date(Date.now() - 20_000).toISOString(), driver_name: 'Kevin Thomas', driver_email: 'kevin@test.local' });
  data.vehicles[1].last_location_update = new Date(Date.now() - 40 * 60_000).toISOString();
  Object.assign(data.kiosks[1].helper_health, { support_available: camera, support_transport: 'webrtc', recordings_available: true, management_available: true, management_owner: true, kiosk_enabled: true, kiosk_locked: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const session = await mockFleet(page, { role: 'admin', data });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(path);
  return { data, errors, session };
}
const cameras = (page) => page.getByRole('dialog', { name: 'Cameras' });
// Wait until no sheet is still sliding closed, so the next key goes to what's open.
const settled = (page) => expect(page.locator('[role=dialog][data-state=closed]')).toHaveCount(0);

test('the old Fleet workspace address opens the camera wall: a tile per bus with its location, speed and shift', async ({ page }) => {
  const { data, errors } = await open(page);
  const wall = cameras(page);
  const tiles = wall.getByRole('list', { name: 'Bus tiles' });
  const bus1 = tiles.getByRole('listitem', { name: data.vehicles[0].name });
  await expect(bus1).toContainText('2 cams');
  await expect(bus1).toContainText('36 km/h');
  await expect(bus1).toContainText(/On shift since/);
  const bus2 = tiles.getByRole('listitem', { name: data.vehicles[1].name });
  await expect(bus2).toContainText('No live camera');
  await expect(bus2).toContainText(/Last known/);
  // Search and filter.
  await wall.getByLabel('Search buses').fill(data.vehicles[1].name);
  await expect(tiles.getByRole('listitem')).toHaveCount(1);
  await wall.getByLabel('Search buses').fill('');
  await expect(tiles.getByRole('listitem')).toHaveCount(2);
  await wall.getByLabel('Show', { exact: true }).selectOption('camera');
  await expect(tiles.getByRole('listitem')).toHaveCount(1);
  await page.screenshot({ path: '/tmp/tt-fleet-monitor.png' });
  // A bus's name opens its panel; it opens no camera.
  await tiles.getByRole('button', { name: `Open ${data.vehicles[0].name}`, exact: true }).click();
  await expect(wall).toBeHidden();
  await expect(page.getByRole('dialog', { name: data.vehicles[0].name })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Remote tablet viewing' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/fleet\?bus=bus-a$/);
  expect(errors).toEqual([]);
});

// The live-viewing service: switched on; every view waits for the tablet.
async function liveViewing(page) {
  const support = [];
  await page.route('**/functions/tabletSupport', (r) => {
    const b = r.request().postDataJSON() || {};
    support.push(b);
    if (b.operation === 'config') return r.fulfill({ json: { enabled: true, relay_configured: true } });
    const id = b.session_id || `view-${support.filter((x) => x.operation === 'request').length}`;
    return r.fulfill({ json: { session: { id, state: b.operation === 'end' ? 'ended' : 'waiting_permission', expires_at: new Date(Date.now() + 600_000).toISOString() } } });
  });
  return support;
}

test('one tap starts a bus\'s back camera in its box; the driver tablet\'s cameras only', async ({ page }) => {
  const { data, errors } = await open(page);
  const support = await liveViewing(page);
  const tablet = data.kiosks.find((k) => k.kiosk_type === 'driver');
  const wall = cameras(page);
  const tiles = wall.getByRole('list', { name: 'Bus tiles' });
  await expect(wall.getByRole('region', { name: 'Remote tablet viewing' })).toHaveCount(0);
  await expect(wall.getByText(/Live cameras are a trial until they're tested on a bus/)).toBeVisible();
  await expect(tiles.getByRole('button', { name: `${data.vehicles[1].name}: no live camera` })).toBeDisabled();
  expect(support.filter((x) => x.operation === 'request')).toEqual([]);
  // One tap: the back camera is asked for straight away, inside the box.
  await tiles.getByRole('button', { name: `Open live camera: ${data.vehicles[0].name}` }).click();
  const viewer = wall.getByRole('region', { name: 'Remote tablet viewing' });
  await expect(viewer).toBeVisible();
  await expect.poll(() => support.filter((x) => x.operation === 'request')).toEqual([{ operation: 'request', device_id: tablet.id, capability: 'camera_back' }]);
  await expect(viewer.getByText('Waiting for the tablet…')).toBeVisible();
  const cams = viewer.getByRole('group', { name: 'Camera' });
  await expect(cams.getByRole('button', { name: 'Back camera' })).toHaveAttribute('aria-pressed', 'true');
  await expect(cams.getByRole('button', { name: 'Front camera' })).toHaveAttribute('aria-pressed', 'false');
  await expect(viewer.getByRole('button', { name: /screen/i })).toHaveCount(0);
  await expect(wall.getByText(/1 of 4 live views open/)).toBeVisible();
  await page.screenshot({ path: '/tmp/tt-fleet-one-tap.png' });
  // One tap to change camera: the back view ends, the front one is asked for.
  await cams.getByRole('button', { name: 'Front camera' }).click();
  await expect.poll(() => support.filter((x) => x.operation === 'request').map((x) => x.capability)).toEqual(['camera_back', 'camera_front']);
  expect(support.filter((x) => x.operation === 'end').map((x) => x.session_id)).toEqual(['view-1']);
  await expect(cams.getByRole('button', { name: 'Front camera' })).toHaveAttribute('aria-pressed', 'true');
  // Close ends it.
  await tiles.getByRole('button', { name: `Close camera: ${data.vehicles[0].name}` }).click();
  await expect(viewer).toHaveCount(0);
  await expect.poll(() => support.filter((x) => x.operation === 'end').map((x) => x.session_id)).toEqual(['view-1', 'view-2']);
  // A view whose tile is searched off the screen ends and stops counting.
  await tiles.getByRole('button', { name: `Open live camera: ${data.vehicles[0].name}` }).click();
  await expect(wall.getByText(/1 of 4 live views open/)).toBeVisible();
  await wall.getByLabel('Search buses').fill(data.vehicles[1].name);
  await expect(viewer).toHaveCount(0);
  await expect(wall.getByText(/live views open/)).toHaveCount(0);
  await wall.getByLabel('Search buses').fill('');
  await expect(tiles.getByRole('button', { name: `Open live camera: ${data.vehicles[0].name}` })).toBeEnabled();
  await expect.poll(() => support.filter((x) => x.operation === 'end').length).toBe(3);
  // Closing the wall ends any view still open.
  await tiles.getByRole('button', { name: `Open live camera: ${data.vehicles[0].name}` }).click();
  await expect(viewer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(wall).toBeHidden();
  await expect.poll(() => support.filter((x) => x.operation === 'end').length).toBe(4);
  await expect(page).toHaveURL(/\/admin\/fleet$/);
  expect(errors).toEqual([]);
});

test('a bus box says plainly when live viewing is off, and asks the tablet nothing', async ({ page }) => {
  const { data, errors } = await open(page);
  const support = [];
  await page.route('**/functions/tabletSupport', (r) => { support.push(r.request().postDataJSON() || {}); return r.fulfill({ json: { enabled: false } }); });
  await cameras(page).getByRole('list', { name: 'Bus tiles' }).getByRole('button', { name: `Open live camera: ${data.vehicles[0].name}` }).click();
  const viewer = page.getByRole('region', { name: 'Remote tablet viewing' });
  await expect(viewer.getByText("Live viewing isn't switched on yet.")).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Back camera' })).toBeDisabled();
  expect(support.length).toBeGreaterThan(0);
  expect(support.every((x) => x.operation === 'config')).toBe(true);
  expect(errors).toEqual([]);
});

test('a bus panel has everything about it: now, tracking, its camera, its tablets and GPS, what needs attention', async ({ page }) => {
  const { data, errors } = await open(page, { path: '/admin/fleet' });
  const support = await liveViewing(page);
  const name = data.vehicles[0].name;
  await page.getByRole('region', { name: 'Buses' }).getByRole('button', { name: new RegExp(`^${name},`) }).click();
  const panel = page.getByRole('dialog', { name });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/fleet\?bus=bus-a$/);
  const now = panel.getByRole('region', { name: 'Now' });
  await expect(now).toContainText('Kevin Thomas');
  await expect(now).toContainText('36 km/h');
  await expect(now).toContainText(/Since .* Kevin Thomas/);
  const health = panel.getByRole('region', { name: 'Tablets and GPS' });
  await expect(health).toContainText('Live');
  await expect(health).toContainText('Driver: Protection failed');
  await expect(panel.getByRole('list', { name: `${name} alerts` })).toContainText('kiosk protection failed');
  // Its camera starts only when asked, back camera first.
  expect(support.filter((x) => x.operation === 'request')).toEqual([]);
  await panel.getByRole('button', { name: `Open live camera: ${name}` }).click();
  await expect(panel.getByRole('region', { name: 'Remote tablet viewing' })).toBeVisible();
  await expect.poll(() => support.filter((x) => x.operation === 'request').map((x) => x.capability)).toEqual(['camera_back']);
  await panel.getByRole('button', { name: `Close camera: ${name}` }).click();
  await expect(panel.getByRole('region', { name: 'Remote tablet viewing' })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/tt-fleet-bus-panel.png' });
  // The panel sits beside the map: another bus can be picked straight from the list.
  await page.getByRole('region', { name: 'Buses' }).getByRole('button', { name: new RegExp(`^${data.vehicles[1].name},`) }).click();
  await expect(page.getByRole('dialog', { name: data.vehicles[1].name })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/fleet\?bus=bus-b$/);
  // Past trips opens the timeline for it; closing comes back to its panel.
  await page.getByRole('dialog', { name: data.vehicles[1].name }).getByRole('button', { name: 'Past trips' }).click();
  const timeline = page.getByRole('dialog', { name: 'Location timeline' });
  await expect(timeline).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(timeline).toBeHidden();
  await expect(page.getByRole('dialog', { name: data.vehicles[1].name })).toBeVisible();
  // Escape closes the panel and lets the bus go.
  await settled(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: data.vehicles[1].name })).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/fleet$/);
  expect(errors).toEqual([]);
});

test('needs attention, saved clips and reports are on the same page', async ({ page }) => {
  const { errors } = await open(page, { path: '/admin/fleet' });
  await expect(page.getByRole('region', { name: 'Needs attention' }).getByRole('list', { name: 'Fleet alerts' })).toContainText(/kiosk protection failed/);
  await page.getByRole('main').getByRole('button', { name: 'Cameras', exact: true }).click();
  await cameras(page).getByRole('tab', { name: 'Saved clips' }).click();
  await expect(cameras(page).getByRole('group', { name: 'Choose a bus' }).getByRole('button')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(cameras(page)).toBeHidden();
  await page.getByRole('main').getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Reports' }).getByRole('link', { name: /Driving reports/ })).toHaveAttribute('href', '/admin/driving-reports');
  expect(errors).toEqual([]);
});
