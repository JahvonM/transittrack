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
        const lists = { vehicles: [bus], places, clients, trips: created, completedTrips: [], routes: [] };
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
  await dialog.getByLabel('Client', { exact: true }).click();
  await page.getByRole('option', { name: 'Grand Hotel Group' }).click();
  await dialog.getByLabel('Bus and driver', { exact: true }).click();
  await page.getByRole('option', { name: 'Bus 12 · Kofi' }).click();
  await dialog.getByLabel('Drop-off', { exact: true }).click();
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
  await sign.getByLabel("Signer's name").fill('Mr Smith');
  await expect(sign.getByLabel('Number of guests')).toHaveValue('3');
  await sign.getByLabel('Number of guests').fill('4');
  const pad = await sign.locator('canvas').boundingBox();
  await page.mouse.move(pad.x + 20, pad.y + 20);
  await page.mouse.down();
  await page.mouse.move(pad.x + 120, pad.y + 60, { steps: 5 });
  await page.mouse.up();
  await sign.getByRole('button', { name: 'Confirm signature', exact: true }).click();
  await expect.poll(() => steps.length).toBe(2);
  expect(steps[1]).toMatchObject({ action: 'sign_trip', trip_id: 'job-1', mode: 'pickup', signed_by: 'Mr Smith', guests: 4, mime_type: 'image/png' });
  expect(steps[1].lat).toBeCloseTo(12.0045, 3);
  expect(steps[1].data_base64.length).toBeGreaterThan(100);
  await expect(page.getByText(/Pickup signed by Mr Smith/)).toBeVisible();
});
