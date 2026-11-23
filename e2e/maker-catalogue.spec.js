import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';
import { memoryTables } from './helpers/memoryTables.js';

// The maker's catalogue on a Bus library page: Toyota's own list of diagrams
// and the parts on each, pasted in from Partsouq (the drawings are not kept;
// each diagram links to Partsouq), searched, and added to stock on purpose.

const TOYOTA_INDEX = fs.readFileSync(new URL('../src/lib/__tests__/fixtures/partsouq-toyota-index.txt', import.meta.url), 'utf8');
const OIL_FILTER_PARTS = [
  'No.\tPart number\tName\tQty\tInfo',
  '15601\t90915-YZZD2\tELEMENT KIT, OIL FILTER\t1\t2KD-FTV',
  '90430A\t90430-12031\tGASKET\t1',
].join('\n');
const LINK = 'https://partsouq.com/en/catalog/genuine/unit?c=Toyota&number=1502';

function tables() {
  return {
    VehicleGuide: [{ id: 'g1', make: 'Toyota', model: 'Hiace', generation: 'H200', year_from: 2004, year_to: 2019, starter_key: 'toyota-hiace-h200' }],
    GuideFact: [], GuideDocument: [], PartDiagram: [], PartInterchange: [],
    Part: [{ id: 'p1', part_name: 'Oil filter (genuine)', oem_number: '90915-YZZD2', quantity_in_stock: 3, bin_location: 'Shelf A1', guide_ids: ['g1'] }],
    CatalogueGroup: [],
  };
}

async function open(page, path, { role = 'admin', width = 1440, height = 900, groups = [] } = {}) {
  const data = fleetData();
  Object.assign(data.tables.Vehicle[0], { name: 'St.George', make: 'Toyota', model: 'Hiace', year: 2017, vin: 'TESTVIN0000000001' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t = tables();
  t.CatalogueGroup.push(...groups);
  Object.assign(data.tables, t);
  await mockFleet(page, { role, data });
  const server = await memoryTables(page, t, { who: role === 'admin' ? 'Admin Person' : 'Mo Mechanic' });
  await page.setViewportSize({ width, height });
  await page.goto(path);
  return { errors, server };
}

test("paste Toyota's list of diagrams and a diagram's parts, search them, and add one to stock", async ({ page }) => {
  const { errors, server } = await open(page, '/admin/library');
  await page.getByRole('button', { name: /Toyota Hiace/ }).click();
  const catalogue = page.getByRole('region', { name: "Maker's catalogue" });
  await catalogue.getByRole('button', { name: 'Open the catalogue' }).click();
  await expect(catalogue).toContainText('No diagrams yet');

  // The list of diagrams, as copied from Partsouq.
  await catalogue.getByRole('button', { name: 'Paste a list of diagrams' }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Looked up for')).toHaveValue('bus-a');
  await dialog.getByLabel('Model code (optional)').fill('KDH212R-JEMDY');
  await dialog.getByLabel('Copied text').fill(TOYOTA_INDEX);
  await expect(dialog.getByRole('status')).toContainText('Found 29 diagrams in Engine / Fuel / Tool. 29 new.');
  await dialog.getByRole('button', { name: 'Add 29 diagrams' }).click();
  await expect(dialog).toHaveCount(0);
  const made = server.writes.filter((w) => w.entity === 'CatalogueGroup' && w.op === 'bulkCreate').flatMap((w) => w.data);
  expect(made).toHaveLength(29);
  expect(made.find((g) => g.code === '1502')).toMatchObject({ guide_id: 'g1', vehicle_id: 'bus-a', model_code: 'KDH212R-JEMDY', category: 'Engine / Fuel / Tool', title: 'OIL FILTER', parts: [] });
  await expect(catalogue).toContainText('Parts pasted for 0 of 29 diagrams.');

  // One diagram's parts, with its page on Partsouq.
  await catalogue.getByRole('button', { name: 'Paste parts for 1502 OIL FILTER' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Copied text').fill(OIL_FILTER_PARTS);
  await dialog.getByLabel(/This diagram on Partsouq/).fill(LINK);
  await expect(dialog.getByRole('status')).toContainText('Found 2 parts');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  const saved = server.writes.find((w) => w.entity === 'CatalogueGroup' && w.op === 'update').data;
  expect(saved).toEqual({ link: LINK, parts: [
    { ref: '15601', number: '90915-YZZD2', name: 'Element kit, oil filter', qty: '1', info: '2KD-FTV' },
    { ref: '90430A', number: '90430-12031', name: 'Gasket', qty: '1', info: '' },
  ] });
  await expect(catalogue).toContainText('Parts pasted for 1 of 29 diagrams.');
  await expect(catalogue.getByRole('link', { name: 'Open 1502 OIL FILTER on Partsouq' })).toHaveAttribute('href', LINK);

  // Its parts: the one on the shelf shows its stock, the other can be added.
  await catalogue.getByRole('button', { name: /1502 OIL FILTER/ }).first().click();
  await expect(catalogue).toContainText('3 in stock');
  await expect(catalogue).toContainText('Shelf A1');
  await page.screenshot({ path: '/tmp/tt-maker-catalogue.png', fullPage: true });

  // Search finds a part by its number however it's typed.
  await catalogue.getByRole('textbox', { name: 'Search the catalogue' }).fill('90430 12031');
  const found = catalogue.getByRole('list', { name: 'Found in the catalogue' });
  await expect(found).toContainText('Gasket');
  await expect(found).toContainText('1502 OIL FILTER');
  await found.getByRole('button', { name: 'Add to stock' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a part' });
  await expect(sheet.getByLabel('Part number')).toHaveValue('90430-12031');
  await expect(sheet.getByLabel('Name', { exact: true })).toHaveValue('Gasket');
  await expect(sheet.getByLabel('Toyota Hiace (H200)')).toBeChecked();
  await sheet.getByRole('button', { name: 'Add part', exact: true }).click();
  await expect(sheet.getByRole('status')).toContainText('Added Gasket (1)');
  expect(server.writes.find((w) => w.entity === 'Part' && w.op === 'create').data).toMatchObject({ part_name: 'Gasket', oem_number: '90430-12031', guide_ids: ['g1'] });
  expect(errors).toEqual([]);
});

test("a mechanic pastes a diagram's parts on a phone", async ({ page }) => {
  const groups = [{ id: 'c1', guide_id: 'g1', category: 'Engine / Fuel / Tool', code: '2302', title: 'FUEL FILTER', parts: [], sort_order: 10 }];
  const { errors, server } = await open(page, '/mechanic', { role: 'mechanic', width: 390, height: 844, groups });
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'Old view' }).click();
  await page.getByRole('button', { name: /Toyota Hiace/ }).click();
  const catalogue = page.getByRole('region', { name: "Maker's catalogue" });
  await catalogue.getByRole('button', { name: 'Open the catalogue' }).click();
  await catalogue.getByRole('button', { name: 'Paste parts for 2302 FUEL FILTER' }).click();
  const dialog = page.getByRole('dialog');
  // A phone copies a table one cell per line.
  await dialog.getByLabel('Copied text').fill('23390\n23390-30350\nELEMENT ASSY, FUEL FILTER\n1');
  await expect(dialog.getByRole('status')).toContainText('Found 1 part');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  expect(server.writes.find((w) => w.entity === 'CatalogueGroup' && w.op === 'update' && w.id === 'c1').data.parts).toEqual([
    { ref: '23390', number: '23390-30350', name: 'Element assy, fuel filter', qty: '1', info: '' },
  ]);
  // Mechanics don't delete diagrams.
  await expect(catalogue.getByRole('button', { name: /^Delete / })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: '/tmp/tt-maker-catalogue-phone.png', fullPage: true });
  expect(errors).toEqual([]);
});
