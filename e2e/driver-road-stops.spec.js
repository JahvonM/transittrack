import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Driver tablet on a route with a drawn road: the stop list follows the road
// (the route's stops and the passengers' pickups, in the order the bus reaches
// them), a pickup can be moved to where the bus is (passengers are told), stops
// are only changed on the road, and directions follow the road.
const SHOTS = process.env.TT_SHOT_DIR || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const kiosk = { id: 'driver-test', kiosk_type: 'driver', vehicle_id: 'bus-a', company_id: 'company-a', company_name: 'Company A', status: 'active', paired: true };
const vehicle = { id: 'bus-a', name: 'Bus A', company_id: 'company-a', capacity: 25, status: 'idle', route_id: 'route-a', tracking_active: false };
const base = { vehicle, driver_name: 'Kofi', has_driver_pin: true, occupancy: 0, check_ins: [], broadcasts: [], group_messages: [], trips: [], inspection_templates: [], recent_inspections: [], open_shift: null, emergency_contacts: { boss_phone: '', secretary_phone: '' } };

// Town → True Blue → Grand Anse; `onFirstLeg(t)` is t of the way to True Blue.
const ROAD = [{ lat: 12.05, lng: -61.75 }, { lat: 12.02, lng: -61.76 }, { lat: 12.0, lng: -61.78 }];
const onFirstLeg = (t) => ({ lat: 12.05 - 0.03 * t, lng: -61.75 - 0.01 * t });
// Drawn through a point just past Town, as well as the three stops.
const route = { id: 'route-a', name: 'Coastal', path: ROAD, path_via: [ROAD[0], onFirstLeg(0.1), ROAD[1], ROAD[2]], stops: [
  { name: 'Town', lat: 12.05, lng: -61.75, order: 0 }, { name: 'True Blue', lat: 12.02, lng: -61.76, order: 1 }, { name: 'Grand Anse', lat: 12.0, lng: -61.78, order: 2 }] };
const roadStops = { stops: [
  { key: 'fixed:Town', name: 'Town', ...ROAD[0], along: 0, fixed: true, riders: [] },
  { key: 'pickup:user:cara', name: 'Pickup 1', ...onFirstLeg(0.2), along: 698, fixed: false, riders: [{ ref: 'cara', name: 'Cara Diaz', moved_m: 0 }] },
  { key: 'pickup:user:ann', name: 'Pickup 3', ...onFirstLeg(0.5), along: 1745, fixed: false, riders: [{ ref: 'ann', name: 'Ann Lee', moved_m: 0 }, { ref: 'ben', name: 'Ben Cole', moved_m: 66 }] },
  { key: 'fixed:True Blue', name: 'True Blue', ...ROAD[1], along: 3491, fixed: true, riders: [] },
  { key: 'fixed:Grand Anse', name: 'Grand Anse', ...ROAD[2], along: 6560, fixed: true, riders: [] },
], off_road: [{ ref: 'faye', name: 'Faye Far' }] };
const staff = [{ id: 'ann', full_name: 'Ann Lee', home_lat: 12.0349, home_lng: -61.7551 }, { id: 'ben', full_name: 'Ben Cole', skip_pickup_today: true }, { id: 'cara', full_name: 'Cara Diaz' }, { id: 'faye', full_name: 'Faye Far' }];

async function tablet(page, { bus = onFirstLeg(0.48) } = {}) {
  const calls = [];
  const live = { ...base, staff, route, road_stops: roadStops, vehicle: { ...vehicle, current_lat: bus.lat, current_lng: bus.lng, last_location_update: new Date().toISOString() } };
  await page.route('**/api/**', async (r) => {
    const url = r.request().url();
    const body = r.request().postDataJSON();
    if (url.includes('/functions/kioskHeartbeat')) return r.fulfill({ json: kiosk });
    if (url.includes('/functions/driverSession')) {
      if (body?.action === 'set_direction') { calls.push(body); live.vehicle.trip_direction=body.direction; return r.fulfill({json:{ok:true,direction:body.direction}}); }
      if (body?.action === 'verify_pin') return r.fulfill({ json: { ok: true, driver_grant: 'a'.repeat(64) } });
      if (['move_pickup', 'move_stop', 'add_stop'].includes(body?.action)) { calls.push(body); return r.fulfill({ json: { ok: true, moved: 2 } }); }
      return r.fulfill({ json: live });
    }
    if (url.includes('/entities/')) return r.fulfill({ status: 403, json: {} });
    return r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  await page.addInitScript(() => { localStorage.setItem('tt_driver_device_id', 'driver-test'); localStorage.setItem('tt-map-engine', 'basic'); });
  return calls;
}
const unlock = async (page) => {
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
};

test.use({ viewport: { width: 1280, height: 800 } });

test('the stop list follows the drawn road, with who meets at each pickup', async ({ page }) => {
  await tablet(page);
  await page.goto('/driver/stops');
  await unlock(page);
  const stops = page.getByRole('tabpanel').getByRole('listitem');
  await expect(stops.first()).toContainText('Town', { timeout: 15000 });
  await expect(stops).toHaveText([/Town/, /Pickup 1/, /Pickup 3/, /True Blue/, /Grand Anse/]);
  // The bus is between Pickup 1 and Pickup 3 on the road.
  await expect(stops.nth(1)).toContainText('Passed');
  await expect(stops.nth(2)).toContainText('Next stop');
  // Ben is skipping today, so only Ann is picked up at Pickup 3.
  await expect(page.getByLabel('Picking up Ann Lee', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Picking up Cara Diaz', { exact: true })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Pickup too far from this road: Faye Far');
  await shot(page, 'driver-road-stops');
});

test('move a pickup to where the bus is: confirm, and the passengers are told', async ({ page }) => {
  const calls = await tablet(page);
  await page.goto('/driver/stops');
  await unlock(page);
  await expect(page.getByText('where Ann Lee, Ben Cole get on')).toBeVisible({ timeout: 15000 });
  await shot(page, 'driver-move-pickup');
  await page.getByRole('button', { name: 'Move this pickup here' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Move Pickup 3 here?');
  await expect(dialog).toContainText('Ann Lee, Ben Cole will meet the bus here from now on. They get a message on their phone.');
  await dialog.getByRole('button', { name: 'Move pickup' }).click();
  await expect(page.getByText('Pickup 3 moved here. All 2 passengers have been told.')).toBeVisible();
  expect(calls).toEqual([{ action: 'move_pickup', stop_key: 'pickup:user:ann', device_id: 'driver-test', driver_grant: 'a'.repeat(64) }].map((c) => expect.objectContaining({ action: c.action, stop_key: c.stop_key })));
  expect(calls[0].lat).toBeUndefined();
});

test('off the drawn road, stops cannot be changed', async ({ page }) => {
  const calls = await tablet(page, { bus: { lat: 12.03, lng: -61.74 } });
  await page.goto('/driver/stops');
  await unlock(page);
  await expect(page.getByText(/m from this route's road\. Stops can only be changed on the road the bus drives \(within 50 m\)\./)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /Add a new stop here|Move this pickup here/ })).toHaveCount(0);
  expect(calls).toHaveLength(0);
});

test('directions follow the drawn road to the next pickup', async ({ page, context }) => {
  const fixture = JSON.parse(readFileSync('src/lib/__tests__/fixtures/route-short.json', 'utf8'));
  const start = onFirstLeg(0.02);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: start.lat, longitude: start.lng, accuracy: 5 });
  await tablet(page, { bus: start });
  const urls = [];
  await page.route('https://api.mapbox.com/**', async (r) => {
    if (r.request().url().includes('/directions/')) { urls.push(r.request().url()); return r.fulfill({ json: fixture }); }
    return r.fulfill({ status: 404, body: '' });
  });
  await page.goto('/driver/track');
  await unlock(page);
  await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  const navigate = page.getByRole('button', { name: 'Navigate', exact: true });
  await expect(navigate).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('nav-eta')).toContainText('of 5');
  await navigate.click();
  // Turn-by-turn requests only (the passenger list also asks for arrival times).
  const turnByTurn = () => urls.filter((u) => u.includes('steps=true'));
  await expect.poll(() => turnByTurn().length).toBeGreaterThan(0);
  // To the next stop, Pickup 1, through the point the road was drawn
  // through on the way (silent: only the start and the stop are stops).
  expect(turnByTurn()[0]).toMatch(/;-61\.751,12\.047;-61\.752,12\.044\?/);
  expect(turnByTurn()[0]).toContain('waypoints=0;2');
});

test('directions to a passenger stay in the app and lead to their pickup', async ({ page, context }) => {
  const fixture = JSON.parse(readFileSync('src/lib/__tests__/fixtures/route-short.json', 'utf8'));
  const start = onFirstLeg(0.02);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: start.lat, longitude: start.lng, accuracy: 5 });
  await tablet(page, { bus: start });
  const urls = [];
  await page.route('https://api.mapbox.com/**', async (r) => {
    if (r.request().url().includes('/directions/')) { urls.push(r.request().url()); return r.fulfill({ json: fixture }); }
    return r.fulfill({ status: 404, body: '' });
  });
  const popups = [];
  page.on('popup', (p) => popups.push(p.url()));
  await page.goto('/driver/passengers');
  await unlock(page);
  await page.getByRole('button', { name: 'Directions to Ann Lee' }).click({ timeout: 15000 });
  await expect(page).toHaveURL(/\/driver\/track$/);
  await expect(page.getByTestId('nav-banner')).toBeVisible({ timeout: 15000 });
  const turnByTurn = () => urls.filter((u) => u.includes('steps=true'));
  await expect.poll(() => turnByTurn().length).toBeGreaterThan(0);
  expect(turnByTurn().at(-1)).toContain('-61.7551,12.0349');
  expect(popups).toEqual([]);
  await page.getByRole('button', { name: 'End navigation' }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('tt_nav_target'))).toBeNull();
});

test('trip direction reverses the tablet stops and persists in the cached session',async({page})=>{
 const calls=await tablet(page);
 await page.goto('/driver/stops');await unlock(page);
 await page.getByRole('navigation',{name:'Driver sections'}).getByRole('button',{name:'Drive',exact:true}).click();
 await page.getByRole('button',{name:'To home',exact:true}).click();
 await expect(page.getByRole('button',{name:'To home',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Change stop',exact:true}).click();
 await expect(page.getByRole('tabpanel').getByRole('listitem')).toHaveText([/Grand Anse/,/True Blue/,/Pickup 3/,/Pickup 1/,/Town/]);
 expect(calls.some(c=>c.action==='set_direction'&&c.direction==='to_home'&&c.driver_grant)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tt_driver_session_cache')).session.vehicle.trip_direction)).toBe('to_home');
 await page.getByRole('navigation',{name:'Driver sections'}).getByRole('button',{name:'Drive',exact:true}).click();
 await page.getByRole('button',{name:'To work',exact:true}).click();
 await page.getByRole('button',{name:'Change stop',exact:true}).click();
 await expect(page.getByRole('tabpanel').getByRole('listitem').first()).toContainText('Town');
});
