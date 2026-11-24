// What the old Bus library and Admin › Parts screens did, now in the
// Workshop: an administrator deletes a maker's diagram (a photo linked to it
// stays, unlinked); a mechanic pastes a diagram's parts on a phone; a part's
// page adds a replacement number, ticks its models and removes its photo;
// and a part that is out shows the replacement on the shelf in its lists
// and on a picture's pins, which open the part.
import { expect, test } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';
import { memoryTables } from './helpers/memoryTables.js';
import { noSideScroll, settle } from './helpers/workshopScan.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC', 'base64');
const PHOTO = 'https://ghqtest.supabase.co/storage/v1/object/public/public/uploads/2026-11/engine-bay.png';
const PART_PHOTO = 'https://ghqtest.supabase.co/storage/v1/object/public/public/uploads/2026-11/oil-filter.png';

function tables() {
  return {
    VehicleGuide: [{ id: 'g1', make: 'Toyota', model: 'Hiace', generation: 'H200', year_from: 2004, year_to: 2019 }],
    GuideFact: [], GuideDocument: [], TorqueSpec: [], WorkshopVehicle: [], WorkshopJob: [], WorkshopJobPart: [],
    Part: [
      { id: 'p1', part_name: 'Oil filter (genuine)', oem_number: '90915-YZZD2', quantity_in_stock: 0, min_stock: 2, guide_ids: ['g1'], bin_location: 'Shelf A1', photo_url: PART_PHOTO },
      { id: 'p2', part_name: 'Ryco oil filter', aftermarket_number: 'Z418', quantity_in_stock: 6, bin_location: 'Shelf B2', guide_ids: [] },
      { id: 'p3', part_name: 'Front brake pads', oem_number: '04465-26420', quantity_in_stock: 4, min_stock: 1, guide_ids: ['g1'] },
    ],
    PartInterchange: [{ id: 'x1', part_number: '90915-YZZD2', alt_number: 'Z418', alt_brand: 'Ryco', kind: 'aftermarket', status: 'checked', checked_by: 'Mo Mechanic', source_name: 'Ryco catalogue' }],
    CatalogueGroup: [
      { id: 'c1', guide_id: 'g1', vehicle_id: 'bus-a', category: 'Engine / Fuel / Tool', code: '1502', title: 'OIL FILTER', parts: [] },
      { id: 'c2', guide_id: 'g1', vehicle_id: 'bus-a', category: 'Engine / Fuel / Tool', code: '1701', title: 'AIR CLEANER', parts: [] },
    ],
    PartDiagram: [
      { id: 'd1', guide_id: 'g1', title: 'Engine bay', system: 'Engine', image_url: PHOTO, pins: [{ n: 1, x: 0.3, y: 0.4, part_id: 'p1', torque_id: '', ref: '', label: '' }], sort_order: 10 },
      { id: 'd2', guide_id: 'g1', title: '1502 OIL FILTER', system: 'Engine / Fuel / Tool', image_url: PHOTO, catalogue_group_id: 'c1', pins: [], sort_order: 20 },
    ],
  };
}

async function open(page, path, { role = 'admin', width = 1024, height = 768 } = {}) {
  const data = fleetData();
  Object.assign(data.tables.Vehicle[0], { make: 'Toyota', model: 'Hiace', year: 2016, vin: 'TESTVIN0000000001', engine: '2KD-FTV' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t = tables();
  Object.assign(data.tables, t);
  await mockFleet(page, { role, data });
  const server = await memoryTables(page, t, { who: role === 'admin' ? 'Admin Person' : 'Mo Mechanic' });
  await page.route(PHOTO, (r) => r.fulfill({ body: PNG, contentType: 'image/png' }));
  await page.route(PART_PHOTO, (r) => r.fulfill({ body: PNG, contentType: 'image/png' }));
  await page.setViewportSize({ width, height });
  await page.goto(path);
  return { errors, server };
}

test("an administrator deletes a maker's diagram; its photo stays, unlinked, and a mechanic has no Delete", async ({ page, browser }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a/group/c1');
  await expect(page.getByRole('heading', { name: '1502 OIL FILTER' })).toBeVisible();
  await page.getByRole('button', { name: 'Paste parts' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Paste parts' });
  await sheet.getByRole('button', { name: 'Delete this diagram' }).click();
  await sheet.getByRole('button', { name: 'Tap again to delete' }).click();
  await expect(sheet).toBeHidden();
  // Back on its category, which still has its other diagram.
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/c\/engine-fuel-tool$/);
  await expect(page.getByRole('link', { name: /1701 AIR CLEANER/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /1502 OIL FILTER/ })).toHaveCount(0);
  expect(server.tables.CatalogueGroup.map((g) => g.id)).toEqual(['c2']);
  expect(server.writes.find((w) => w.entity === 'PartDiagram' && w.op === 'update')).toMatchObject({ id: 'd2', data: { catalogue_group_id: '' } });
  expect(server.writes.filter((w) => w.entity === 'PartDiagram' && w.op === 'delete')).toEqual([]);

  // The photo is still under Photos & bolt maps, no longer the maker's.
  await page.goto('/workshop/bus/bus-a/maps');
  const photo = page.getByRole('button', { name: /1502 OIL FILTER/ });
  await expect(photo).toBeVisible();
  await expect(photo).not.toContainText("Maker's 1502");
  expect(errors).toEqual([]);

  // A mechanic pastes parts, but can't delete the diagram.
  const mechanic = await browser.newPage();
  const other = await open(mechanic, '/workshop/bus/bus-a/group/c2', { role: 'mechanic' });
  await mechanic.getByRole('button', { name: 'Paste parts' }).first().click();
  const theirs = mechanic.getByRole('dialog', { name: 'Paste parts' });
  await expect(theirs.getByRole('textbox', { name: 'Copied text' })).toBeVisible();
  await expect(theirs.getByRole('button', { name: 'Delete this diagram' })).toHaveCount(0);
  expect(other.errors).toEqual([]);
  await mechanic.close();
});

test("a mechanic pastes a diagram's parts on a phone", async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a/group/c1', { role: 'mechanic', width: 390, height: 844 });
  const table = page.getByRole('region', { name: 'Parts on this diagram' });
  await expect(table).toContainText('No parts listed for this diagram yet.');
  await table.getByRole('button', { name: 'Paste parts' }).click();
  const sheet = page.getByRole('dialog', { name: 'Paste parts' });
  // A phone copies a table one cell per line.
  await sheet.getByLabel('Copied text').fill('15601\n90915-YZZD2\nELEMENT KIT, OIL FILTER\n1\n90430\n90430-12031\nGASKET\n1');
  await expect(sheet.getByRole('status')).toContainText('Found 2 parts.');
  await settle(page);
  await noSideScroll(page);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  expect(server.writes.find((w) => w.entity === 'CatalogueGroup' && w.op === 'update')).toMatchObject({ id: 'c1', data: { parts: [expect.objectContaining({ number: '90915-YZZD2' }), expect.objectContaining({ number: '90430-12031' })] } });
  await expect(table.getByRole('listitem')).toHaveCount(2);
  // The genuine filter is out, so it shows as out; the gasket isn't stocked.
  await expect(table.getByRole('listitem').filter({ hasText: '90915-YZZD2' })).toContainText('Out of stock');
  await expect(table.getByRole('button', { name: 'Add 90430-12031 to stock' })).toBeVisible();
  await settle(page);
  await noSideScroll(page);
  await page.screenshot({ path: '/tmp/tt-workshop-paste-phone.png', fullPage: true });
  expect(errors).toEqual([]);
});

test("a part's page: add a replacement number, tick the models it fits, and remove its photo", async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/parts/p3');
  const reps = page.getByRole('region', { name: 'Replacements' });
  await reps.getByRole('button', { name: 'Add a replacement number' }).click();
  await reps.getByLabel('Number').fill('DB1735');
  await reps.getByLabel('Brand').fill('Bendix');
  await reps.getByLabel('Source', { exact: true }).fill('Bendix catalogue');
  await reps.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(reps).toContainText('Bendix DB1735');
  await expect(reps).toContainText('Not checked');
  expect(server.writes.find((w) => w.entity === 'PartInterchange' && w.op === 'create').data).toMatchObject({ part_number: '04465-26420', alt_number: 'DB1735', alt_brand: 'Bendix', kind: 'aftermarket' });
  await reps.getByRole('button', { name: 'It fits' }).click();
  await expect(reps).toContainText('Admin Person');

  // The Ryco filter fits the Hiace too.
  await page.goto('/workshop/parts/p2');
  await expect(page.getByRole('region', { name: 'Fits these models' })).toContainText('No models ticked yet.');
  await page.getByRole('button', { name: 'Edit details' }).click();
  let sheet = page.getByRole('dialog', { name: 'Edit part' });
  await sheet.getByLabel('Toyota Hiace (H200)').check();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  expect(server.writes.filter((w) => w.entity === 'Part' && w.op === 'update').at(-1)).toMatchObject({ id: 'p2', data: { guide_ids: ['g1'] } });
  const fits = page.getByRole('region', { name: 'Fits these models' });
  await expect(fits).toContainText('Toyota Hiace (H200)');
  await expect(fits.getByRole('link', { name: 'Bus 1' })).toBeVisible();

  // The genuine filter's photo comes off with a second tap; a new one can be taken.
  await page.goto('/workshop/parts/p1');
  await expect(page.getByRole('img', { name: 'Oil filter (genuine)' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit details' }).click();
  sheet = page.getByRole('dialog', { name: 'Edit part' });
  await sheet.getByRole('button', { name: 'Remove photo' }).click();
  expect(server.writes.filter((w) => w.entity === 'Part' && w.op === 'update' && w.id === 'p1')).toEqual([]);
  await sheet.getByRole('button', { name: 'Tap again to remove' }).click();
  await expect(sheet.getByRole('button', { name: /Remove photo|Tap again to remove/ })).toHaveCount(0);
  expect(server.writes.filter((w) => w.entity === 'Part' && w.op === 'update' && w.id === 'p1')).toEqual([expect.objectContaining({ data: { photo_url: '' } })]);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('img', { name: 'Oil filter (genuine)' })).toHaveCount(0);
  await expect(page.getByText('Take a photo')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a part that is out shows the replacement on the shelf in its lists and on a picture, whose pin opens the part', async ({ page }) => {
  const { errors } = await open(page, '/workshop/bus/bus-a/parts', { role: 'mechanic' });
  const genuine = page.getByRole('list', { name: 'Parts that fit' }).getByRole('listitem').filter({ hasText: 'Oil filter (genuine)' });
  await expect(genuine).toContainText('Out of stock');
  await expect(genuine).toContainText('Replacement on the shelf: Ryco oil filter (6)');
  // A part with enough on the shelf names none.
  await expect(page.getByRole('list', { name: 'Parts that fit' }).getByRole('listitem').filter({ hasText: 'Front brake pads' })).not.toContainText('Replacement on the shelf');
  await page.goto('/workshop/parts');
  await expect(page.getByRole('list', { name: 'Parts' }).getByRole('listitem').filter({ hasText: 'Oil filter (genuine)' })).toContainText('Replacement on the shelf: Ryco oil filter (6)');

  await page.goto('/workshop/bus/bus-a/maps/d1');
  const row = page.getByRole('region', { name: 'Numbers on this picture' }).getByRole('listitem').filter({ hasText: 'Oil filter (genuine)' });
  await expect(row).toContainText('90915-YZZD2 · Shelf A1');
  await expect(row).toContainText('Out of stock');
  await expect(row).toContainText('Replacement on the shelf: Ryco oil filter (6, Shelf B2)');
  await page.screenshot({ path: '/tmp/tt-workshop-pin-replacement.png' });
  await row.getByRole('link', { name: 'Open the part: Oil filter (genuine)' }).click();
  await expect(page).toHaveURL(/\/workshop\/parts\/p1$/);
  await expect(page.getByText('Replacement on the shelf')).toBeVisible();
  expect(errors).toEqual([]);
});

test('on a phone, a picture with a pinned part fits', async ({ page }) => {
  const { errors } = await open(page, '/workshop/bus/bus-a/maps/d1', { role: 'mechanic', width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Numbers on this picture' })).toContainText('Replacement on the shelf');
  await settle(page);
  await noSideScroll(page);
  await page.screenshot({ path: '/tmp/tt-workshop-pin-replacement-phone.png', fullPage: true });
  expect(errors).toEqual([]);
});
