// Store screenshots for McSween Driver (docs/store-app.md), at the exact sizes
// each store asks for, with sample data on the west coast road (fixture.json).
//   npm run build:e2e && npx vite preview --port 4173 &
//   node tools/store-app/screenshots.mjs "$(cat tools/store-app/sizes.json)"
// Files go to /tmp/store/app-store and /tmp/store/google-play.
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://localhost:4173';
const fx = JSON.parse(fs.readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'));
const today = (h, m) => { const d = new Date(); d.setUTCHours(h + 4, m, 0, 0); return d.toISOString(); }; // Grenada = UTC-4
const company = { company_id: 'company-a', company_name: 'McSween Transport', company_logo_url: '/brand/icon-192.png' };
const bus = { id: 'bus-3', name: 'Bus 3', ...company, plate_number: 'H 3321', capacity: 25, status: 'on_trip', route_id: 'route-west',
  tracking_active: true, current_lat: fx.bus.lat, current_lng: fx.bus.lng, speed: 11.4, heading: fx.heading, last_location_update: new Date().toISOString(), trip_direction: 'to_work' };
const route = { id: 'route-west', name: "West coast: Gouyave to St. George's", company_id: 'company-a', path: fx.path, stops: fx.fixed };
const boarded = ['nia', 'ryan', 'lisa', 'kerry', 'devon', 'shanice', 'marlon'];
const check_ins = boarded.map((id, i) => { const s = fx.staff.find((x) => x.id === id); return { id: 'ci' + i, staff_id: id, staff_name: s.full_name, status: 'boarded', boarded_at: today(6, 44 + i * 4), check_in_method: i % 2 ? 'qr' : 'nfc', vehicle_id: 'bus-3' }; });
const msg = (i, role, name, text, h, m) => ({ id: 'm' + i, channel: 'dispatch', sender_role: role, sender_name: name, text, created_date: today(h, m), vehicle_id: 'bus-3', company_id: 'company-a' });
const group_messages = [
  msg(1, 'admin', 'Dispatch', 'Morning Ana, Bus 3 is yours today. Usual west coast run.', 6, 31),
  msg(2, 'driver', 'Ana Joseph', 'Thanks! Leaving Gouyave now.', 6, 40),
  msg(3, 'admin', 'Dispatch', 'Tricia Noel will wait at the shelter by Pickup 4 today, not her gate.', 7, 2),
  msg(4, 'driver', 'Ana Joseph', 'Got it, 5 minutes away.', 7, 4),
];
const onBus = { personal: true, driver_name: 'Ana Joseph', ...company, vehicle: bus, route, road_stops: { stops: fx.stops, off_road: [] },
  workplace: { name: "St. George's", lat: 12.0546, lng: -61.7519 }, staff: fx.staff, occupancy: 7, total_staff: fx.staff.length, check_ins,
  broadcasts: [], group_messages, trips: [], inspection_templates: [], recent_inspections: [], open_shift: { id: 'shift', started_at: today(6, 38), vehicle_id: 'bus-3' },
  emergency_contacts: { boss_phone: '4734400000', secretary_phone: '' }, has_driver_pin: true, driver_unlocked: true };
const idle = { personal: true, vehicle: null, driver_name: 'Ana Joseph', ...company };
const buses = [
  { id: 'bus-3', name: 'Bus 3', plate_number: 'H 3321', type: 'bus', busy: false },
  { id: 'bus-5', name: 'Bus 5', plate_number: 'H 5150', type: 'bus', busy: false },
  { id: 'bus-12', name: 'Coaster 12', plate_number: 'H 1212', type: 'bus', busy: false },
  { id: 'bus-7', name: 'Bus 7', plate_number: 'H 7007', type: 'bus', busy: true },
];
async function mock(page, state) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    let body = null; try { body = route.request().postDataJSON(); } catch {}
    if (url.includes('/functions/driverSession')) {
      const a = body?.action;
      if (a === 'list_buses') return route.fulfill({ json: { buses, current: state.bus } });
      if (a === 'choose_bus') { state.bus = body.vehicle_id; return route.fulfill({ json: { ok: true, vehicle: bus } }); }
      if (a === 'verify_pin') return route.fulfill({ json: { ok: true, driver_grant: 'a'.repeat(64) } });
      if (a && a !== 'heartbeat') return route.fulfill({ json: { ok: true, group_messages: state.bus ? group_messages : [] } });
      return route.fulfill({ json: state.bus ? onBus : idle });
    }
    if (url.includes('/functions/appSupport')) return route.fulfill({ json: { whatsapp_number: '14735551234' } });
    if (url.includes('/entities/')) return route.fulfill({ status: 403, json: { error: 'blocked' } });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
}
const sizes = JSON.parse(process.argv[2]);
const only = process.argv[3] ? process.argv[3].split(',') : null;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, hasTouch: true, isMobile: s.w < 900,
    timezoneId: 'America/Grenada', locale: 'en-US', geolocation: { latitude: fx.bus.lat, longitude: fx.bus.lng, accuracy: 6 }, permissions: ['geolocation'] });
  const out = (k) => `/tmp/store/${s.dir}/${s.name}-${k}.${s.ext || 'jpg'}`;
  fs.mkdirSync(`/tmp/store/${s.dir}`, { recursive: true });
  const shot = async (page, k) => { if (only && !only.includes(k)) return; await page.waitForTimeout(s.wait || 3500); await page.screenshot({ path: out(k), type: 'jpeg', quality: 92 }); console.log('saved', out(k)); };
  // Pick a bus (own phone, no bus yet)
  { const page = await ctx.newPage(); const state = { bus: null }; await mock(page, state);
    await page.addInitScript(() => { localStorage.setItem('tt_driver_device_id', 'own-phone'); localStorage.setItem('tt_device_token_own-phone', 'b'.repeat(64)); });
    await page.goto(BASE + '/driver'); await page.getByRole('heading', { name: 'Which bus are you driving?' }).waitFor(); await shot(page, '2-pick-bus'); await page.close(); }
  // On the bus, shift open, sharing location
  { const page = await ctx.newPage(); const state = { bus: 'bus-3' }; await mock(page, state);
    await page.addInitScript(() => { localStorage.setItem('tt_driver_device_id', 'own-phone'); localStorage.setItem('tt_device_token_own-phone', 'b'.repeat(64)); });
    await page.goto(BASE + '/driver/track');
    await page.locator('input[type=password]').fill('1234'); await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await page.waitForTimeout(1500);
    if (await page.getByRole('button', { name: /Skip|Later|Not now/i }).count()) await page.getByRole('button', { name: /Skip|Later|Not now/i }).first().click().catch(() => {});
    await page.goto(BASE + '/driver/track'); await shot(page, '1-drive');
    await page.goto(BASE + '/driver/stops'); await shot(page, '3-stops');
    await page.goto(BASE + '/driver/passengers'); await shot(page, '4-passengers');
    await page.goto(BASE + '/driver/chat'); await page.waitForTimeout(800);
    await page.getByText('Dispatch', { exact: true }).first().click().catch((e) => console.log('dispatch click', e.message.split('\n')[0]));
    await page.waitForTimeout(600);
    await shot(page, '5-messages');
    await page.close(); }
  await ctx.close();
}
await browser.close();
