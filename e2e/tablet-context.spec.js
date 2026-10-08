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
    localStorage.setItem('tt_driver_unlock_date', '2000-01-01'); // unlocked on an earlier day, so the PIN is asked
  });
  await page.goto('/driver');
  await expect(page.getByText('Driver PIN required')).toBeVisible();
  await page.locator('input[type=password]').fill('0000');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByText(/Incorrect PIN/)).toBeVisible();
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
  await page.getByRole('button', { name: 'Navigate', exact: true }).click();
  const option = page.getByRole('button', { name: /Alternative test road/ });
  await expect(option).toBeVisible({ timeout: 20000 });
  expect(urls.some((u) => u.includes('alternatives=true'))).toBe(true);
  const before = await page.getByTestId('nav-eta').innerText();
  await option.click();
  await expect(option).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.getByTestId('nav-eta').innerText()).not.toBe(before);
});

test('driver map pins the stops and only gives directions after Navigate', async ({ page, context }) => {
  const fixture = JSON.parse(readFileSync('src/lib/__tests__/fixtures/route-short.json', 'utf8'));
  const [lng, lat] = fixture.routes[0].geometry.coordinates[0];
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: lat, longitude: lng, accuracy: 5 });
  await mockApi(page, [], { ...driver, route: { id: 'test-route', stops: [
    { name: 'First stop', lat: 12.12, lng: -61.755, order: 0 },
    { name: 'Second stop', lat: 12.13, lng: -61.75, order: 1 },
  ] } });
  const urls = [];
  await page.route('https://api.mapbox.com/**', async (r) => {
    if (r.request().url().includes('/directions/')) { urls.push(r.request().url()); return r.fulfill({ json: fixture }); }
    return r.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => {
    localStorage.setItem('tt_driver_device_id', 'driver-test');
    localStorage.setItem('tt-map-engine', 'basic');
  });
  await page.goto('/driver/track');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  const navigate = page.getByRole('button', { name: 'Navigate', exact: true });
  await expect(navigate).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('nav-eta')).toContainText('of 2');
  await expect(page.getByTestId('nav-banner')).toHaveCount(0);
  await page.waitForTimeout(2000);
  expect(urls).toEqual([]); // no directions until the driver asks
  await navigate.click();
  await expect(page.getByTestId('nav-banner')).toBeVisible();
  await expect.poll(() => urls.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'End navigation' }).click();
  await expect(page.getByTestId('nav-banner')).toHaveCount(0);
  await expect(navigate).toBeVisible();
});

test('tapping a GPS problem asks the helper to look for the USB GPS again', async ({ page }) => {
  await mockApi(page, [], driver);
  const rescans = [];
  await page.route('http://127.0.0.1:8765/**', (r) => { rescans.push(r.request().url()); return r.fulfill({ status: 204, body: '' }); });
  await page.addInitScript(() => {
    localStorage.setItem('tt_driver_device_id', 'driver-test');
    localStorage.setItem('tt-map-engine', 'basic');
    window.__ttHelperHealth = { at: Date.now(), version: '1.8', gps: 'Not plugged in' };
  });
  await page.goto('/driver/track');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  const gps = page.getByRole('button', { name: /GPS.*Tap to check again/ });
  await expect(gps).toBeVisible({ timeout: 20000 });
  await expect(gps).toContainText('GPS module: Not plugged in');
  await gps.click();
  await expect(page.getByText('Looking for the GPS again…').first()).toBeVisible();
  await expect.poll(() => rescans.length).toBe(1);
  expect(rescans[0]).toContain('/rescan-usb');
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
 for(const size of [{width:1280,height:800},{width:800,height:1280}]){
  await page.setViewportSize(size);
  await page.goto('/driver/track');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button',{name:'Unlock',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Driver sections'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Start tracking',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/tt-driver-${size.width}.png`});
  // The PIN is asked once a day; forget today's unlock so the next size starts at the PIN screen.
  await page.evaluate(()=>localStorage.removeItem('tt_driver_unlock_date'));
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
 await expect(page.getByText(/Passenger list: 1 card\b/)).toBeVisible();
 offline=true;
 await page.reload();
 await expect(page.getByText(/Passenger list: 1 card\b/)).toBeVisible();
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
 await expect(page.getByText(/Passenger list: 1 card\b/)).toBeVisible({timeout:20000});
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

test('completed card boarding returns to swipe screen with company banner',async({page})=>{
 await scannerBoarding(page);
 await page.route('**/functions/kioskCheckIn',r=>{
   const b=r.request().postDataJSON();
   if(b.action==='check_in')return r.fulfill({json:{record:{id:'boarding',staff_name:'First Tap Passenger',status:'boarded'},occupancy:8,today_count:13}});
   return r.fallback();
 });
 await expect(page.getByLabel('Company banner',{exact:true})).toContainText('Company A');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tt-badge',{detail:'AABBCCDD'})));
 await page.getByRole('button',{name:/Boarding/}).click();
 await expect(page.getByText(/Welcome/).first()).toBeVisible();
 await expect(page.getByText(/Slide to/).first()).toBeVisible({timeout:10000});
 await expect(page.getByLabel('Company banner',{exact:true})).toContainText('Company A');
});

test('completed code exit returns to swipe screen',async({page})=>{
 await scannerBoarding(page);
 await page.route('**/functions/kioskCheckIn',r=>{
   const b=r.request().postDataJSON();
   if(b.action==='lookup_code')return r.fulfill({json:{staff:{id:'rider',full_name:'Code Passenger'},next_status:'off_board',verification_grant:'b'.repeat(64)}});
   if(b.action==='check_in')return r.fulfill({json:{record:{id:'exit',staff_name:'Code Passenger',status:'off_board'},occupancy:6,today_count:12}});
   return r.fallback();
 });
 // A scanner tap also opens the keypad; cancel the card confirmation to enter a code.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tt-badge',{detail:'AABBCCDD'})));
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 for(const digit of ['1','2','3','4'])await page.getByRole('button',{name:digit,exact:true}).click();
 await page.getByRole('button',{name:'Submit code',exact:true}).click();
 await expect(page.getByText('Code Passenger',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Exiting',exact:true}).click();
 await expect(page.getByText('See you later, Code!')).toBeVisible();
 await expect(page.getByText('Slide to check in',{exact:true})).toBeVisible({timeout:10000});
});

test('driver login displays the scoped company banner',async({page})=>{
 await mockApi(page,[],{...driver,company_name:'Island Transit',company_logo_url:''});
 await page.addInitScript(()=>localStorage.setItem('tt_driver_device_id','driver-test'));
 await page.goto('/driver');
 await expect(page.getByLabel('Company banner',{exact:true})).toContainText('Island Transit');
 await expect(page.getByText('Driver PIN required')).toBeVisible();
});

test('driver keypad unlocks on the fourth digit with big keys and no tablet keyboard', async ({ page }) => {
  const calls = [];
  await mockApi(page, calls);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem('tt_driver_device_id', 'driver-test');
    localStorage.setItem('tt_driver_unlock_date', '2000-01-01'); // unlocked on an earlier day, so the PIN is asked
  });
  await page.goto('/driver');
  await expect(page.getByText('Driver PIN required')).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveAttribute('inputmode', 'none');
  const pad = page.getByRole('group', { name: 'Keypad' });
  const one = pad.getByRole('button', { name: '1', exact: true });
  // Keys scale with screen height (min 3.5rem) so the gate fits a 10.1" tablet.
  expect((await one.boundingBox()).height).toBeGreaterThanOrEqual(56);
  for (const d of '0000') await pad.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText(/Incorrect PIN/)).toBeVisible();
  for (const d of '1234') await pad.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText('Driver PIN required')).toBeHidden();
});

test('driver More has a WhatsApp button for app problems', async ({ page }) => {
  await mockApi(page, []);
  await page.addInitScript(() => localStorage.setItem('tt_driver_device_id', 'driver-test'));
  await page.goto('/driver/profile');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Report an app problem on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/14735551234\?text=.*driver%20tablet/);
});

test('driver opens their licence and insurance with the bus PIN, and nothing is kept', async ({ page }) => {
  await mockApi(page, []);
  await page.addInitScript(() => localStorage.setItem('tt_driver_device_id', 'driver-test'));
  await page.goto('/driver/profile');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.getByRole('button', { name: /My licence & insurance/ }).click();
  const viewer = page.getByRole('dialog', { name: 'My licence and insurance' });
  const keypad = viewer.getByRole('group', { name: 'Keypad' });
  for (const d of '0000') await keypad.getByRole('button', { name: d, exact: true }).click();
  await expect(viewer.getByText("That PIN isn't right.")).toBeVisible();
  for (const d of '1234') await keypad.getByRole('button', { name: d, exact: true }).click();
  await expect(viewer.getByRole('img', { name: "Driver's licence photo" })).toBeVisible();
  await expect(viewer.getByText(/^Expired .*2020$/)).toBeVisible();
  await expect(viewer.getByRole('link', { name: /Open insurance \(PDF\)/ })).toHaveAttribute('href', 'https://files.test/cover.pdf');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain('DL-1');
  expect(stored).not.toContain('files.test');
  await viewer.getByRole('button', { name: 'Close' }).click();
  await expect(viewer).toHaveCount(0);
});

test('driver stops show who is picked up where, the drop-off, and fix a stop from the bus position', async ({ page }) => {
  const calls = [];
  const route = { id: 'route-a', name: 'Coastal', stops: [
    { name: 'Town', lat: 12.05, lng: -61.75, order: 0 }, { name: 'True Blue', lat: 12.02, lng: -61.76, order: 1 }, { name: 'Grand Anse', lat: 12.0, lng: -61.78, order: 2 }] };
  const live = { ...driver,
    vehicle: { ...vehicle, route_id: 'route-a', current_lat: 12.0202, current_lng: -61.7601, last_location_update: new Date().toISOString(), tracking_active: false },
    route, workplace: { name: 'Head office', lat: 11.99, lng: -61.79 },
    staff: [{ id: 's1', full_name: 'Maria Joseph', home_lat: 12.021, home_lng: -61.761 }, { id: 's2', full_name: 'Zane Charles', home_lat: 12.0205, home_lng: -61.7605 }, { id: 's3', full_name: 'Ann Lee', home_lat: 12.001, home_lng: -61.781 }] };
  await page.route('**/api/**', async (r) => {
    const url = r.request().url();
    const body = r.request().postDataJSON();
    if (url.includes('/functions/driverSession')) {
      if (body?.action === 'verify_pin') return r.fulfill({ json: { ok: true, driver_grant: 'a'.repeat(64) } });
      if (body?.action === 'move_stop') { calls.push(body); return r.fulfill({ json: { ok: true, route } }); }
      return r.fulfill({ json: live });
    }
    if (url.includes('/entities/')) return r.fulfill({ status: 403, json: {} });
    return r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  await page.addInitScript(() => localStorage.setItem('tt_driver_device_id', 'driver-test'));
  await page.goto('/driver/stops');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByLabel('Picking up Maria Joseph, Zane Charles')).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Picking up Ann Lee')).toBeVisible();
  await expect(page.getByText('Drop-off · everyone gets off here')).toBeVisible();
  await page.getByRole('button', { name: 'Use this location for True Blue' }).click();
  await expect(page.getByText('True Blue now uses this location.')).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ action: 'move_stop', stop_name: 'True Blue' });
  expect(calls[0].lat).toBeUndefined();
});
