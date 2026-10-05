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

test('driver can choose a returned route and its ETA updates', async ({ page, context }) => {
  const fixture = JSON.parse(readFileSync('src/lib/__tests__/fixtures/route-short.json', 'utf8'));
  const first = fixture.routes[0];
  const second = { ...first, duration: first.duration + 600,
    legs: first.legs.map((leg) => ({ ...leg, summary: 'Alternative test road',
      steps: leg.steps.map((step) => ({ ...step, duration: step.duration * 2 })) })) };
  const [lng, lat] = first.geometry.coordinates[0];
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: lat, longitude: lng, accuracy: 5 });
  await mockApi(page, [], { ...driver, route: { id: 'test-route', stops: [
    { name: 'Test destination', lat: 12.12, lng: -61.755, order: 0 },
  ] } });
  const urls = [];
  await page.route('https://api.mapbox.com/**', async (r) => {
    if (r.request().url().includes('/directions/')) {
      urls.push(r.request().url());
      return r.fulfill({ json: { routes: [first, second] } });
    }
    return r.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => {
    localStorage.setItem('tt_driver_device_id', 'driver-test');
    localStorage.setItem('tt-map-engine', 'basic');
  });
  await page.goto('/driver/track');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  const option = page.getByRole('button', { name: /Alternative test road/ });
  await expect(option).toBeVisible({ timeout: 20000 });
  expect(urls.some((u) => u.includes('alternatives=true'))).toBe(true);
  const before = await page.getByTestId('nav-eta').innerText();
  await option.click();
  await expect(option).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.getByTestId('nav-eta').innerText()).not.toBe(before);
});

test('boarding passengers display full-screen IDs in sequence',async({page})=>{
 let reads=0;
 const live={...driver};
 Object.defineProperty(live,'check_ins',{enumerable:true,get:()=> (++reads>1 ? [
  {id:'boarding-2',staff_name:'Second Passenger',status:'boarded',boarded_at:'2026-10-04T12:00:01Z',check_in_method:'nfc'},
  {id:'boarding-1',staff_name:'First Passenger',status:'boarded',boarded_at:'2026-10-04T12:00:00Z',check_in_method:'nfc'},
 ] : [])});
 await mockApi(page,[],live);
 await page.addInitScript(()=>localStorage.setItem('tt_driver_device_id','driver-test'));
 await page.goto('/driver/profile');
 await page.locator('input[type=password]').fill('1234');
 await page.getByRole('button',{name:'Unlock',exact:true}).click();
 const id=page.getByRole('dialog',{name:'Passenger boarding ID'});
 await expect(id).toBeVisible({timeout:25000});
 await expect(id).toContainText('First Passenger');
 await id.getByRole('button',{name:'Close',exact:true}).click();
 await expect(id).toContainText('Second Passenger');
 await expect(id).toBeHidden({timeout:9000});
});

test('driver tablet showcase keeps controls reachable in portrait and landscape',async({page})=>{
 await mockApi(page,[]);
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:404,body:''}));
 await page.addInitScript(()=>{
  localStorage.setItem('tt_driver_device_id','driver-test');
  localStorage.setItem('tt-map-engine','basic');
 });
 for(const size of [{width:1024,height:768},{width:390,height:844}]){
  await page.setViewportSize(size);
  await page.goto('/driver/track');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button',{name:'Unlock',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Driver sections'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Start tracking',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/tt-driver-${size.width}.png`});
 }
});

test('locked driver can request an admin PIN reset and stays locked',async({page})=>{
 await mockApi(page,[]);
 await page.addInitScript(()=>localStorage.setItem('tt_driver_device_id','driver-test'));
 let requests=0;
 await page.route('**/functions/driverSession',route=>{
  const body=route.request().postDataJSON();
  if(body.action==='request_pin_reset'){requests++;return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:driver});
 });
 await page.goto('/driver');
 await page.getByRole('button',{name:'Forgot PIN?',exact:true}).click();
 await page.getByRole('button',{name:'Request admin reset',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Reset request sent'})).toBeVisible();
 await expect(page.getByText('Driver PIN required',{exact:true})).toBeVisible();
 expect(requests).toBe(1);
 expect(await page.evaluate(()=>localStorage.getItem('tt_driver_unlock_date'))).toBeNull();
});

test('boarding tablet uses its saved card file after restart without a server lookup',async({page})=>{
 await mockApi(page,[]);
 let offline=false,lookups=0;
 const fingerprint=createHash('sha256').update('kiosk-test:AABBCCDD').digest('hex');
 await page.route('**/functions/kioskHeartbeat',route=>offline?route.abort():route.fulfill({json:kiosk}));
 await page.route('**/functions/kioskCheckIn',route=>{
  const body=route.request().postDataJSON();
  if(body.action==='lookup_tag')lookups++;
  if(offline)return route.abort();
  if(body.action==='offline_directory')return route.fulfill({json:{version:1,device_id:'kiosk-test',company_id:'company-a',vehicle_id:'bus-a',generated_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),directory_grant:'a'.repeat(64),staff:[{id:'rider',full_name:'Local Passenger',photo_url:'',card_fingerprint:fingerprint}]}});
  return route.fulfill({json:{}});
 });
 await page.addInitScript(()=>{
  localStorage.setItem('tt_kiosk_device_id','kiosk-test');
  localStorage.setItem('tt_badge_reader','1');
 });
 await page.goto('/kiosk');
 await expect(page.getByText(/Passenger list: 1 cards/)).toBeVisible();
 offline=true;
 await page.reload();
 await expect(page.getByText(/Passenger list: 1 cards/)).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tt-badge',{detail:'AABBCCDD'})));
 await expect(page.getByText('Local Passenger',{exact:true})).toBeVisible();
 expect(lookups).toBe(0);
 await page.getByRole('button',{name:/Boarding/}).click();
 await expect(page.getByText('Saved offline — will sync automatically',{exact:true})).toBeVisible();
 const queue=await page.evaluate(()=>JSON.parse(localStorage.getItem('tt_offline_checkins')));
 expect(queue[0].payload).toMatchObject({staff_id:'rider',method:'nfc',directory_grant:'a'.repeat(64),card_fingerprint:fingerprint});
 expect(JSON.stringify(queue)).not.toContain('AABBCCDD');
});

async function scannerBoarding(page) {
 await mockApi(page,[]);
 const fingerprint=createHash('sha256').update('kiosk-test:AABBCCDD').digest('hex');
 await page.route('**/functions/kioskCheckIn',r=>{
   const b=r.request().postDataJSON();
   if(b.action==='offline_directory')return r.fulfill({json:{version:1,device_id:'kiosk-test',company_id:'company-a',vehicle_id:'bus-a',generated_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),directory_grant:'a'.repeat(64),staff:[{id:'rider',full_name:'First Tap Passenger',photo_url:'',card_fingerprint:fingerprint}]}});
   return r.fulfill({status:500,json:{error:'Unexpected server lookup'}});
 });
 await page.addInitScript(()=>{
   localStorage.setItem('tt_kiosk_device_id','kiosk-test');
   localStorage.setItem('tt-map-engine','basic');
   localStorage.removeItem('tt_badge_reader');
 });
 await page.goto('/kiosk');
 await expect(page.getByText(/Passenger list: 1 cards/)).toBeVisible({timeout:20000});
}
test('first scanner tap works without a prior reader announcement',async({page})=>{
 await scannerBoarding(page);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tt-badge',{detail:'AABBCCDD'})));
 await expect(page.getByText('First Tap Passenger',{exact:true})).toBeVisible();
});
test('boarding drains wake taps once and reacquires its screen lock',async({page})=>{
 await page.addInitScript(()=>{
   window.wakeRequests=0;window.wakeLocks=[];
   Object.defineProperty(navigator,'wakeLock',{value:{request:async()=>{
     window.wakeRequests++;
     const lock=new EventTarget();lock.released=false;
     lock.release=async()=>{lock.released=true;lock.dispatchEvent(new Event('release'));};
     window.wakeLocks.push(lock);return lock;
   }}});
 });
 await scannerBoarding(page);
 await expect.poll(()=>page.evaluate(()=>window.wakeRequests)).toBeGreaterThan(0);
 await page.evaluate(async()=>{
   window.__ttBadgeInbox=[{uid:'AABBCCDD',id:'after-wake',at:Date.now()}];
   await window.wakeLocks.at(-1).release();
   window.dispatchEvent(new Event('pageshow'));
 });
 await expect(page.getByText('First Tap Passenger',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.wakeRequests)).toBe(2);
 expect(await page.evaluate(()=>window.__ttBadgeInbox)).toEqual([]);
 expect(await page.evaluate(()=>Object.values(localStorage).join(''))).not.toContain('AABBCCDD');
});
