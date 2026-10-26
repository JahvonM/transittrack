import { test, expect } from '@playwright/test';

// The store app on a driver's own phone: the code from Admin links the phone
// to the driver, the phone asks which bus before the shift, then the bus PIN.

const busA = { id: 'bus-a', name: 'Bus 3', company_id: 'company-a', plate_number: 'P 3333', capacity: 25, status: 'idle', tracking_active: false };
const idle = { personal: true, vehicle: null, driver_name: 'Ana Joseph', company_id: 'company-a', company_name: 'Company A', company_logo_url: '' };
const onBus = { ...idle, vehicle: busA, has_driver_pin: true, staff: [], check_ins: [], broadcasts: [], group_messages: [], trips: [], inspection_templates: [], recent_inspections: [], open_shift: null, emergency_contacts: { boss_phone: '', secretary_phone: '' }, driver_unlocked: false };

async function mockApi(page, { busyAnswer = false } = {}) {
  const state = { bus: null, calls: [] };
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const body = route.request().postDataJSON();
    if (url.includes('/functions/pairKioskDevice')) {
      return route.fulfill({ json: { device_id: 'own-phone', device_token: 'b'.repeat(64), kiosk_type: 'driver', personal: true, vehicle_id: '', company_id: 'company-a', company_name: 'Company A', driver_name: 'Ana Joseph' } });
    }
    if (url.includes('/functions/driverSession')) {
      state.calls.push(body?.action);
      if (body?.action === 'list_buses') return route.fulfill({ json: { current: null, buses: [
        { id: 'bus-a', name: 'Bus 3', plate_number: 'P 3333', type: 'bus', busy: false },
        { id: 'bus-b', name: 'Bus 7', plate_number: 'P 7777', type: 'bus', busy: true },
      ] } });
      if (body?.action === 'choose_bus') {
        if (busyAnswer) return route.fulfill({ status: 409, json: { error: 'Bus 3 already has a driver on shift', code: 'BUS_BUSY' } });
        state.bus = body.vehicle_id;
        return route.fulfill({ json: { ok: true, vehicle: busA } });
      }
      if (body?.action === 'verify_pin') return route.fulfill(body.pin === '1234' ? { json: { ok: true, driver_grant: 'a'.repeat(64) } } : { status: 403, json: { error: 'Incorrect PIN' } });
      return route.fulfill({ json: state.bus ? onBus : idle });
    }
    if (url.includes('/entities/')) return route.fulfill({ status: 403, json: { error: 'Direct entity access blocked in test' } });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  return state;
}

test('a driver pairs their own phone, picks the bus, then enters that bus PIN', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/driver?code=PHONE1234567');
  await expect(page.getByRole('heading', { name: 'Which bus are you driving?' })).toBeVisible();
  await expect(page.getByText('Another driver is on shift')).toBeVisible();
  await expect(page.getByRole('button', { name: /Bus 7/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Bus 3/ }).click();
  await expect(page.getByText('Driver PIN required')).toBeVisible();
  expect(state.calls).toContain('choose_bus');
  expect(await page.evaluate(() => localStorage.getItem('tt_driver_device_id'))).toBe('own-phone');
});

test('a bus taken while choosing says so and keeps the list', async ({ page }) => {
  await mockApi(page, { busyAnswer: true });
  await page.addInitScript(() => {
    localStorage.setItem('tt_driver_device_id', 'own-phone');
    localStorage.setItem('tt_device_token_own-phone', 'b'.repeat(64));
  });
  await page.goto('/driver');
  await page.getByRole('button', { name: /Bus 3/ }).click();
  await expect(page.getByRole('alert')).toHaveText('Bus 3 already has a driver on shift');
  await expect(page.getByRole('heading', { name: 'Which bus are you driving?' })).toBeVisible();
});
