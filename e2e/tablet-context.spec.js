import { test, expect } from '@playwright/test';

const vehicle = { id: 'bus-a', name: 'Bus A', company_id: 'company-a', capacity: 25, status: 'idle' };
const kiosk = { device_id: 'kiosk-test', paired: true, kiosk_type: 'bus_boarding', company_id: 'company-a', company_name: 'Company A', vehicle_id: 'bus-a', vehicle_name: 'Bus A', context: { vehicle, route: null, occupancy: 7, today_count: 12, ads: [] } };
const driver = { vehicle, driver_name: 'Test Driver', has_driver_pin: true, occupancy: 7, staff: [], check_ins: [], broadcasts: [], group_messages: [], trips: [], inspection_templates: [], recent_inspections: [], open_shift: null, emergency_contacts: { boss_phone: '5551234', secretary_phone: '' } };

async function mockApi(page, calls, driverContext=driver) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = request.url();
    calls.push(url);
    const body = request.postDataJSON();
    if (url.includes('/functions/kioskHeartbeat')) return route.fulfill({ json: kiosk });
    if (url.includes('/functions/kioskCheckIn')) return route.fulfill({ json: { staff: [], generated_at: new Date().toISOString() } });
    if (url.includes('/functions/driverSession')) {
      if (body?.action === 'verify_pin') return route.fulfill(body.pin === '1234' ? { json: { ok: true, driver_grant: "a".repeat(64) } } : { status: 403, json: { error: 'Incorrect PIN' } });
      return route.fulfill({ json: driverContext });
    }
    if (url.includes('/entities/')) return route.fulfill({ status: 403, json: { error: 'Direct entity access blocked in test' } });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
}

test('boarding kiosk renders backend context with entity access blocked', async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.addInitScript(() => {
    localStorage.setItem('tt_kiosk_device_id', 'kiosk-test');
    localStorage.setItem('tt_kiosk_directory', JSON.stringify({ staff: [{ id: 'old', full_name: 'Rider', nfc_tag: 'LEGACY_CREDENTIAL', access_code: 'LEGACY_CREDENTIAL' }] }));
  });
  await page.goto('/kiosk');
  await expect(page.getByText('Company A', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Bus A', { exact: true }).first()).toBeVisible();
  expect(calls.some((url) => /\/entities\/(Vehicle|Route|StaffCheckIn|Advertisement)/.test(url))).toBe(false);
  const cached = await page.evaluate(() => localStorage.getItem('tt_kiosk_directory'));
  expect(cached).not.toContain('LEGACY_CREDENTIAL');
});

test('driver verifies PIN through backend with entity access blocked', async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.addInitScript(() => {
    localStorage.setItem('tt_driver_device_id', 'driver-test');
    localStorage.setItem('tt_driver_unlock_date', new Date().toISOString().slice(0, 10));
  });
  await page.goto('/driver');
  await expect(page.getByText('Driver PIN required')).toBeVisible();
  await page.locator('input[type=password]').fill('0000');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByText(/Could not unlock/)).toBeVisible();
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByText('Driver PIN required')).toBeHidden();
  expect(calls.some((url) => /\/entities\/(Company|StaffCheckIn)/.test(url))).toBe(false);
  const saved = await page.evaluate(() => localStorage.getItem('tt_driver_session_cache'));
  expect(saved).not.toContain('"driver_pin"');
  expect(saved).not.toContain('"entry_code"');
});


test('unpairing a driver tablet preserves saved GPS with its original assignment',async({page})=>{
 await mockApi(page,[],{...driver,vehicle:null});
 await page.addInitScript(()=>{
  localStorage.setItem('tt_driver_device_id','driver-test');
  localStorage.setItem('tt_gps_queue',JSON.stringify([{queue_id:'retained-gps',state:'needs_review',lat:12,lng:-61,t:'2026-10-03T12:00:00Z',expected_device_id:'driver-test',expected_company_id:'company-a',expected_vehicle_id:'bus-a'}]));
 });
 await page.goto('/driver');
 await page.getByRole('button',{name:'Unpair tablet',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('tt_driver_device_id'))).toBeNull();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tt_gps_queue')))).toEqual([{queue_id:'retained-gps',state:'needs_review',lat:12,lng:-61,t:'2026-10-03T12:00:00Z',expected_device_id:'driver-test',expected_company_id:'company-a',expected_vehicle_id:'bus-a'}]);
});
