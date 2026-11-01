import { test, expect } from '@playwright/test';

// The driver tablet's Passengers screen: who is on board, got off or didn't
// show (from taps and the driver's own marks), the boarding-help note, and
// marks that are saved with the driver's name and blocked while driving.

const at = (minAgo) => new Date(Date.now() - minAgo * 60_000).toISOString();
const vehicle = { id: 'bus-a', name: 'Bus A', company_id: 'company-a', capacity: 25, status: 'idle', speed: 0, current_lat: 12.05, current_lng: -61.75, last_location_update: at(0.2) };
const staff = [
  { id: 'ann', full_name: 'Ann Lee', home_lat: 12.02, home_lng: -61.76, boarding_note: 'Needs a lower step', ride: { state: 'on_board', at: at(20) } },
  { id: 'ben', full_name: 'Ben Cole', home_lat: 12.03, home_lng: -61.77, ride: { state: 'not_yet' } },
  { id: 'cat', full_name: 'Cat Diaz', home_lat: 12.04, home_lng: -61.78, ride: { state: 'got_off', at: at(5) } },
];
const base = { vehicle, driver_name: 'Kofi', has_driver_pin: true, occupancy: 1, staff, check_ins: [], broadcasts: [], group_messages: [], trips: [], inspection_templates: [], recent_inspections: [], open_shift: { id: 'sh1', started_at: at(60) }, emergency_contacts: { boss_phone: '', secretary_phone: '' }, company_name: 'Company A', driver_unlocked: true };

async function openPassengers(page, context = base) {
  const marks = [];
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch { /* none */ }
    if (url.includes('/functions/driverSession')) {
      if (body.action === 'verify_pin') return route.fulfill({ json: { ok: true, driver_grant: 'a'.repeat(64) } });
      if (body.action === 'ride_exception') {
        marks.push({ ref: body.ref, kind: body.kind, driver_name: body.driver_name, granted: body.driver_grant === 'a'.repeat(64) });
        if (body.kind === 'no_show') return route.fulfill({ json: { ok: true, ref: body.ref, ride: { state: 'no_show', at: at(0) }, occupancy: 1 } });
        return route.fulfill({ status: 409, json: { error: 'Ben Cole is already on board' } });
      }
      return route.fulfill({ json: context });
    }
    if (url.includes('/functions/appSupport')) return route.fulfill({ json: { whatsapp_number: '' } });
    if (url.includes('/entities/')) return route.fulfill({ status: 403, json: { error: 'Direct entity access blocked in test' } });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  await page.route('https://api.mapbox.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.addInitScript(() => { localStorage.setItem('tt_driver_device_id', 'driver-test'); localStorage.setItem('tt-map-engine', 'basic'); navigator.geolocation.watchPosition = () => 1; navigator.geolocation.clearWatch = () => {}; });
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto('/driver/track');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.getByRole('navigation', { name: 'Driver sections' }).getByRole('button', { name: 'Passengers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Passengers', exact: true })).toBeVisible();
  return { marks, list: page.getByLabel('Assigned passengers') };
}

test('shows each passenger\'s ride in words, with the boarding note', async ({ page }) => {
  const { list } = await openPassengers(page);
  await expect(list.getByText(/^On board since/)).toBeVisible();
  await expect(list.getByText(/^Got off at/)).toBeVisible();
  await expect(list.getByText('Help: Needs a lower step')).toBeVisible();
  await expect(page.getByText('still to pick up')).toBeVisible();
  // Only the marks that fit each ride are offered.
  await expect(list.getByRole('button', { name: "Got off (no tap): Ann Lee" })).toBeVisible();
  await expect(list.getByRole('button', { name: "Didn't show: Ann Lee" })).toHaveCount(0);
  await expect(list.getByRole('button', { name: "Didn't show: Ben Cole" })).toBeVisible();
});

test('a no-show is confirmed, saved with the driver\'s name, and a refused mark says why', async ({ page }) => {
  const { marks, list } = await openPassengers(page);
  await list.getByRole('button', { name: "Didn't show: Ben Cole" }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: "Didn't show" }).click();
  await expect(page.getByText('Ben Cole marked as a no-show').first()).toBeVisible();
  await expect(list.getByText("Didn't show at the pickup")).toBeVisible();
  await expect(list.getByRole('button', { name: 'Undo no-show: Ben Cole' })).toBeVisible();
  expect(marks).toEqual([{ ref: 'ben', kind: 'no_show', driver_name: 'Kofi', granted: true }]);
  await list.getByRole('button', { name: 'Got on (no tap): Cat Diaz' }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Got on (no tap)' }).click();
  await expect(page.getByText('Ben Cole is already on board').first()).toBeVisible();
});

test('marks are blocked while the bus is moving', async ({ page }) => {
  const { list } = await openPassengers(page, { ...base, vehicle: { ...vehicle, speed: 40 } });
  await expect(page.getByText('Stop the bus to mark passengers.')).toBeVisible();
  await expect(list.getByRole('button', { name: "Didn't show: Ben Cole" })).toBeDisabled();
});
