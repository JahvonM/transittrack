import { test, expect } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';

// Admin → Bus library: a starter page is added with one press, lists the
// buses it covers (and what is missing from their records), and a fact can
// be marked checked and found by searching.

const LIBRARY = new Set(['VehicleGuide', 'GuideFact', 'GuideDocument']);

// The library's three tables, kept in memory the way the server keeps them:
// what is created is listed next time, and marking a fact records who did it.
async function libraryServer(page) {
  const tables = { VehicleGuide: [], GuideFact: [], GuideDocument: [] };
  const writes = [];
  let n = 0;
  await page.route('**/api/functions/v1/entityAccess', async (route) => {
    const body = route.request().postDataJSON();
    if (!LIBRARY.has(body?.entity)) return route.fallback();
    const rows = tables[body.entity];
    const op = body.operation;
    if (op === 'list' || op === 'filter') return route.fulfill({ json: { result: rows } });
    writes.push({ entity: body.entity, op, data: body.data, id: body.id });
    const stamp = (data, before) => {
      if (body.entity !== 'GuideFact' || !Object.hasOwn(data, 'status') || data.status === before?.status) return data;
      return { ...data, checked_by: data.status === 'unchecked' ? '' : 'Admin Person', checked_at: data.status === 'unchecked' ? null : new Date().toISOString() };
    };
    if (op === 'create') { const row = { id: `${body.entity}-${++n}`, ...stamp(body.data) }; rows.push(row); return route.fulfill({ json: { result: row } }); }
    if (op === 'bulkCreate') { const made = body.data.map((d) => ({ id: `${body.entity}-${++n}`, ...stamp(d) })); rows.push(...made); return route.fulfill({ json: { result: made } }); }
    if (op === 'update') { const row = rows.find((r) => r.id === body.id); Object.assign(row, stamp(body.data, row)); return route.fulfill({ json: { result: row } }); }
    if (op === 'delete') { tables[body.entity] = rows.filter((r) => r.id !== body.id); return route.fulfill({ json: { result: { ok: true } } }); }
    return route.fulfill({ status: 400, json: { error: 'Unsupported operation' } });
  });
  return { tables, writes };
}

async function open(page, { width = 1440, height = 900 } = {}) {
  const data = fleetData();
  // Two Hiaces and an NV350, as typed in Admin; the first Hiace's chassis
  // number is one character short and no bus has its engine recorded.
  Object.assign(data.tables.Vehicle[0], { make: 'Toyota', model: 'Hiace', year: 2016, vin: 'TESTVIN000000001', engine: '', transmission: '' });
  Object.assign(data.tables.Vehicle[1], { make: 'Toyota', model: 'Hiace', year: 2017, vin: 'TESTVIN0000000002', engine: '1KD-FTV', transmission: 'Manual' });
  data.tables.Vehicle.push({ id: 'bus-c', company_id: 'a', company_name: data.company.name, name: 'Bus 3', plate_number: 'PA 103', make: 'Nissan', model: 'Nv350', year: 2019, status: 'idle' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockFleet(page, { role: 'admin', data });
  const server = await libraryServer(page);
  await page.setViewportSize({ width, height });
  await page.goto('/admin/library');
  return { errors, server };
}

test('a starter page is added, covers the right buses, and a fact is marked checked', async ({ page }) => {
  const { errors, server } = await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Bus library/);

  // Nothing yet: both starter pages are offered, and every bus has no page.
  const ready = page.getByRole('region', { name: 'Ready to add' });
  await expect(ready).toContainText('Toyota Hiace');
  await expect(ready).toContainText('Nissan NV350');
  const uncovered = page.getByRole('region', { name: 'Buses with no page' });
  await expect(uncovered.getByRole('listitem')).toHaveCount(3);
  await page.screenshot({ path: '/tmp/tt-library-home.png' });

  await ready.getByRole('listitem').filter({ hasText: 'Toyota Hiace' }).getByRole('button', { name: 'Add this page' }).click();

  // The page opens: one page, its facts in one batch, all not checked.
  await expect(page.getByRole('heading', { name: 'Toyota Hiace', level: 2 })).toBeVisible();
  expect(server.writes.filter((w) => w.op === 'create' && w.entity === 'VehicleGuide')).toHaveLength(1);
  const batch = server.writes.find((w) => w.op === 'bulkCreate');
  expect(batch.data.length).toBeGreaterThan(10);
  expect(batch.data.every((f) => f.status === 'unchecked' && f.guide_id === server.tables.VehicleGuide[0].id)).toBe(true);

  // Its buses are the two Hiaces, with what their records are missing.
  const buses = page.getByRole('region', { name: 'Your buses' });
  await expect(buses.getByRole('listitem')).toHaveCount(2);
  const first = buses.getByRole('listitem').filter({ hasText: 'Bus 1' });
  await expect(first).toContainText('Engine not recorded');
  await expect(first).toContainText('Chassis number has 16 characters');
  await expect(buses.getByRole('listitem').filter({ hasText: 'Bus 2' })).toContainText('Engine: 1KD-FTV');

  // Facts show their source as an outside link, and start not checked.
  const tyres = page.getByRole('region', { name: 'Tyres & wheels' });
  const torque = tyres.getByRole('listitem').filter({ hasText: 'Wheel nut torque' });
  await expect(torque).toContainText('100 N·m');
  await expect(torque).toContainText('Not checked');
  const source = torque.getByRole('link', { name: /Source:/ });
  await expect(source).toHaveAttribute('href', /^https:\/\//);
  await expect(source).toHaveAttribute('target', '_blank');
  await expect(source).toHaveAttribute('rel', /noopener/);
  await page.screenshot({ path: '/tmp/tt-library-page.png', fullPage: true });

  // A mechanic confirmed it on the bus.
  await torque.getByRole('button', { name: "It's right" }).click();
  await expect(torque).toContainText('Checked');
  await expect(torque).toContainText('Admin Person');
  expect(server.writes.at(-1)).toMatchObject({ entity: 'GuideFact', op: 'update', data: { status: 'checked' } });

  // Searching the page, and the not-checked filter.
  await page.getByRole('textbox', { name: 'Search this page' }).fill('torque');
  await expect(page.getByRole('region', { name: 'Tyres & wheels' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Oils & fluids' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search this page' }).fill('');
  const filter = page.getByRole('group', { name: 'Which facts' });
  await filter.getByRole('button', { name: /^Checked/ }).click();
  await expect(page.getByRole('region', { name: 'Tyres & wheels' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Oils & fluids' })).toHaveCount(0);
  await expect(page.locator('section li').filter({ hasText: 'Not checked' })).toHaveCount(0);
  // And it can be undone.
  await torque.getByRole('button', { name: 'Undo: mark not checked' }).click();
  await expect(page.getByRole('region', { name: 'Tyres & wheels' })).toHaveCount(0);
  await filter.getByRole('button', { name: /^All/ }).click();
  await torque.getByRole('button', { name: "It's right" }).click();
  await expect(torque).toContainText('Admin Person');

  // Back on the list: the page card counts it, and the NV350 is still offered.
  await page.getByRole('button', { name: 'All models' }).click();
  const card = page.getByRole('button', { name: /Toyota Hiace/ });
  await expect(card).toContainText('2 of your buses');
  await expect(card).toContainText('1 checked');
  await expect(page.getByRole('region', { name: 'Ready to add' })).not.toContainText('Toyota Hiace');
  await expect(page.getByRole('region', { name: 'Buses with no page' }).getByRole('listitem')).toHaveCount(1);

  // Search across every page.
  await page.getByRole('textbox', { name: 'Search the library' }).fill('ryco');
  await expect(page.getByRole('region', { name: /Results for/ })).toContainText('RSK37C');
  expect(errors).toEqual([]);
});

test('on a phone the library fits the screen', async ({ page }) => {
  const { errors } = await open(page, { width: 390, height: 844 });
  await page.getByRole('region', { name: 'Ready to add' }).getByRole('button', { name: 'Add this page' }).first().click();
  await expect(page.getByRole('heading', { name: 'Toyota Hiace', level: 2 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: '/tmp/tt-library-phone.png', fullPage: false });
  expect(errors).toEqual([]);
});
