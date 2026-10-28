import { test, expect } from '@playwright/test';

// Jobs: dispatch gives a bus an airport run in Admin → Jobs, and the bus's
// driver tablet tells the driver, shows the job and records the pickup
// signature with the number of guests.

const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

test('dispatch creates an airport pickup and the day board shows it', async ({ page }) => {
  const created = [];
  const bus = { id: 'bus', name: 'Bus 12', company_id: 'a', company_name: 'Island Transit Co.', driver_name: 'Kofi', status: 'idle', type: 'bus', capacity: 30 };
  const places = [
    { id: 'airport', name: 'Maurice Bishop Airport', kind: 'airport', address: 'Point Salines', lat: 12.004, lng: -61.786 },
    { id: 'hotel', name: 'Grand Hotel', kind: 'hotel', address: 'Grand Anse', lat: 12.03, lng: -61.76 },
  ];
  const clients = [{ id: 'c1', name: 'Grand Hotel Group', kind: 'hotel', currency: 'USD' }];
  await page.addInitScript(() => { localStorage.setItem('base44_access_token', 'isolated-test-session'); localStorage.setItem('tt-map-engine', 'basic'); });
  await page.route('https://api.mapbox.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/api/**', (r) => {
    const body = r.request().postDataJSON(), url = r.request().url();
    if (url.includes('/functions/entityAccess')) {
      if (body.entity === 'User') return r.fulfill({ json: { result: { id: 'admin-test', role: 'admin', full_name: 'Test Admin' } } });
      if (body.entity === 'AdminBootstrap') {
        const lists = { vehicles: [bus], places, clients, trips: created, completedTrips: [], routes: [{ id: "staff-route", name: "Staff morning route", stops: [{ name: "Staff-only stop", lat: 12.04, lng: -61.75 }] }] };
        return r.fulfill({ json: { result: { datasets: Object.fromEntries(body.datasets.map((k) => [k, lists[k] || []])), errors: {} } } });
      }
      if (body.entity === 'Trip' && body.operation === 'create') {
        const row = { id: 'job-1', ...body.data };
        created.push(row);
        return r.fulfill({ json: { result: row } });
      }
      return r.fulfill({ json: { result: [] } });
    }
    return r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });

  await page.goto('/admin/trips');
  await expect(page.getByRole('region', { name: 'Bus 12' })).toBeVisible();
  await page.getByRole('button', { name: 'New job', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Airport pickup' })).toHaveAttribute('aria-pressed', 'true');
  // The airport is filled in as the pickup.
  await expect(dialog.getByText('Maurice Bishop Airport', { exact: true })).toBeVisible();
  // Staff route stops must not appear in either job location selector.
  await dialog.getByRole('button', { name: 'Transfer', exact: true }).click();
  await dialog.getByRole('button', { name: 'Change pickup', exact: true }).click();
  await dialog.getByLabel('Pickup', { exact: true }).click();
  await expect(page.getByRole('option')).toHaveText(['Grand Hotel', 'Maurice Bishop Airport · Airport']);
  await page.getByRole('option', { name: 'Maurice Bishop Airport · Airport', exact: true }).click();
  await dialog.getByRole('button', { name: 'Airport pickup', exact: true }).click();
  await dialog.getByLabel('Client', { exact: true }).click();
  await page.getByRole('option', { name: 'Grand Hotel Group' }).click();
  await dialog.getByLabel('Bus and driver', { exact: true }).click();
  await page.getByRole('option', { name: 'Bus 12 · Kofi' }).click();
  await dialog.getByLabel('Drop-off', { exact: true }).click();
  await expect(page.getByRole('option')).toHaveText(['Grand Hotel', 'Maurice Bishop Airport · Airport']);
  await page.getByRole('option', { name: 'Grand Hotel', exact: true }).click();
  await dialog.getByLabel('Flight number').fill('aa 1234');
  await dialog.getByLabel('Guests').fill('3');
  await dialog.getByLabel('Price').fill('45');
  await dialog.getByRole('button', { name: 'Create job', exact: true }).click();

  await expect.poll(() => created.length).toBe(1);
  expect(created[0]).toMatchObject({
    job_type: 'airport_pickup', vehicle_id: 'bus', company_id: 'a', client_id: 'c1', status: 'scheduled',
    pickup_name: 'Maurice Bishop Airport', dropoff_name: 'Grand Hotel', flight_number: 'AA 1234', guests: 3, price: 45, currency: 'USD',
  });
  expect(created[0].scheduled_time.startsWith(new Date(`${today()}T09:00`).toISOString().slice(0, 13))).toBe(true);
  const lane = page.getByRole('region', { name: 'Bus 12' });
  await expect(lane.getByText('Maurice Bishop Airport', { exact: false })).toBeVisible();
  await expect(lane.getByText('Flight AA 1234', { exact: false })).toBeVisible();
});

test('the driver tablet alerts a new job and records the pickup signature with the guest count', async ({ page }) => {
  const job = {
    id: 'job-1', job_type: 'airport_pickup', status: 'scheduled', vehicle_id: 'bus-a', vehicle_name: 'Bus A', company_id: 'company-a',
    pickup_name: 'Maurice Bishop Airport', pickup_lat: 12.004, pickup_lng: -61.786, dropoff_name: 'Grand Hotel', dropoff_lat: 12.03, dropoff_lng: -61.76,
    scheduled_time: new Date(Date.now() + 3600_000).toISOString(), flight_number: 'AA 1234', guests: 3, passenger_name: 'Mr Smith', notes: 'Hold a name sign', stops: [],
  };
  const kiosk = { id: 'driver-test', kiosk_type: 'driver', vehicle_id: 'bus-a', company_id: 'company-a', company_name: 'Company A', status: 'active', paired: true };
  const vehicle = { id: 'bus-a', name: 'Bus A', company_id: 'company-a', capacity: 25, status: 'idle', tracking_active: false };
  let trips = [];
  const steps = [];
  await page.route('**/api/**', async (r) => {
    const url = r.request().url();
    const body = r.request().postDataJSON();
    if (url.includes('/functions/kioskHeartbeat')) return r.fulfill({ json: kiosk });
    if (url.includes('/functions/driverSession')) {
      if (body?.action === 'verify_pin') return r.fulfill({ json: { ok: true, driver_grant: 'b'.repeat(64) } });
      if (body?.action === 'heartbeat') return r.fulfill({ json: { vehicle, driver_name: 'Kofi', occupancy: 0, check_ins: [], broadcasts: [], group_messages: [], trips, driver_unlocked: true, open_shift: null, staff: [], has_driver_pin: true, company_name: 'Company A' } });
      if (['update_trip_status', 'sign_trip'].includes(body?.action)) {
        steps.push(body);
        const patch = body.action === 'update_trip_status' ? { status: body.status, started_at: new Date().toISOString() } : { pickup_signed_at: new Date().toISOString(), pickup_signed_by: body.signed_by };
        trips = trips.map((t) => (t.id === body.trip_id ? { ...t, ...patch } : t));
        return r.fulfill({ json: { trip: trips.find((t) => t.id === body.trip_id) } });
      }
      return r.fulfill({ json: { ok: true } });
    }
    if (url.includes('/entities/')) return r.fulfill({ status: 403, json: {} });
    return r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  await page.route('https://api.mapbox.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.addInitScript(() => { localStorage.setItem('tt_driver_device_id', 'driver-test'); localStorage.setItem('tt-map-engine', 'basic'); });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 12.0045, longitude: -61.7865 });
  await page.clock.install();
  await page.goto('/driver/trips');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByText('No jobs for this bus.', { exact: true })).toBeVisible({ timeout: 15000 });

  // Dispatch gives the bus a job: the next check-in brings it and an alert.
  trips = [job];
  await page.clock.fastForward(20000);
  const alert = page.getByRole('alertdialog', { name: 'New job' });
  await expect(alert).toBeVisible();
  await expect(alert.getByText('Flight AA 1234', { exact: true })).toBeVisible();
  await expect(alert.getByText('Hold a name sign', { exact: true })).toBeVisible();
  await alert.getByRole('button', { name: 'Open jobs', exact: true }).click();

  await page.getByRole('button', { name: 'Start job', exact: true }).click();
  await expect.poll(() => steps.map((s) => s.action)).toEqual(['update_trip_status']);
  await page.getByRole('button', { name: 'Confirm pickup — signature', exact: true }).click();
  const sign = page.getByRole('dialog');
  // At the airport the guest signs.
  await expect(sign.getByRole('button', { name: 'Guest' })).toHaveAttribute('aria-pressed', 'true');
  await sign.getByLabel("Guest's name").fill('Mr Smith');
  await expect(sign.getByLabel('Number of guests')).toHaveValue('3');
  await sign.getByLabel('Number of guests').fill('4');
  const pad = await sign.locator('canvas').boundingBox();
  await page.mouse.move(pad.x + 20, pad.y + 20);
  await page.mouse.down();
  await page.mouse.move(pad.x + 120, pad.y + 60, { steps: 5 });
  await page.mouse.up();
  await sign.getByRole('button', { name: 'Confirm signature', exact: true }).click();
  await expect.poll(() => steps.length).toBe(2);
  expect(steps[1]).toMatchObject({ action: 'sign_trip', trip_id: 'job-1', mode: 'pickup', signed_by: 'Mr Smith', guests: 4, mime_type: 'image/png', signed_role: 'guest' });
  expect(steps[1].lat).toBeCloseTo(12.0045, 3);
  expect(steps[1].data_base64.length).toBeGreaterThan(100);
  await expect(page.getByText(/Pickup signed by Mr Smith/)).toBeVisible();
});

test('the signing tablet asks guests to sign at pickup, then at drop-off', async ({ page }) => {
  const device = { device_id: 'signer', paired: true, status: 'active', kiosk_type: 'job_signing', company_id: 'a', company_name: 'Island Transit Co.', vehicle_id: 'bus-a', vehicle_name: 'Bus 12' };
  const job = { id: 'job-1', job_type: 'airport_pickup', status: 'scheduled', pickup_name: 'Maurice Bishop Airport', dropoff_name: 'Grand Hotel', scheduled_time: new Date().toISOString(), flight_number: 'AA 1234', guests: 3, passenger_name: 'Mr Smith' };
  let jobs = [];
  const signs = [];
  await page.addInitScript((TOKEN) => { localStorage.setItem('tt_kiosk_device_id', 'signer'); localStorage.setItem('tt_device_token_signer', TOKEN); }, 'e'.repeat(64));
  await page.route('https://api.mapbox.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/api/**', (r) => {
    const url = r.request().url(), body = r.request().postDataJSON();
    if (url.includes('/functions/kioskHeartbeat')) return r.fulfill({ json: device });
    if (url.includes('/functions/jobSigning')) {
      expect(body.device_token).toBe('e'.repeat(64));
      if (body.action === 'state') return r.fulfill({ json: { bus: { id: 'bus-a', name: 'Bus 12' }, jobs } });
      if (body.action === 'sign') {
        signs.push(body);
        jobs = jobs.map((j) => (j.id === body.trip_id ? { ...j, [`${body.mode}_signed_at`]: new Date().toISOString() } : j));
        return r.fulfill({ json: { trip: jobs.find((j) => j.id === body.trip_id) } });
      }
    }
    if (url.includes('/functions/kioskCheckIn')) return r.fulfill({ status: 401, json: { error: 'Invalid or unpaired kiosk device' } });
    return r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  await page.clock.install();
  await page.goto('/kiosk');
  await expect(page.getByText('Welcome aboard', { exact: true })).toBeVisible();
  await expect(page.getByText("You'll be asked to sign here at pickup and at drop-off.")).toBeVisible();

  // The driver starts the job: the pickup signature comes up by itself.
  jobs = [{ ...job, status: 'on_the_way' }];
  await page.clock.fastForward(31000);
  await expect(page.getByText('Please sign to confirm your pickup.')).toBeVisible();
  await expect(page.getByText('Flight AA 1234')).toBeVisible();
  await expect(page.getByLabel('Your name')).toHaveValue('Mr Smith');
  await expect(page.getByLabel('Number of guests')).toHaveValue('3');
  const confirm = page.getByRole('button', { name: 'Confirm', exact: true });
  await expect(confirm).toBeDisabled();
  const pad = await page.locator('canvas').boundingBox();
  await page.mouse.move(pad.x + 30, pad.y + 40);
  await page.mouse.down();
  await page.mouse.move(pad.x + 220, pad.y + 90, { steps: 6 });
  await page.mouse.up();
  await confirm.click();
  await expect(page.getByText('Thank you, Mr Smith!')).toBeVisible();
  expect(signs[0]).toMatchObject({ action: 'sign', trip_id: 'job-1', mode: 'pickup', signed_by: 'Mr Smith', guests: 3, mime_type: 'image/png' });
  expect(signs[0].data_base64.length).toBeGreaterThan(100);

  // Arrived: the drop-off signature.
  jobs = jobs.map((j) => ({ ...j, status: 'arrived' }));
  await page.clock.fastForward(11000);
  await expect(page.getByText('Please sign to confirm your drop-off.')).toBeVisible();
  await expect(page.getByText('Thank you for travelling with us')).toBeVisible();
});

test('at the hotel the front desk confirms the drop-off; the driver sends a meet-and-greet name sign', async ({ page }) => {
  let job = {
    id: 'job-1', job_type: 'airport_pickup', status: 'arrived', vehicle_id: 'bus-a', company_id: 'company-a',
    pickup_name: 'Maurice Bishop Airport', dropoff_name: 'Grand Hotel', scheduled_time: new Date().toISOString(),
    flight_number: 'AA 1234', guests: 2, passenger_name: 'Mr Smith', client_name: 'Grand Hotel', stops: [],
    pickup_signed_at: new Date().toISOString(), pickup_signed_by: 'Mr Smith', pickup_signed_role: 'guest',
  };
  const second = { ...job, id: 'job-2', status: 'scheduled', pickup_signed_at: undefined, pickup_signed_by: undefined, passenger_name: 'Ms Jones', client_name: 'Calabash Hotel' };
  const kiosk = { id: 'driver-test', kiosk_type: 'driver', vehicle_id: 'bus-a', company_id: 'company-a', company_name: 'Island Transit Co.', status: 'active', paired: true };
  const vehicle = { id: 'bus-a', name: 'Bus 12', company_id: 'company-a', capacity: 25, status: 'idle', tracking_active: false };
  const signs = [];
  const nameSigns = [];
  await page.route('**/api/**', async (r) => {
    const url = r.request().url();
    const body = r.request().postDataJSON();
    if (url.includes('/functions/kioskHeartbeat')) return r.fulfill({ json: kiosk });
    if (url.includes('/functions/driverSession')) {
      if (body?.action === 'verify_pin') return r.fulfill({ json: { ok: true, driver_grant: 'b'.repeat(64) } });
      if (body?.action === 'heartbeat') return r.fulfill({ json: { vehicle, driver_name: 'Kofi Charles', occupancy: 0, check_ins: [], broadcasts: [], group_messages: [], trips: [job, second].filter((t) => t.status !== 'completed'), driver_unlocked: true, open_shift: null, staff: [], has_driver_pin: true, company_name: 'Island Transit Co.' } });
      if (body?.action === 'sign_trip') {
        signs.push(body);
        job = { ...job, status: 'completed', dropoff_signed_at: new Date().toISOString(), dropoff_signed_by: body.signed_by, dropoff_signed_role: body.signed_role };
        return r.fulfill({ json: { trip: job } });
      }
      if (body?.action === 'show_pickup_sign') {
        nameSigns.push(body);
        return r.fulfill({ json: { ok: true, devices: 1 } });
      }
      return r.fulfill({ json: { ok: true } });
    }
    if (url.includes('/entities/')) return r.fulfill({ status: 403, json: {} });
    return r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  await page.route('https://api.mapbox.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.addInitScript(() => { localStorage.setItem('tt_driver_device_id', 'driver-test'); localStorage.setItem('tt-map-engine', 'basic'); });
  await page.goto('/driver/trips');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();

  // At the hotel: the front desk confirms the guests were dropped off.
  await page.getByRole('button', { name: 'Confirm drop-off — signature', exact: true }).click({ timeout: 15000 });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Hotel front desk' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('Ask the front desk at Grand Hotel to confirm the guests were dropped off here, and sign below.')).toBeVisible();
  await dialog.getByLabel("Receptionist's name").fill('Mary');
  const pad = await dialog.locator('canvas').boundingBox();
  await page.mouse.move(pad.x + 30, pad.y + 40);
  await page.mouse.down();
  await page.mouse.move(pad.x + 200, pad.y + 80, { steps: 6 });
  await page.mouse.up();
  await dialog.getByRole('button', { name: 'Confirm signature', exact: true }).click();
  await expect.poll(() => signs.length).toBe(1);
  expect(signs[0]).toMatchObject({ action: 'sign_trip', trip_id: 'job-1', mode: 'dropoff', signed_by: 'Mary', signed_role: 'reception', guests: 2 });

  // At arrivals for the next job: the guest's name goes to the bus's
  // boarding/sign-in tablet, which shows it full screen under the company.
  await page.getByRole('button', { name: 'Name sign', exact: true }).click();
  await expect.poll(() => nameSigns.length).toBe(1);
  expect(nameSigns[0]).toMatchObject({ action: 'show_pickup_sign', trip_id: 'job-2' });
  await expect(page.getByText('Pickup sign sent', { exact: true })).toBeVisible();
  await expect(page.getByText('Showing on 1 boarding/sign-in device(s).', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Name sign' })).toHaveCount(0);
});

test('signing operator unlocks jobs and chooses the correct pickup signature',async({page})=>{
 const device={device_id:'signer',paired:true,status:'active',kiosk_type:'job_signing',company_id:'a',vehicle_id:'bus-a',vehicle_name:'Bus 12'};
 const jobs=[{id:'earlier',status:'on_the_way',pickup_name:'First Airport',dropoff_name:'First Hotel',scheduled_time:'2026-10-22T10:00:00Z'},
 {id:'chosen',status:'on_the_way',pickup_name:'Chosen Airport',dropoff_name:'Chosen Hotel',scheduled_time:'2026-10-22T11:00:00Z',notes:'Operator-only instructions'}];
 const actions=[];
 await page.addInitScript(()=>{localStorage.setItem('tt_kiosk_device_id','signer');localStorage.setItem('tt_device_token_signer','e'.repeat(64));});
 await page.route('**/api/**',route=>{
  const url=route.request().url();let body={};try{body=route.request().postDataJSON()||{};}catch{}
  if(url.includes('/functions/kioskHeartbeat'))return route.fulfill({json:device});
  if(url.includes('/functions/jobSigning')){
   actions.push(body);
   if(body.action==='state')return route.fulfill({json:{jobs:jobs.map(({notes,...j})=>j)}});
   if(body.action==='unlock_operator')return route.fulfill(body.pin==='1234'?{json:{operator_grant:'f'.repeat(64)}}:{status:403,json:{error:'Incorrect bus PIN'}});
   if(body.action==='operator_state')return route.fulfill({json:{jobs}});
   if(body.action==='arrive')return route.fulfill({json:{trip:jobs.find(j=>j.id===body.trip_id)}});
  }
  return route.fulfill({json:{id:'test-app',public_settings:{authentication_required:false}}});
 });
 await page.goto('/kiosk');
 await page.getByRole('button',{name:'Job controls',exact:true}).click();
 await page.getByLabel('Bus PIN',{exact:true}).fill('1234');
 await page.getByRole('button',{name:'Unlock job controls',exact:true}).click();
 const job=page.getByRole('dialog').locator('section').filter({hasText:'Chosen Airport'});
 await expect(job).toContainText('Operator-only instructions');
 await job.getByRole('button',{name:'Arrived at pickup · Show sign-in',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByText('Chosen Airport',{exact:false}).first()).toBeVisible();
 expect(actions.find(a=>a.action==='arrive')).toMatchObject({trip_id:'chosen',operator_grant:'f'.repeat(64),stage:'pickup'});
 await expect(page.getByText('Operator-only instructions',{exact:true})).toHaveCount(0);
});

async function slideAway(page, label) {
 const b = await page.getByText(label, { exact: true }).locator('..').boundingBox();
 await page.mouse.move(b.x + 36, b.y + b.height / 2); await page.mouse.down();
 await page.mouse.move(b.x + b.width - 30, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
}
// The kiosk app's hidden settings area (tap 5 times) covers the top-right
// 64dp of the screen and takes every tap there.
const controlsInSettingsCorner = (page) => page.evaluate(() => [...document.querySelectorAll('[aria-label="Name sign"] button,[aria-label="Name sign"] [role=button]')]
 .filter((el) => { const r = el.getBoundingClientRect(); return r.right > innerWidth - 64 && r.top < 64; }).length);

test('the guest name card on the signing tablet slides away to the jobs behind it', async ({ page }) => {
 await page.setViewportSize({ width: 1280, height: 800 });
 const device = { device_id: 'signer', paired: true, status: 'active', kiosk_type: 'job_signing', company_id: 'a', company_name: 'Island Transit Co.', vehicle_id: 'bus-a', vehicle_name: 'Bus 12' };
 const jobs = [{ id: 'run', status: 'on_the_way', pickup_name: 'Airport', dropoff_name: 'Spice Island Resort', passenger_name: 'Mr Smith', guests: 2, scheduled_time: '2026-10-28T10:00:00Z' }];
 await page.addInitScript(() => { localStorage.setItem('tt_kiosk_device_id', 'signer'); localStorage.setItem('tt_device_token_signer', 'e'.repeat(64)); });
 await page.route('**/api/**', (route) => {
  const url = route.request().url(); let body = {}; try { body = route.request().postDataJSON() || {}; } catch { /* GET */ }
  if (url.includes('/functions/kioskHeartbeat')) return route.fulfill({ json: device });
  if (url.includes('/functions/jobSigning')) {
   if (body.action === 'state') return route.fulfill({ json: { jobs: [] } });
   if (body.action === 'unlock_operator') return route.fulfill({ json: { operator_grant: 'f'.repeat(64) } });
   if (body.action === 'operator_state') return route.fulfill({ json: { jobs } });
  }
  return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
 });
 await page.goto('/kiosk');
 await page.getByRole('button', { name: 'Job controls', exact: true }).click();
 await page.getByLabel('Bus PIN', { exact: true }).fill('1234');
 await page.getByRole('button', { name: 'Unlock job controls', exact: true }).click();
 await page.getByRole('button', { name: 'Show guest name card', exact: true }).click();
 const sign = page.getByRole('dialog', { name: 'Name sign' });
 await expect(sign).toBeVisible();
 await expect(sign.getByText('Mr Smith', { exact: true })).toBeVisible();
 await expect(page.getByRole('dialog', { name: 'Signing tablet job controls' })).toHaveCount(0);
 expect(await controlsInSettingsCorner(page)).toBe(0);
 await page.screenshot({ path: '/tmp/tt-name-card.png' });
 // Sliding it away shows the jobs again, still unlocked.
 await slideAway(page, 'Slide to go back to jobs');
 await expect(sign).toHaveCount(0);
 const controls = page.getByRole('dialog', { name: 'Signing tablet job controls' });
 await expect(controls.getByText('Airport → Spice Island Resort')).toBeVisible();
 await expect(controls.getByLabel('Bus PIN', { exact: true })).toHaveCount(0);

 // A sign the driver sends shows by itself; behind it the controls ask for
 // the bus PIN, and closing it leaves no second sign underneath.
 await controls.getByRole('button', { name: 'Lock controls', exact: true }).click();
 device.pickup_sign = { id: 'from-driver', name: 'Ms Jones', subtitle: 'Calabash Hotel', shown_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 60_000).toISOString() };
 await page.reload();
 await expect(sign.getByText('Ms Jones', { exact: true })).toBeVisible();
 await expect(page.getByRole('dialog', { name: 'Name sign' })).toHaveCount(1);
 await slideAway(page, 'Slide to go back to jobs');
 await expect(sign).toHaveCount(0);
 await expect(controls.getByLabel('Bus PIN', { exact: true })).toBeVisible();
 await page.reload();
 await expect(page.getByRole('button', { name: 'Job controls', exact: true })).toBeVisible();
 await expect(sign).toHaveCount(0);
});

test('if confirming a website request fails, Confirm ride retries with the saved job instead of making a second one', async ({ page }) => {
  const created = [], confirms = [];
  const bus = { id: 'bus', name: 'Bus 12', company_id: 'a', company_name: 'Island Transit Co.', driver_name: 'Kofi', status: 'idle', type: 'bus', capacity: 30 };
  const when = new Date(Date.now() + 2 * 86400_000); when.setHours(10, 0, 0, 0);
  let request = { id: 'req-1', status: 'new', service: 'transfer', requested_time: when.toISOString(), pickup: 'Grand Hotel', dropoff: 'Maurice Bishop Airport', guests: 2, name: 'Ana Joseph', phone: '+1 473 555 0101', email: 'ana@example.com', created_date: new Date().toISOString() };
  await page.addInitScript(() => { localStorage.setItem('base44_access_token', 'isolated-test-session'); localStorage.setItem('tt-map-engine', 'basic'); });
  await page.route('https://api.mapbox.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/api/**', (r) => {
    const body = r.request().postDataJSON(), url = r.request().url();
    if (url.includes('/functions/bookingRequest')) {
      confirms.push(body);
      // The first confirmation fails (say the connection dropped); the second goes through.
      if (confirms.length === 1) return r.fulfill({ status: 500, json: { error: 'Server is busy. Try again.' } });
      request = null;
      return r.fulfill({ json: { ok: true, emailed: true, tracking: true } });
    }
    if (url.includes('/functions/entityAccess')) {
      if (body.entity === 'User') return r.fulfill({ json: { result: { id: 'admin-test', role: 'admin', full_name: 'Test Admin' } } });
      if (body.entity === 'AdminBootstrap') {
        const lists = { vehicles: [bus], trips: created };
        return r.fulfill({ json: { result: { datasets: Object.fromEntries(body.datasets.map((k) => [k, lists[k] || []])), errors: {} } } });
      }
      if (body.entity === 'BookingRequest') return r.fulfill({ json: { result: request ? [request] : [] } });
      if (body.entity === 'Trip' && body.operation === 'create') {
        const row = { id: `job-${created.length + 1}`, ...body.data };
        created.push(row);
        return r.fulfill({ json: { result: row } });
      }
      return r.fulfill({ json: { result: [] } });
    }
    return r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });

  await page.goto('/admin/trips');
  await page.getByRole('button', { name: /1 ride request from the website/ }).click();
  await page.getByRole('button', { name: 'Make job', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Bus and driver', { exact: true }).click();
  await page.getByRole('option', { name: 'Bus 12 · Kofi' }).click();
  await dialog.getByRole('button', { name: 'Create job', exact: true }).click();
  await expect.poll(() => created.length).toBe(1);
  await expect(page.getByText("The job is saved, but the ride wasn't confirmed", { exact: true })).toBeVisible();

  // The request stays, now offering to confirm the saved job, not to make another.
  await expect(page.getByText("The job for this request is saved, but the ride wasn't confirmed yet.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make job', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm ride', exact: true }).click();
  await expect(page.getByText('Ride confirmed', { exact: true })).toBeVisible();
  expect(created).toHaveLength(1);
  expect(confirms.map((c) => [c.action, c.request_id, c.trip_id])).toEqual([['confirm', 'req-1', 'job-1'], ['confirm', 'req-1', 'job-1']]);
});

// The signing tablet goes from one bus to another: staff open the job
// controls with this bus's PIN, pick the bus, and give that bus's PIN.
async function signingTablet(page, { saved = [] } = {}) {
 const device = { device_id: 'signer', paired: true, status: 'active', kiosk_type: 'job_signing', company_id: 'a', company_name: 'Island Transit Co.', vehicle_id: 'bus-a', vehicle_name: 'Bus 12' };
 const actions = [];
 await page.addInitScript((items) => {
  localStorage.setItem('tt_kiosk_device_id', 'signer'); localStorage.setItem('tt_device_token_signer', 'e'.repeat(64));
  if (items.length) localStorage.setItem('tt_offline_jobs', JSON.stringify(items));
 }, saved);
 await page.route('**/api/**', (route) => {
  const url = route.request().url(); let body = {}; try { body = route.request().postDataJSON() || {}; } catch { /* no body */ }
  if (url.includes('/functions/kioskHeartbeat')) return route.fulfill({ json: device });
  if (url.includes('/functions/jobSigning')) {
   actions.push(body);
   if (body.action === 'sign') return route.abort();
   if (body.action === 'state') return route.fulfill({ json: { jobs: [], bus: { id: device.vehicle_id, name: device.vehicle_name } } });
   if (body.action === 'unlock_operator') return route.fulfill({ json: { operator_grant: 'f'.repeat(64) } });
   if (body.action === 'operator_state') return route.fulfill({ json: { jobs: device.vehicle_id === 'bus-a' ? [{ id: 'run', status: 'on_the_way', pickup_name: 'Airport', dropoff_name: 'Grand Hotel' }] : [] } });
   if (body.action === 'list_buses') return route.fulfill({ json: { current: 'bus-a', buses: [{ id: 'bus-a', name: 'Bus 12' }, { id: 'bus-b', name: 'Bus 14', plate_number: 'PB 14' }] } });
   if (body.action === 'change_bus') {
    if (body.pin !== '5678') return route.fulfill({ status: 403, json: { error: 'Incorrect PIN for Bus 14' } });
    Object.assign(device, { vehicle_id: 'bus-b', vehicle_name: 'Bus 14' });
    return route.fulfill({ json: { bus: { id: 'bus-b', name: 'Bus 14' }, operator_grant: '9'.repeat(64) } });
   }
  }
  return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
 });
 await page.goto('/kiosk');
 await page.getByRole('button', { name: 'Job controls', exact: true }).click();
 await page.getByLabel('Bus PIN', { exact: true }).fill('1234');
 await page.getByRole('button', { name: 'Unlock job controls', exact: true }).click();
 const dialog = page.getByRole('dialog');
 await expect(dialog.getByText('This tablet is on')).toContainText('Bus 12');
 await dialog.getByRole('button', { name: 'Change bus', exact: true }).click();
 return { dialog, actions };
}

test('the signing tablet moves to another bus with that bus\'s PIN and stays paired', async ({ page }) => {
 const { dialog, actions } = await signingTablet(page);
 // Only the other buses; the job under way on this bus is pointed out.
 await expect(dialog.getByRole('button', { name: /Bus 12/ })).toHaveCount(0);
 await dialog.getByRole('button', { name: /Bus 14/ }).click();
 await expect(dialog.getByText(/A job on Bus 12 is under way/)).toBeVisible();
 await dialog.getByLabel('PIN for Bus 14').fill('1234');
 await dialog.getByRole('button', { name: 'Move to Bus 14', exact: true }).click();
 await expect(dialog.getByRole('alert')).toHaveText('Incorrect PIN for Bus 14');
 await dialog.getByLabel('PIN for Bus 14').fill('5678');
 await dialog.getByRole('button', { name: 'Move to Bus 14', exact: true }).click();
 await expect(dialog.getByRole('status')).toHaveText('This tablet is now on Bus 14.');
 expect(actions.find((a) => a.action === 'change_bus' && a.pin === '5678')).toMatchObject({ vehicle_id: 'bus-b', operator_grant: 'f'.repeat(64) });
 await dialog.getByRole('button', { name: 'Lock controls', exact: true }).click();
 // The screen now says the new bus, and the tablet remembers it.
 await expect(page.getByText('Bus 14', { exact: true }).first()).toBeVisible();
 expect(await page.evaluate(() => Object.values(localStorage).join(' '))).toContain('bus-b');
});

test('the signing tablet keeps its bus while signatures saved on it are unsent', async ({ page }) => {
 const saved = [{ kind: 'kiosk_job_sign', label: 'Pickup signature', payload: { action: 'sign', trip_id: 'run', mode: 'pickup', device_id: 'signer', client_request_id: 'saved-sign-0001', expected_device_id: 'signer', expected_company_id: 'a', expected_vehicle_id: 'bus-a' } }];
 const { dialog, actions } = await signingTablet(page, { saved });
 await expect(dialog.getByRole('status')).toContainText('1 signature is saved on this tablet and not sent yet');
 await expect(dialog.getByRole('button', { name: /Bus 14/ })).toHaveCount(0);
 expect(actions.some((a) => a.action === 'list_buses')).toBe(false);
});
