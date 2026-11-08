import { test, expect } from '@playwright/test';

// A bus's own driver tablet moved to another bus: "Switch bus" on the PIN
// screen, pick the bus, enter THAT bus's PIN. The old bus's PIN is never
// asked for, so a tablet whose bus was removed isn't stuck.

const bus3 = { id: 'bus-3', name: 'Bus 3', company_id: 'company-a', plate_number: 'P 3333', capacity: 25, status: 'idle', tracking_active: false };
const bus7 = { id: 'bus-7', name: 'Bus 7', company_id: 'company-a', plate_number: 'P 7777', capacity: 25, status: 'idle', tracking_active: false };
const session = (vehicle, unlocked = false) => ({
  vehicle, driver_name: 'Test Driver', has_driver_pin: true, company_id: 'company-a', company_name: 'Company A', company_logo_url: '',
  staff: [], check_ins: [], broadcasts: [], group_messages: [], trips: [], inspection_templates: [], recent_inspections: [], open_shift: null,
  emergency_contacts: { boss_phone: '', secretary_phone: '' }, driver_unlocked: unlocked,
});
const GRANT = 'c'.repeat(64);

async function mockApi(page, { gone = false, shiftOpen = '', bus = bus3 } = {}) {
  const state = { bus: gone ? null : bus, unlocked: false, calls: [] };
  await page.route('https://api.mapbox.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const body = route.request().postDataJSON();
    if (url.includes('/functions/driverSession')) {
      state.calls.push({ action: body?.action, vehicle_id: body?.vehicle_id, pin: body?.pin });
      if (body?.action === 'list_buses') return route.fulfill({ json: { current: 'bus-3', ...(shiftOpen ? { shift_open: shiftOpen } : {}), buses: [
        { id: 'bus-3', name: 'Bus 3', plate_number: 'P 3333', type: 'bus', busy: false },
        { id: 'bus-7', name: 'Bus 7', plate_number: 'P 7777', type: 'bus', busy: false },
        { id: 'bus-9', name: 'Bus 9', plate_number: 'P 9999', type: 'bus', busy: true },
      ] } });
      if (body?.action === 'switch_bus') {
        if (body.pin !== '7777') return route.fulfill({ status: 403, json: { error: 'Incorrect PIN for Bus 7' } });
        state.bus = bus7; state.unlocked = true;
        return route.fulfill({ json: { ok: true, vehicle: bus7, driver_name: 'Test Driver', driver_grant: GRANT } });
      }
      if (body?.action === 'verify_pin') return route.fulfill(state.bus && body.pin === '3333' ? { json: { ok: true, driver_grant: 'a'.repeat(64) } } : { status: 403, json: { error: 'Incorrect PIN' } });
      if (body?.action === 'heartbeat') {
        if (!state.bus) return route.fulfill({ status: 404, json: { error: 'Vehicle not found', code: 'BUS_GONE' } });
        return route.fulfill({ json: session(state.bus, state.unlocked && body.driver_grant === GRANT) });
      }
      return route.fulfill({ json: { ok: true } });
    }
    if (url.includes('/entities/')) return route.fulfill({ status: 403, json: { error: 'Direct entity access blocked in test' } });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  await page.addInitScript(() => {
    localStorage.setItem('tt_driver_device_id', 'tablet-1');
    localStorage.setItem('tt_device_token_tablet-1', 'b'.repeat(64));
    localStorage.setItem('tt-map-engine', 'basic');
  });
  return state;
}

const keypad = (page) => page.getByRole('group', { name: 'Keypad' });
async function typePin(page, pin) { for (const d of pin) await keypad(page).getByRole('button', { name: d, exact: true }).click(); }

test('Switch bus on the PIN screen asks only for the new bus PIN and opens on that bus', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/driver');
  await expect(page.getByText('Enter the 4-digit PIN for Bus 3 to begin your shift.')).toBeVisible();
  await page.getByRole('button', { name: 'Switch bus' }).click();

  await expect(page.getByRole('heading', { name: 'Switch bus' })).toBeVisible();
  await expect(page.getByText('This tablet is on this bus now')).toBeVisible();
  await expect(page.getByText('Another driver is on shift')).toBeVisible();
  await expect(page.getByRole('button', { name: /Bus 3/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Bus 9/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Bus 7/ }).click();

  await expect(page.getByText('Enter the 4-digit PIN for Bus 7 to begin your shift.')).toBeVisible();
  // Only the new bus's code: no "Forgot PIN?" for the old bus here.
  await expect(page.getByRole('button', { name: 'Forgot PIN?' })).toHaveCount(0);
  await typePin(page, '1234');
  await expect(page.getByRole('alert')).toHaveText('Incorrect PIN for Bus 7');
  await typePin(page, '7777');

  await expect(page.getByText('This tablet is now on Bus 7').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your journey' })).toBeVisible();
  await expect(page.getByText('Driver PIN required')).toHaveCount(0);
  expect(state.calls.filter((c) => c.action === 'switch_bus').map((c) => c.vehicle_id)).toEqual(['bus-7', 'bus-7']);
  expect(state.calls.some((c) => c.action === 'verify_pin')).toBe(false);
  const saved = await page.evaluate(() => ({
    grant: localStorage.getItem('tt_driver_grant_tablet-1'),
    bus: localStorage.getItem('tt_driver_bus_tablet-1'),
    pin: !!localStorage.getItem('tt_driver_pin_check_tablet-1'),
  }));
  expect(saved).toEqual({ grant: GRANT, bus: 'bus-7', pin: true });
});

test('Back returns to the PIN screen of the bus the tablet is on', async ({ page }) => {
  await mockApi(page);
  await page.goto('/driver');
  await page.getByRole('button', { name: 'Switch bus' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('Enter the 4-digit PIN for Bus 3 to begin your shift.')).toBeVisible();
});

test('a tablet whose bus was removed offers Switch bus instead of a dead end', async ({ page }) => {
  await mockApi(page, { gone: true });
  // The tablet still remembers the removed bus from its last check-in.
  await page.addInitScript((cached) => localStorage.setItem('tt_driver_session_cache', JSON.stringify({ device_id: 'tablet-1', session: cached })), session(bus3));
  await page.goto('/driver');
  await expect(page.getByRole('heading', { name: "This tablet's bus was removed" })).toBeVisible();
  await expect(page.getByRole('button', { name: /Unpair this tablet/ })).toBeVisible();
  await page.getByRole('button', { name: /Bus 7/ }).click();
  await typePin(page, '7777');
  await expect(page.getByRole('heading', { name: 'Your journey' })).toBeVisible();
});

test('a driver on shift is told to end it before switching', async ({ page }) => {
  await mockApi(page, { shiftOpen: 'End the shift on Bus 3 before switching bus' });
  await page.goto('/driver');
  await page.getByRole('button', { name: 'Switch bus' }).click();
  await expect(page.getByRole('alert')).toHaveText('End the shift on Bus 3 before switching bus.');
  await expect(page.getByRole('button', { name: /Bus 7/ })).toBeDisabled();
});

test('moved to another bus in Admin: the tablet locks and asks for the new bus PIN', async ({ page }) => {
  await mockApi(page, { bus: bus7 });
  // Unlocked on Bus 3 earlier today, with Bus 3's PIN saved for offline use.
  await page.addInitScript((cached) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    localStorage.setItem('tt_driver_session_cache', JSON.stringify({ device_id: 'tablet-1', session: cached }));
    localStorage.setItem('tt_driver_bus_tablet-1', 'bus-3');
    localStorage.setItem('tt_driver_unlock_date', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    localStorage.setItem('tt_driver_grant_tablet-1', 'a'.repeat(64));
    localStorage.setItem('tt_driver_pin_check_tablet-1', JSON.stringify({ salt: '00', hash: 'old' }));
  }, session(bus3, true));
  await page.goto('/driver');
  await expect(page.getByText('Enter the 4-digit PIN for Bus 7 to begin your shift.')).toBeVisible();
  const left = await page.evaluate(() => ({
    grant: localStorage.getItem('tt_driver_grant_tablet-1'),
    pin: localStorage.getItem('tt_driver_pin_check_tablet-1'),
    bus: localStorage.getItem('tt_driver_bus_tablet-1'),
  }));
  expect(left).toEqual({ grant: null, pin: null, bus: 'bus-7' });
});
