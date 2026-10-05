import { test, expect } from '@playwright/test';

// The 3D map and your own position. Mapbox is not reachable from tests, so a
// blank style stands in for the real one; the camera logic is the same.
async function setup(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('base44_access_token', 'mock-authenticated-session');
    localStorage.setItem('tt-map-engine', 'full');
    window.gpsCallbacks = new Map();
    let id = 0;
    navigator.geolocation.getCurrentPosition = (s) => { window.gpsCallbacks.set(++id, s); };
    navigator.geolocation.watchPosition = (s) => { window.gpsCallbacks.set(++id, s); return id; };
    navigator.geolocation.clearWatch = (i) => window.gpsCallbacks.delete(i);
  });
  await page.route('https://api.mapbox.com/**', (r) => (r.request().url().includes('/styles/v1/')
    ? r.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#123' } }] } })
    : r.fulfill({ status: 404, body: '' })));
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/functions/entityAccess')) {
      const b = route.request().postDataJSON();
      let result = [];
      if (b.entity === 'User' && b.operation === 'get') result = { id: 'c', email: 'c@test.local', full_name: 'Test Caller', role: 'admin' };
      else if (b.entity === 'Vehicle') result = [{ id: 'bus-a', name: 'Bus A', company_id: 'a', status: 'active', current_lat: 12.1, current_lng: -61.65, last_location_update: new Date().toISOString() }];
      return route.fulfill({ json: { result } });
    }
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  return errors;
}
const sendFix = (page) => page.evaluate(() => {
  for (const s of window.gpsCallbacks.values()) s({ coords: { latitude: 12.04, longitude: -61.74, accuracy: 5 } });
});
async function offCentre(page, mapIndex = 0) {
  const map = await page.locator('.mapboxgl-map').nth(mapIndex).boundingBox();
  const me = await page.locator('.tt-map-me').first().boundingBox();
  return Math.round(Math.hypot(me.x + me.width / 2 - (map.x + map.width / 2), me.y + me.height / 2 - (map.y + map.height / 2)));
}

test('the 3D live fleet map goes to you when your GPS fix arrives', async ({ page }) => {
  const errors = await setup(page);
  await page.goto('/admin/fleet');
  await expect(page.locator('canvas.mapboxgl-canvas').first()).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1500); // the map has already framed the buses
  await sendFix(page);
  await expect(page.locator('.tt-map-me')).toBeAttached();
  await expect.poll(() => offCentre(page), { timeout: 10000 }).toBeLessThan(10);
  expect(errors).toEqual([]);
});

test('My location on a map without your position asks for it and goes there', async ({ page }) => {
  const errors = await setup(page);
  await page.goto('/admin');
  await expect(page.locator('canvas.mapboxgl-canvas').first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.tt-map-me')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show my location' }).first().click();
  await expect(page.getByText('Finding your location…')).toBeVisible();
  await sendFix(page);
  await expect(page.locator('.tt-map-me')).toBeAttached();
  await expect(page.getByText('Finding your location…')).toHaveCount(0);
  await expect.poll(() => offCentre(page), { timeout: 10000 }).toBeLessThan(10);
  expect(errors).toEqual([]);
});
