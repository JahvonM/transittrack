import { test, expect } from '@playwright/test';

// When Base44 is busy it refuses calls with "Too many requests" (429) or a
// server error. The tablets used to show "Offline" every time that happened
// and flick back a check-in later, though their Wi-Fi was fine. A busy server
// still answered, so only a request with no answer at all means offline.
// The driver tablet also asks for the slow-changing parts (passenger list,
// road stops, inspection forms) only once a minute, keeping what it has.

const TOKEN = 'a'.repeat(64);

test.describe('boarding tablet', () => {
  const device = { device_id: 'tab-1', paired: true, status: 'active', kiosk_type: 'bus_boarding', company_id: 'a', company_name: 'Spice Isle Tours',
    vehicle_id: 'bus-a', vehicle_name: 'Bus 12', context: { vehicle: { id: 'bus-a', name: 'Bus 12', capacity: 30 }, route: { stops: [] }, ads: [], occupancy: 0, today_count: 0 } };

  test('a busy server is not "Offline"; no answer at all is', async ({ page }) => {
    let reply = 'ok', beats = 0;
    await page.addInitScript((TOKEN) => { localStorage.setItem('tt_kiosk_device_id', 'tab-1'); localStorage.setItem('tt_device_token_tab-1', TOKEN); }, TOKEN);
    await page.route('https://api.mapbox.com/**', (r) => r.fulfill({ status: 404, body: '' }));
    await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: {} }));
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/functions/kioskHeartbeat')) {
        beats++;
        if (reply === 'busy') return route.fulfill({ status: 429, json: { error: 'Server is busy. Please try again shortly.' } });
        if (reply === 'error') return route.fulfill({ status: 500, json: { error: 'Something went wrong. Please try again.' } });
        if (reply === 'down') return route.abort('internetdisconnected');
        return route.fulfill({ json: device });
      }
      if (url.includes('/functions/kioskCheckIn')) return route.fulfill({ json: { staff: [] } });
      return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
    });
    await page.clock.install();
    await page.goto('/kiosk');
    await expect(page.getByText('Slide to enter a code', { exact: true })).toBeVisible();
    const offline = page.getByText(/^Offline —/);

    for (const kind of ['busy', 'error']) {
      reply = kind;
      const before = beats;
      await page.clock.fastForward(37000);
      await expect.poll(() => beats).toBeGreaterThan(before);
      await page.waitForTimeout(300);
      await expect(offline).toHaveCount(0);
    }

    reply = 'down';
    // Past the app's short pause after a "busy" answer, then a check-in that never gets through.
    for (let i = 0; i < 4 && !(await offline.count()); i++) { await page.clock.fastForward(37000); await page.waitForTimeout(300); }
    await expect(offline).toBeVisible();
  });
});

test.describe('driver tablet', () => {
  const kiosk = { id: 'driver-test', kiosk_type: 'driver', vehicle_id: 'bus-a', company_id: 'company-a', company_name: 'Company A', status: 'active', paired: true };
  const vehicle = { id: 'bus-a', name: 'Bus A', company_id: 'company-a', capacity: 25, status: 'idle', tracking_active: false };
  const fast = { vehicle, driver_name: 'Kofi', occupancy: 0, check_ins: [], broadcasts: [], group_messages: [], trips: [], open_shift: null };
  const slow = { has_driver_pin: true, company_name: 'Company A', inspection_templates: [], recent_inspections: [], emergency_contacts: { boss_phone: '', secretary_phone: '' },
    route: null, road_stops: null, staff: [{ id: 'ann', full_name: 'Ann Lee' }, { id: 'cara', full_name: 'Cara Diaz' }] };

  test('busy server: no "Offline", and the passenger list stays between full check-ins', async ({ page }) => {
    let reply = 'ok';
    const beats = [];
    await page.route('**/api/**', async (r) => {
      const url = r.request().url();
      const body = r.request().postDataJSON();
      if (url.includes('/functions/kioskHeartbeat')) return r.fulfill({ json: kiosk });
      if (url.includes('/functions/driverSession')) {
        if (body?.action === 'verify_pin') return r.fulfill({ json: { ok: true, driver_grant: 'b'.repeat(64) } });
        if (body?.action !== 'heartbeat') return r.fulfill({ json: { ok: true } });
        beats.push(body.light === true ? 'light' : 'full');
        if (reply === 'busy') return r.fulfill({ status: 429, json: { error: 'Server is busy.' } });
        if (reply === 'down') return r.abort('internetdisconnected');
        return r.fulfill({ json: body.light ? { ...fast, light: true } : { ...fast, ...slow } });
      }
      if (url.includes('/entities/')) return r.fulfill({ status: 403, json: {} });
      return r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
    });
    await page.addInitScript(() => { localStorage.setItem('tt_driver_device_id', 'driver-test'); localStorage.setItem('tt-map-engine', 'basic'); });
    await page.clock.install();
    await page.goto('/driver/passengers');
    await page.locator('input[type=password]').fill('1234');
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.getByText('Ann Lee').filter({ visible: true }).first()).toBeVisible({ timeout: 15000 });
    // Opening the app, then unlocking, each ask for everything straight away.
    await expect.poll(() => beats.length).toBeGreaterThanOrEqual(2);
    expect(beats.every((b) => b === 'full')).toBe(true);

    // The next check-ins are light, and the list is kept.
    const before = beats.length;
    await page.clock.fastForward(19000);
    await expect.poll(() => beats.length).toBeGreaterThan(before);
    expect(beats.at(-1)).toBe('light');
    await page.waitForTimeout(300);
    await expect(page.getByText('Ann Lee').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('Cara Diaz').filter({ visible: true }).first()).toBeVisible();

    // A minute on, a full one again.
    for (let i = 0; i < 4; i++) { await page.clock.fastForward(19000); await page.waitForTimeout(200); }
    expect(beats.slice(before)).toContain('full');

    // Busy: still online.
    const status = page.getByRole('status').filter({ hasText: /^\s*Offline\s*$/ });
    reply = 'busy';
    const busyFrom = beats.length;
    await page.clock.fastForward(19000);
    await expect.poll(() => beats.length).toBeGreaterThan(busyFrom);
    await page.waitForTimeout(300);
    await expect(status).toHaveCount(0);

    // No answer at all: offline.
    reply = 'down';
    for (let i = 0; i < 4 && !(await status.count()); i++) { await page.clock.fastForward(19000); await page.waitForTimeout(300); }
    await expect(status).toBeVisible();
  });
});
