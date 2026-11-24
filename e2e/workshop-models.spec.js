// Workshop › Models, which took over from the Bus library: researched model
// pages (with their facts and torque values), replacement numbers and picture
// slots added from Ready to add, each once; a model page made from a vehicle
// with none; and deleting a model page with everything on it. The researched
// starters only ever reach this test's in-memory server.
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';
import { memoryTables } from './helpers/memoryTables.js';
import { noSideScroll, settle } from './helpers/workshopScan.js';

const json = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const HIACE = json('../src/data/busLibrary/toyota-hiace-h200.json');
const REPLACEMENTS = json('../src/data/partsCatalogue/replacements.json');
const partKey = (n) => String(n || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function emptyTables() {
  return {
    VehicleGuide: [], GuideFact: [], GuideDocument: [], TorqueSpec: [], PartDiagram: [], CatalogueGroup: [],
    PartInterchange: [{ id: 'x1', part_number: '90915-YZZD2', alt_number: 'Z418', alt_brand: 'Ryco', kind: 'aftermarket', status: 'checked' }],
    Part: [{ id: 'p1', part_name: 'Oil filter (genuine)', oem_number: '90915-YZZD2', quantity_in_stock: 2, guide_ids: [] }],
    WorkshopVehicle: [], WorkshopJob: [], WorkshopJobPart: [], Fault: [],
  };
}

async function open(page, path, { role = 'admin', width = 1024, height = 768, tables = emptyTables() } = {}) {
  const data = fleetData();
  // Two Hiaces and an NV350, as typed in Admin; the first Hiace's chassis
  // number is one character short and has no engine recorded.
  Object.assign(data.tables.Vehicle[0], { name: 'Bus 1', make: 'Toyota', model: 'Hiace', year: 2016, vin: 'TESTVIN000000001', engine: '', transmission: '' });
  Object.assign(data.tables.Vehicle[1], { name: 'Bus 2', make: 'Toyota', model: 'Hiace', year: 2017, vin: 'TESTVIN0000000002', engine: '1KD-FTV', transmission: 'Manual' });
  data.tables.Vehicle.push({ id: 'bus-c', company_id: 'a', company_name: data.company.name, name: 'Bus 3', plate_number: 'PA 103', make: 'Nissan', model: 'Nv350', year: 2019, status: 'idle' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  Object.assign(data.tables, tables);
  await mockFleet(page, { role, data });
  const server = await memoryTables(page, tables, { who: role === 'admin' ? 'Admin Person' : 'Mo Mechanic' });
  await page.setViewportSize({ width, height });
  await page.goto(path);
  return { errors, server };
}

test('Ready to add: the Hiace page with its facts and torque value, then picture slots and replacement numbers, each once', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { errors, server } = await open(page, '/workshop/models');
  const ready = page.getByRole('region', { name: 'Ready to add' });
  const hiace = ready.getByRole('listitem').filter({ hasText: 'Toyota Hiace H200' });
  await expect(hiace).toContainText(`Makes its model page with ${HIACE.facts.length} researched facts, then adds 1 torque value.`);
  await expect(ready.getByRole('listitem').filter({ hasText: 'Nissan NV350 E26' })).toContainText('researched facts');
  await expect(ready.getByRole('listitem').filter({ hasText: 'BMW X3 F25' })).toContainText('Makes its model page, then adds');
  await expect(ready.getByRole('listitem').filter({ hasText: 'Picture slots' })).toHaveCount(0);

  await ready.getByRole('button', { name: 'Add Toyota Hiace H200' }).click();
  await expect(ready.getByRole('button', { name: 'Add Toyota Hiace H200' })).toHaveCount(0);
  const guide = server.tables.VehicleGuide[0];
  expect(guide).toMatchObject({ make: 'Toyota', model: 'Hiace', starter_key: 'toyota-hiace-h200' });
  const facts = server.writes.find((w) => w.entity === 'GuideFact' && w.op === 'bulkCreate');
  expect(facts.data).toHaveLength(HIACE.facts.length);
  expect(facts.data.every((f) => f.status === 'unchecked' && f.guide_id === guide.id)).toBe(true);
  expect(server.writes.find((w) => w.entity === 'TorqueSpec' && w.op === 'bulkCreate').data).toEqual([expect.objectContaining({ guide_id: guide.id, item: 'Wheel nuts', status: 'unchecked' })]);

  // The new page brings its picture slots: each area once, with a guide drawing.
  const slots = ready.getByRole('listitem').filter({ hasText: 'Picture slots' });
  await expect(slots).toContainText('8 areas on 1 model page');
  await ready.getByRole('button', { name: 'Add Picture slots' }).click();
  await expect(slots).toHaveCount(0);
  const pictures = server.writes.find((w) => w.entity === 'PartDiagram' && w.op === 'bulkCreate').data;
  expect(pictures).toHaveLength(8);
  expect(pictures.every((d) => d.guide_id === guide.id && d.drawing_key && /^https:\/\/partsouq\.com\//.test(d.catalogue_link) && d.pins.length === 0)).toBe(true);

  // Replacement numbers: the Ryco Z418 one was already there.
  const expected = REPLACEMENTS.filter((r) => !(partKey(r.part_number) === '90915YZZD2' && partKey(r.alt_number) === 'Z418')).length;
  await expect(ready.getByRole('listitem').filter({ hasText: 'Replacement numbers' })).toContainText(`${expected} numbers`);
  await ready.getByRole('button', { name: 'Add Replacement numbers' }).click();
  await expect(ready.getByRole('listitem').filter({ hasText: 'Replacement numbers' })).toHaveCount(0);
  const numbers = server.writes.find((w) => w.entity === 'PartInterchange' && w.op === 'bulkCreate').data;
  expect(numbers).toHaveLength(expected);
  expect(numbers.some((r) => r.alt_number === 'Z418')).toBe(false);
  expect(numbers.every((r) => r.status === 'unchecked' && /^https:\/\//.test(r.source_link))).toBe(true);
  await expect(page.getByRole('region', { name: 'Model pages' }).getByRole('button', { name: /Toyota Hiace/ })).toContainText('Used by Bus 1, Bus 2');
  await page.screenshot({ path: '/tmp/tt-workshop-models.png', fullPage: true });

  // The bus's page: what its record lacks, and its chassis number to copy.
  await page.goto('/workshop/bus/bus-a');
  await expect(page.getByText('Engine not recorded')).toBeVisible();
  await expect(page.getByText('Chassis number has 16 characters')).toBeVisible();
  await page.getByRole('button', { name: 'Copy the chassis number' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('TESTVIN000000001');

  // A picture slot: the guide drawing, and its notes with the chassis number to copy.
  await page.getByRole('region', { name: 'Sections' }).getByRole('link', { name: /Photos & bolt maps \(8\)/ }).click();
  await page.getByRole('button', { name: /Engine oil & oil filter/ }).click();
  const notes = page.getByRole('region', { name: 'Notes' });
  await expect(notes).toContainText('paste the number into its search box');
  await notes.getByRole('button', { name: "Copy Bus 1's chassis number" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('TESTVIN000000001');
  const drawing = page.getByRole('img', { name: 'Engine oil & oil filter: guide drawing' });
  await expect(drawing).toBeVisible();
  expect(await drawing.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByText('This is a generic guide drawing, not your vehicle.', { exact: false })).toBeVisible();

  // The researched facts are found by the one search box.
  await page.goto('/workshop/search?q=ryco');
  await expect(page.getByRole('region', { name: /^Specs & service/ })).toContainText('RSK37C');
  expect(errors).toEqual([]);
});

test('a vehicle with no model page: Make its model page fills in its make, model and year', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-c');
  await expect(page.getByText('No model page covers this bus yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Make its model page' }).click();
  const sheet = page.getByRole('dialog', { name: 'New model page' });
  await expect(sheet.getByLabel('Make')).toHaveValue('Nissan');
  await expect(sheet.getByLabel('Model', { exact: true })).toHaveValue('Nv350');
  await expect(sheet.getByLabel('From year')).toHaveValue('2019');
  await expect(sheet.getByLabel('To year')).toHaveValue('2019');
  await sheet.getByLabel('Market (optional)').fill('General export');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  expect(server.tables.VehicleGuide[0]).toMatchObject({ make: 'Nissan', model: 'Nv350', year_from: 2019, year_to: 2019, market: 'General export' });
  // The bus now has its model page and its sections.
  const details = page.getByRole('region', { name: 'Vehicle details' });
  await expect(details).toContainText('Nissan Nv350 (2019)');
  await expect(details).not.toContainText('None yet');
  await expect(page.getByRole('region', { name: 'Sections' }).getByRole('link', { name: /Torque values/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('an administrator deletes a model page with everything on it; parts are unlinked and jobs stay', async ({ page }) => {
  const tables = emptyTables();
  tables.VehicleGuide.push({ id: 'g1', make: 'Toyota', model: 'Hiace', generation: 'H200', year_from: 2004, year_to: 2019, starter_key: 'toyota-hiace-h200' });
  tables.GuideFact.push({ id: 'f1', guide_id: 'g1', section: 'fluids', label: 'Engine oil', value: '7 L', status: 'unchecked' });
  tables.GuideDocument.push({ id: 'doc1', guide_id: 'g1', title: "Owner's manual", kind: 'owners_manual', file_uri: 'storage://private/uploads/2026-11/00000000-0000-4000-8000-000000000001.pdf' });
  tables.PartDiagram.push({ id: 'd1', guide_id: 'g1', title: 'Front brakes', drawing_key: 'front-brakes', pins: [] });
  tables.TorqueSpec.push({ id: 't1', guide_id: 'g1', system: 'wheels_brakes', item: 'Wheel nuts', nm: 100, status: 'unchecked' });
  tables.CatalogueGroup.push({ id: 'c1', guide_id: 'g1', category: 'Engine / Fuel / Tool', code: '1502', title: 'OIL FILTER', parts: [] });
  tables.Part[0].guide_ids = ['g1'];
  tables.WorkshopJob.push({ id: 'j1', vehicle_kind: 'bus', vehicle_id: 'bus-a', vehicle_name: 'Bus 1', guide_id: 'g1', title: 'Service', status: 'done', fix: 'Oil and filter', done_at: '2026-11-01T10:00:00.000Z', created_date: '2026-11-01T08:00:00.000Z' });
  const { errors, server } = await open(page, '/workshop/models', { tables });

  await page.getByRole('region', { name: 'Model pages' }).getByRole('button', { name: /Toyota Hiace/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Edit model page' });
  await expect(sheet).toContainText("Deleting it also deletes its 1 fact, 1 manual, 1 picture, 1 torque value, 1 maker's diagram, and unlinks 1 part from it. Jobs keep their records.");
  await sheet.getByRole('button', { name: 'Delete model page' }).click();
  await sheet.getByRole('button', { name: 'Tap again to delete' }).click();
  await expect(sheet).toBeHidden();
  for (const table of ['VehicleGuide', 'GuideFact', 'GuideDocument', 'PartDiagram', 'TorqueSpec', 'CatalogueGroup']) expect(server.tables[table], table).toEqual([]);
  expect(server.tables.Part[0].guide_ids).toEqual([]);
  expect(server.tables.WorkshopJob).toHaveLength(1);
  // The researched page can be added again.
  await expect(page.getByRole('region', { name: 'Ready to add' }).getByRole('button', { name: 'Add Toyota Hiace H200' })).toBeVisible();
  // The job's fix still shows on its bus, which no model page covers now.
  await page.goto('/workshop/bus/bus-a/troubleshooting');
  await expect(page.getByRole('region', { name: 'Past fixes' })).toContainText('Oil and filter');
  expect(errors).toEqual([]);
});

test('on a phone, Models and a vehicle with no model page fit', async ({ page }) => {
  const { errors } = await open(page, '/workshop/models', { width: 390, height: 844 });
  for (const [path, shot] of [['/workshop/models', 'models'], ['/workshop/bus/bus-c', 'no-model-page']]) {
    await page.goto(path);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByRole('main')).not.toBeEmpty();
    await settle(page);
    await noSideScroll(page);
    await page.screenshot({ path: `/tmp/tt-workshop-${shot}-phone.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
