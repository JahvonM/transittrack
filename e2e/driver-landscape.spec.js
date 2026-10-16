import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
      if (body?.action === 'my_documents') return route.fulfill(body.pin === '1234'
        ? { json: { ok: true, driver_name: 'Test Driver', documents: [
          { kind: 'license', document_number: 'DL-1', expiry_date: '2030-01-31', file_name: 'licence.png', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
          { kind: 'insurance', document_number: 'INS-9', expiry_date: '2020-01-31', file_name: 'cover.pdf', url: 'https://files.test/cover.pdf' }] } }
        : { status: 403, json: { error: 'Incorrect PIN' } });
      if (body?.action === 'verify_pin') return route.fulfill(body.pin === '1234' ? { json: { ok: true, driver_grant: "a".repeat(64) } } : { status: 403, json: { error: 'Incorrect PIN' } });
      return route.fulfill({ json: driverContext });
    }
    if (url.includes('/functions/appSupport')) return route.fulfill({ json: { whatsapp_number: '14735551234' } });
    if (url.includes('/entities/')) return route.fulfill({ status: 403, json: { error: 'Direct entity access blocked in test' } });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
}


async function openDriver(page,extra={}) {
 const context={...driver,company_name:'Real Company',...extra};
 await mockApi(page,[],context);
 await page.addInitScript(()=>{
  localStorage.setItem('tt_driver_device_id','driver-test');
  localStorage.setItem('tt-map-engine','basic');
  window.__watchCount=0;window.__clearCount=0;
  navigator.geolocation.watchPosition=()=>{window.__watchCount++;return window.__watchCount;};
  navigator.geolocation.clearWatch=()=>window.__clearCount++;
 });
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.goto('/driver/track');
 await page.locator('input[type=password]').fill('1234');
 await page.getByRole('button',{name:'Unlock',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your journey'})).toBeVisible();
 return context;
}
