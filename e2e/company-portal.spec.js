import { test, expect } from '@playwright/test';

// The company portal (a hotel whose staff and guests ride the buses). The
// server only gives a bus's position while a shift is open on it, or while a
// job shared with the company is on the way; the portal shows what it gets.

const company = { id: 'a', name: 'Six Senses', access_code: 'ABCD2345EFGH', phone: '+1 473 555 0200' };
const bus = (id, name, shared, at = {}) => ({ id, name, company_id: 'a', company_name: 'Six Senses', type: 'staff_bus', status: 'idle', tracking_active: !!shared, location_shared: shared, current_lat: shared ? 12.05 : null, current_lng: shared ? -61.75 : null, last_location_update: shared ? new Date().toISOString() : null, ...at });

async function portal(page, { vehicles = [], trips = [], requests = [] } = {}) {
  const calls = [];
  await page.addInitScript(() => localStorage.setItem('base44_access_token', 'mock-authenticated-session'));
  await page.route('**/api/**', async (route) => {
    const req = route.request(), url = req.url();
    if (url.includes('/entities/')) return route.fulfill({ status: 403, json: { error: 'Direct access blocked' } });
    if (url.includes('/functions/entityAccess')) {
      const body = req.postDataJSON();
      let result = [];
      if (body.entity === 'User') result = { id: 'caller', role: 'company', company_id: 'a', email: 'desk@hotel.invalid', full_name: 'Front Desk' };
      else if (body.entity === 'Company') result = [company];
      else if (body.entity === 'Vehicle') result = vehicles;
      else if (body.entity === 'Trip') result = trips;
      else if (body.entity === 'LiveLists') result = { lists: { Vehicle: vehicles, Trip: trips }, errors: {} };
      return route.fulfill({ json: { result } });
    }
    if (url.includes('/functions/bookingRequest')) {
      const body = req.postDataJSON();
      calls.push(body);
      if (body.action === 'company_requests') return route.fulfill({ json: { requests } });
      return route.fulfill({ json: { ok: true, id: 'req9' } });
    }
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  return calls;
}

test('the overview shows a bus only while it is on shift', async ({ page }) => {
  await portal(page, { vehicles: [bus('bus-a', 'Bus A', ''), bus('bus-b', 'Bus B', 'shift')] });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/company');
  const buses = page.getByRole('region', { name: 'Your buses' });
  await expect(buses.getByText('Bus A', { exact: true })).toBeVisible();
  await expect(buses.getByText('Off shift', { exact: true })).toBeVisible();
  await expect(buses.getByText('On shift', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('On the map now')).toBeVisible();
  // Same sidebar as Admin, with the company's sections.
  const nav = page.getByRole('navigation', { name: 'Company' });
  for (const name of ['Overview', 'Jobs', 'Live map', 'Buses', 'Routes', 'Passengers']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('a company asks for a job and dispatch is told', async ({ page }) => {
  const calls = await portal(page, { vehicles: [bus('bus-a', 'Bus A', '')] });
  await page.goto('/company/jobs');
  await page.getByRole('button', { name: 'Request a job' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Request a job' });
  // Nothing missing is sent.
  await dialog.getByRole('button', { name: 'Send request' }).click();
  await expect(dialog.getByText("Some answers need a look. They're marked above.")).toBeVisible();
  await expect(dialog.getByLabel('Pick up from')).toHaveValue('Maurice Bishop International Airport');
  const when = await page.evaluate(() => {
    const d = new Date(Date.now() - 4 * 3600_000 + 2 * 86400_000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T14:15`;
  });
  await dialog.getByLabel('Pickup time (Grenada time)').fill(when);
  await dialog.getByLabel('Flight number').fill('aa 1234');
  await dialog.getByLabel('Going to').fill('Six Senses La Sagesse');
  await dialog.getByLabel("Guest's name").fill('Mr and Mrs Lee');
  await dialog.getByLabel('Passengers').fill('2');
  await dialog.getByRole('button', { name: 'Send request' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Job requested').first()).toBeVisible();
  const sent = calls.find((c) => c.action === 'company_request');
  expect(sent).toMatchObject({ service: 'airport_pickup', pickup: 'Maurice Bishop International Airport', dropoff: 'Six Senses La Sagesse', name: 'Mr and Mrs Lee', guests: 2, flight_number: 'AA 1234', phone: '+1 473 555 0200' });
  expect(sent).not.toHaveProperty('email');
});

test('a shared job under way puts its bus on the map, and requests show their answer', async ({ page }) => {
  const soon = new Date(Date.now() + 3600_000).toISOString();
  await portal(page, {
    vehicles: [bus('bus-a', 'Bus A', 'job'), bus('bus-b', 'Bus B', '')],
    trips: [
      { id: 'j1', company_id: 'a', vehicle_id: 'bus-a', vehicle_name: 'Bus A', job_type: 'airport_pickup', status: 'on_the_way', shared_with_company: true, scheduled_time: soon, pickup_name: 'MBIA', dropoff_name: 'Six Senses', passenger_name: 'Mr Lee' },
      { id: 'j2', company_id: 'a', vehicle_id: 'bus-b', vehicle_name: 'Bus B', job_type: 'transfer', status: 'scheduled', shared_with_company: true, scheduled_time: soon, pickup_name: 'Six Senses', dropoff_name: 'Town', passenger_name: 'Ms Ray' },
    ],
    requests: [{ id: 'r1', service: 'hotel_tour', requested_time: soon, pickup: 'Lobby', dropoff: 'Lobby', name: 'Group', status: 'declined', decline_reason: 'No bus free that day.', created_date: new Date().toISOString() }],
  });
  await page.goto('/company/jobs');
  const now = page.getByRole('region', { name: 'On the way now' });
  await expect(now.getByText('Bus A is on the map')).toBeVisible();
  await expect(now.getByText('Mr Lee')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Coming up' }).getByText('Ms Ray')).toBeVisible();
  const requests = page.getByRole('region', { name: 'Your requests' });
  await expect(requests.getByText('Declined', { exact: true })).toBeVisible();
  await expect(requests.getByText('No bus free that day.')).toBeVisible();
});

test('the live map has no route replay for a company', async ({ page }) => {
  await portal(page, { vehicles: [bus('bus-a', 'Bus A', '')] });
  await page.goto('/manager/replay');
  await expect(page.getByRole('heading', { level: 1, name: 'Live map' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Route replay' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Live fleet' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByText('Hidden until a shift or your job starts').first()).toBeVisible();
});
