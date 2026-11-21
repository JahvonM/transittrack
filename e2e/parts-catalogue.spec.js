import { test, expect } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';
import { memoryTables } from './helpers/memoryTables.js';

// The parts catalogue: on a Bus library page, the parts that fit the model
// and pictures with numbered pins; a pin shows its part, its stock and what
// can replace it (and whether that is on the shelf). Admin → Parts adds
// replacement numbers, warns of low stock and links parts to models.

// A tiny grey picture, served for the photo.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC', 'base64');
const PHOTO = 'https://ghqtest.supabase.co/storage/v1/object/public/public/uploads/2026-11/brakes.png';

function catalogue() {
  return {
    VehicleGuide: [{ id: 'g1', make: 'Toyota', model: 'Hiace', generation: 'H200', year_from: 2004, year_to: 2019, starter_key: 'toyota-hiace-h200' }],
    GuideFact: [],
    GuideDocument: [],
    Part: [
      { id: 'p1', part_name: 'Oil filter (genuine)', oem_number: '90915-YZZD2', quantity_in_stock: 0, min_stock: 2, guide_ids: ['g1'], bin_location: 'Shelf A1', unit_price: 12 },
      { id: 'p2', part_name: 'Ryco oil filter', aftermarket_number: 'Z418', quantity_in_stock: 6, bin_location: 'Shelf B2' },
      { id: 'p3', part_name: 'Front brake pads', oem_number: '04465-26420', quantity_in_stock: 4, min_stock: 1, guide_ids: ['g1'] },
    ],
    PartDiagram: [{ id: 'd1', guide_id: 'g1', title: 'Front brakes', system: 'Brakes', image_url: PHOTO, catalogue_link: 'https://partsouq.com/en/catalog/genuine/toyota', pins: [{ n: 1, x: 0.3, y: 0.4, part_id: 'p3', label: '' }] }],
    PartInterchange: [{ id: 'x1', part_number: '90915-YZZD2', alt_number: 'Z418', alt_brand: 'Ryco', kind: 'aftermarket', status: 'checked', checked_by: 'Mo Mechanic', source_name: 'Fred Auto parts listing', source_link: 'https://www.fredauto.com.au/oil-filter-refer-ryco-z418-fits-toyota-hiace-hilux' }],
  };
}

async function open(page, path, { role = 'admin', width = 1440, height = 900 } = {}) {
  const data = fleetData();
  Object.assign(data.tables.Vehicle[0], { make: 'Toyota', model: 'Hiace', year: 2016, vin: 'TESTVIN0000000001' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // One set of tables: Admin's first load reads the fixture's, later reads
  // and writes go to the in-memory stand-in.
  const tables = catalogue();
  Object.assign(data.tables, tables);
  await mockFleet(page, { role, data });
  const server = await memoryTables(page, tables, { who: role === 'admin' ? 'Admin Person' : 'Mo Mechanic' });
  await page.route(PHOTO, (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.setViewportSize({ width, height });
  await page.goto(path);
  return { errors, server };
}

test('a model page shows its parts, low stock and a replacement on the shelf; a pin shows its part', async ({ page }) => {
  const { errors, server } = await open(page, '/admin/library');
  await page.getByRole('button', { name: /Toyota Hiace/ }).click();

  const parts = page.getByRole('region', { name: 'Parts for this model' });
  await expect(parts).toContainText('2 parts, 1 low or out of stock');
  const genuine = parts.getByRole('listitem').filter({ hasText: 'Oil filter (genuine)' });
  await expect(genuine).toContainText('Out of stock');
  await expect(genuine).toContainText('Replacement on the shelf: Ryco oil filter (6)');

  // The picture: its pin opens the part.
  const pictures = page.getByRole('region', { name: 'Part pictures' });
  await pictures.getByRole('button', { name: /Front brakes/ }).click();
  const picture = page.getByRole('region', { name: 'Front brakes' });
  await expect(picture.getByRole('link', { name: /Maker's diagram/ })).toHaveAttribute('href', /^https:\/\/partsouq\.com\//);
  await picture.getByRole('button', { name: 'Pin 1: Front brake pads' }).click();
  await expect(picture).toContainText('04465-26420');
  await expect(picture).toContainText('4 in stock');
  await page.screenshot({ path: '/tmp/tt-catalogue-picture.png', fullPage: true });

  // Add a pin for the oil filter where the photo is tapped, and save.
  await picture.getByRole('button', { name: 'Edit pins' }).click();
  const photo = picture.getByRole('img', { name: 'Front brakes' });
  const box = await photo.boundingBox();
  await photo.click({ position: { x: box.width * 0.75, y: box.height * 0.5 } });
  await picture.getByLabel('Part', { exact: true }).selectOption('p1');
  await picture.getByLabel('Label (optional)').fill('Under the bonnet');
  await picture.getByRole('button', { name: 'Save pins' }).click();
  const saved = server.writes.find((w) => w.entity === 'PartDiagram' && w.op === 'update');
  expect(saved.data.pins).toHaveLength(2);
  expect(saved.data.pins[1]).toMatchObject({ n: 2, part_id: 'p1', label: 'Under the bonnet' });
  expect(saved.data.pins[1].x).toBeCloseTo(0.75, 1);
  expect(saved.data.pins[1].y).toBeCloseTo(0.5, 1);

  // The new pin shows the genuine filter, its checked replacement and the Ryco on the shelf.
  await picture.getByRole('button', { name: 'Pin 2: Oil filter (genuine)' }).click();
  await expect(picture).toContainText('Out of stock');
  await expect(picture).toContainText('Ryco Z418');
  await expect(picture).toContainText('On the shelf as Ryco oil filter (Shelf B2)');
  await expect(picture).toContainText('Checked');
  expect(errors).toEqual([]);
});

test('Admin → Parts: low stock, replacement numbers and the models a part fits', async ({ page }) => {
  const { errors, server } = await open(page, '/admin/parts');
  await expect(page.getByText('Ryco oil filter', { exact: true })).toBeVisible();

  // Low or out of stock.
  await page.getByRole('group', { name: 'Which parts' }).getByRole('button', { name: /Low or out of stock/ }).click();
  await expect(page.getByText('Oil filter (genuine)')).toBeVisible();
  await expect(page.getByText('Ryco oil filter', { exact: true })).toHaveCount(0);
  await page.getByRole('group', { name: 'Which parts' }).getByRole('button', { name: /^All/ }).click();

  // Searching a replacement's number finds the part it replaces.
  await page.getByRole('textbox', { name: 'Search parts' }).fill('z418');
  await expect(page.getByText('Oil filter (genuine)')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search parts' }).fill('');

  // Add a replacement number for the brake pads.
  // A part's card: the one holding its own delete button.
  const card = (name) => page.locator('div[class*="card"]').filter({ has: page.getByRole('button', { name: `Delete ${name}`, exact: true }) }).last();
  const pads = card('Front brake pads');
  await pads.getByRole('button', { name: /Replacements/ }).click();
  await pads.getByRole('button', { name: 'Add a replacement number' }).click();
  await pads.getByLabel('Number').fill('DB1735');
  await pads.getByLabel('Brand').fill('Bendix');
  await pads.getByLabel('Source', { exact: true }).fill('Bendix catalogue');
  await pads.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(pads).toContainText('Bendix DB1735');
  await expect(pads).toContainText('Not checked');
  expect(server.writes.find((w) => w.entity === 'PartInterchange' && w.op === 'create').data).toMatchObject({ part_number: '04465-26420', alt_number: 'DB1735', alt_brand: 'Bendix', kind: 'aftermarket' });
  await pads.getByRole('button', { name: 'It fits' }).click();
  await expect(pads).toContainText('Admin Person');

  // Details: link the Ryco filter to the Hiace, with a warning level and shelf.
  const ryco = card('Ryco oil filter');
  await ryco.getByRole('button', { name: 'Details' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Toyota Hiace (H200)').check();
  await dialog.getByLabel('Warn at (qty)').fill('3');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  expect(server.writes.find((w) => w.entity === 'Part' && w.op === 'update' && w.id === 'p2').data).toMatchObject({ guide_ids: ['g1'], min_stock: 3, bin_location: 'Shelf B2', part_name: 'Ryco oil filter' });
  expect(errors).toEqual([]);
});

test('the starter replacement numbers are added once from the library', async ({ page }) => {
  const { errors, server } = await open(page, '/admin/library');
  const ready = page.getByRole('region', { name: 'Ready to add' });
  const row = ready.getByRole('listitem').filter({ hasText: 'Replacement part numbers' });
  await row.getByRole('button', { name: 'Add these' }).click();
  const batch = server.writes.find((w) => w.entity === 'PartInterchange' && w.op === 'bulkCreate');
  // The Ryco Z418 one was already there.
  expect(batch.data.some((r) => r.alt_number === 'Z418')).toBe(false);
  expect(batch.data.every((r) => r.status === 'unchecked' && /^https:\/\//.test(r.source_link))).toBe(true);
  await expect(ready.getByRole('listitem').filter({ hasText: 'Replacement part numbers' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a mechanic has the library, with part pictures, in their dashboard', async ({ page }) => {
  const { errors } = await open(page, '/mechanic', { role: 'mechanic', width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Library' }).click();
  // It moved to the Workshop; the old view is one tap away for now.
  await expect(page.getByRole('note')).toContainText('The Bus library now lives in the Workshop');
  await expect(page.getByRole('note').getByRole('link', { name: 'Open in the Workshop' })).toHaveAttribute('href', '/workshop');
  await page.getByRole('button', { name: 'Old view' }).click();
  await page.getByRole('button', { name: /Toyota Hiace/ }).click();
  await expect(page.getByRole('region', { name: 'Part pictures' })).toContainText('Front brakes');
  // Mechanics don't delete.
  await expect(page.getByRole('button', { name: 'Delete page' })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: '/tmp/tt-catalogue-mechanic.png' });
  expect(errors).toEqual([]);
});

test('picture slots come with a guide drawing, the steps and the chassis number to copy; pins go on the drawing', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { errors, server } = await open(page, '/admin/library');
  const row = page.getByRole('region', { name: 'Ready to add' }).getByRole('listitem').filter({ hasText: 'Part picture slots' });
  // Front brakes is already there, so seven of the Hiace's eight areas.
  await expect(row).toContainText('7 areas');
  await row.getByRole('button', { name: 'Add these' }).click();
  const batch = server.writes.find((w) => w.entity === 'PartDiagram' && w.op === 'bulkCreate');
  expect(batch.data).toHaveLength(7);
  expect(batch.data.every((d) => d.guide_id === 'g1' && d.drawing_key && /^https:\/\/partsouq\.com\//.test(d.catalogue_link) && d.pins.length === 0)).toBe(true);
  await expect(page.getByRole('region', { name: 'Ready to add' })).not.toContainText('Part picture slots');

  await page.getByRole('button', { name: /Toyota Hiace/ }).click();
  const pictures = page.getByRole('region', { name: 'Part pictures' });
  await expect(pictures.getByRole('button', { name: /Cooling system/ })).toContainText('guide drawing');
  await pictures.getByRole('button', { name: /Engine oil & oil filter/ }).click();
  const picture = page.getByRole('region', { name: 'Engine oil & oil filter' });
  const drawing = picture.getByRole('img', { name: 'Engine oil & oil filter: guide drawing' });
  await expect(drawing).toBeVisible();
  expect(await drawing.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(picture).toContainText('paste the number into its search box');
  await expect(picture).toContainText('Guide drawing: generic, not your exact bus');

  // The maker's catalogue finds the bus by its chassis number.
  await picture.getByRole('button', { name: "Copy Bus 1's chassis number" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('TESTVIN0000000001');

  // A pin on the drawing, on the oil filter.
  await picture.getByRole('button', { name: 'Edit pins' }).click();
  const box = await drawing.boundingBox();
  await drawing.click({ position: { x: box.width * 0.18, y: box.height * 0.55 } });
  await picture.getByLabel('Part', { exact: true }).selectOption('p1');
  await picture.getByRole('button', { name: 'Save pins' }).click();
  const saved = server.writes.find((w) => w.entity === 'PartDiagram' && w.op === 'update');
  expect(saved.data.pins).toEqual([expect.objectContaining({ n: 1, part_id: 'p1' })]);
  await expect(picture.getByRole('button', { name: 'Pin 1: Oil filter (genuine)' })).toBeVisible();
  await page.screenshot({ path: '/tmp/tt-picture-drawing.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('on a phone, Add a part is at the top: a pasted catalogue line fills it in, and a number already in stock is restocked', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { errors, server } = await open(page, '/admin/parts', { width: 390, height: 844 });
  await page.route('**/api/functions/v1/integrations', (r) => r.fulfill({ json: { file_url: PHOTO } }));
  await expect(page.getByText('Ryco oil filter', { exact: true })).toBeVisible();
  // Names fit beside the photo: the stock buttons go under them.
  for (const name of ['Oil filter (genuine)', 'Ryco oil filter', 'Front brake pads']) {
    expect(await page.getByText(name, { exact: true }).evaluate((el) => el.scrollWidth <= el.clientWidth), name).toBe(true);
  }

  // On screen without scrolling past the parts.
  const add = page.getByRole('button', { name: 'Add a part' });
  await expect(add).toBeInViewport();
  await add.click();
  const sheet = page.getByRole('dialog', { name: 'Add a part' });

  // A row copied from a parts catalogue: number, name, count and price.
  await page.evaluate(() => navigator.clipboard.writeText('04152-YZZA1\tELEMENT KIT, OIL FILTER\t1\t$9.80'));
  await sheet.getByRole('button', { name: 'Paste a copied part number' }).click();
  await expect(sheet.getByLabel('Part number')).toHaveValue('04152-YZZA1');
  await expect(sheet.getByLabel('Name', { exact: true })).toHaveValue('Element kit, oil filter');
  await sheet.getByLabel('Photo of the part').setInputFiles({ name: 'filter.png', mimeType: 'image/png', buffer: PNG });
  await expect(sheet.getByRole('img', { name: 'The part' })).toHaveAttribute('src', /^blob:/);
  await sheet.getByRole('button', { name: 'One more' }).click();
  await sheet.getByRole('button', { name: 'One more' }).click();
  await sheet.getByLabel('Toyota Hiace (H200)').check();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: '/tmp/tt-quick-add.png' });
  await sheet.getByRole('button', { name: 'Add part', exact: true }).click();
  await expect(sheet.getByRole('status')).toContainText('Added Element kit, oil filter (3)');
  expect(server.writes.find((w) => w.entity === 'Part' && w.op === 'create').data).toMatchObject({
    part_name: 'Element kit, oil filter', oem_number: '04152-YZZA1', quantity_in_stock: 3, photo_url: PHOTO,
    guide_ids: ['g1'], vehicle_compatibility: 'Toyota Hiace',
  });

  // Ready for the next one, with the model still ticked. A number already on
  // the shelf, typed another way, is offered as a restock.
  await expect(sheet.getByLabel('Part number')).toHaveValue('');
  await expect(sheet.getByLabel('Toyota Hiace (H200)')).toBeChecked();
  await sheet.getByLabel('Part number').fill('90915 yzzd2');
  const known = sheet.getByRole('region', { name: 'Already in your parts' });
  await expect(known).toContainText('Oil filter (genuine) · Shelf A1');
  await expect(known).toContainText('Out of stock');
  await expect(sheet.getByRole('button', { name: 'Add as a new part' })).toBeVisible();
  await sheet.getByRole('button', { name: 'One more' }).click();
  await known.getByRole('button', { name: 'Add 2 to its stock' }).click();
  await expect(sheet.getByRole('status')).toContainText('Added 2 to Oil filter (genuine): 2 in stock');
  expect(server.writes.find((w) => w.entity === 'Part' && w.op === 'update' && w.id === 'p1').data).toEqual({ quantity_in_stock: 2 });
  expect(server.writes.filter((w) => w.entity === 'Part' && w.op === 'create')).toHaveLength(1);

  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText('Element kit, oil filter', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the parts kiosk (/parts) on a tablet: no menus, the dark app look, and adding or restocking without reloading the list', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { errors, server } = await open(page, '/parts', { role: 'mechanic', width: 1024, height: 768 });
  await expect(page.getByRole('heading', { name: 'Parts', level: 1 })).toBeVisible();
  // No app menus: just the form, what was added here, and sign out.
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains('tt-future'))).toBe(true);
  // "Add to Home Screen" here makes a Parts icon that opens /parts.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/parts.webmanifest?v=parts1');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Parts');
  const form = page.getByRole('region', { name: 'Add a part' });
  const log = page.getByRole('complementary', { name: 'Added on this screen' });
  await expect(log).toContainText('Nothing yet.');

  await page.evaluate(() => navigator.clipboard.writeText('17801-30040 ELEMENT, AIR CLEANER FILTER'));
  await form.getByRole('button', { name: 'Paste a copied part number' }).click();
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Element, air cleaner filter');
  await form.getByRole('button', { name: 'One more' }).click();
  await form.getByRole('button', { name: 'Add part', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('Added Element, air cleaner filter (2). Add the next one.');
  expect(server.writes.find((w) => w.entity === 'Part' && w.op === 'create').data).toMatchObject({ part_name: 'Element, air cleaner filter', oem_number: '17801-30040', quantity_in_stock: 2 });

  // A part already in stock, typed another way, is restocked from the main button.
  const number = form.getByLabel('Part number', { exact: true });
  await number.fill('z 418');
  const known = form.getByRole('region', { name: 'Already in your parts' });
  await expect(known).toContainText('Ryco oil filter · Shelf B2');
  await expect(known).toContainText('6 in stock');
  await form.getByRole('button', { name: 'Add 1 to its stock' }).click();
  await expect(form.getByRole('status')).toContainText('Added 1 to Ryco oil filter: 7 in stock');
  // Straight away again: the new count is known without loading the list.
  await number.fill('Z418');
  await expect(known).toContainText('7 in stock');
  await form.getByRole('button', { name: 'Add 1 to its stock' }).click();
  await expect(form.getByRole('status')).toContainText('Added 1 to Ryco oil filter: 8 in stock');
  expect(server.writes.filter((w) => w.entity === 'Part' && w.op === 'update' && w.id === 'p2').map((w) => w.data)).toEqual([{ quantity_in_stock: 7 }, { quantity_in_stock: 8 }]);
  expect(server.reads.filter((r) => r.entity === 'Part' && r.op === 'list')).toHaveLength(1);

  await expect(log.getByRole('listitem')).toHaveCount(3);
  await expect(log.getByRole('listitem').first()).toContainText('+1 to stock, now 8');
  await expect(log.getByRole('listitem').last()).toContainText('New part, 2 in stock');
  await expect(log.getByRole('link', { name: 'See all parts' })).toHaveAttribute('href', '/workshop/parts');
  await page.screenshot({ path: '/tmp/tt-parts-kiosk.png' });
  expect(errors).toEqual([]);
});

test('the parts kiosk on a phone: one screen with Add always in view, a photo uploading in the background, and no Admin download', async ({ page }) => {
  const adminCode = [];
  const photoDownloads = [];
  page.on('request', (r) => {
    if (/\/assets\/Admin-[\w-]+\.js$/.test(new URL(r.url()).pathname)) adminCode.push(r.url());
    if (r.url() === PHOTO) photoDownloads.push(r.url());
  });
  const { errors, server } = await open(page, '/parts', { width: 390, height: 844 });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/functions/v1/integrations', async (r) => { await held; await r.fulfill({ json: { file_url: PHOTO } }); });

  const form = page.getByRole('region', { name: 'Add a part' });
  const add = form.getByRole('button', { name: 'Add part', exact: true });
  await expect(add).toBeVisible();
  // Everything fits: no scrolling, and Add sits below the last field.
  const fits = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    await expect(add).toBeInViewport();
    const models = await form.getByRole('group', { name: 'Fits these bus models' }).boundingBox();
    const button = await add.boundingBox();
    expect(models.y + models.height).toBeLessThanOrEqual(button.y);
  };
  await fits();
  await page.screenshot({ path: '/tmp/tt-parts-kiosk-phone.png' });

  // The photo shows from the phone at once and uploads in the background.
  await form.getByLabel('Photo of the part').setInputFiles({ name: 'blade.png', mimeType: 'image/png', buffer: PNG });
  await expect(form.getByRole('img', { name: 'The part' })).toHaveAttribute('src', /^blob:/);
  const number = form.getByLabel('Part number', { exact: true });
  const name = form.getByLabel('Name', { exact: true });
  await number.fill('WB-1234');
  await name.fill('Wiper blade');
  await form.locator('label', { hasText: 'Toyota Hiace (H200)' }).click();
  await expect(form.getByLabel('Toyota Hiace (H200)')).toBeChecked();
  // Tapped twice while the photo is still uploading: it waits, with the fields locked.
  await add.dblclick();
  await expect(form.getByRole('status')).toContainText('Photo uploading…');
  await expect(name).toBeDisabled();
  expect(server.writes.filter((w) => w.entity === 'Part' && w.op === 'create')).toHaveLength(0);
  release();
  await expect(form.getByRole('status')).toContainText('Added Wiper blade (1). Add the next one.');
  const creates = () => server.writes.filter((w) => w.entity === 'Part' && w.op === 'create');
  expect(creates()).toHaveLength(1);
  expect(creates()[0].data).toMatchObject({ part_name: 'Wiper blade', oem_number: 'WB-1234', quantity_in_stock: 1, photo_url: PHOTO, guide_ids: ['g1'] });
  // Ready for the next one, with the model still ticked.
  await expect(number).toHaveValue('');
  await expect(form.getByLabel('Toyota Hiace (H200)')).toBeChecked();

  // The rarer fields are in a sheet; the keyboard's Go key on Name adds the part.
  await form.getByRole('button', { name: 'More details' }).click();
  const more = page.getByRole('dialog', { name: 'More details' });
  await more.getByLabel('Kept at').fill('Shelf C3');
  await page.screenshot({ path: '/tmp/tt-parts-kiosk-phone-more.png' });
  await more.getByRole('button', { name: 'Done' }).click();
  await expect(form.getByRole('button', { name: 'More details · 1' })).toBeVisible();
  await number.fill('WB-5678');
  await name.fill('Rear wiper blade');
  await name.press('Enter');
  await expect(form.getByRole('status')).toContainText('Added Rear wiper blade (1)');
  expect(creates()[1].data).toMatchObject({ part_name: 'Rear wiper blade', bin_location: 'Shelf C3' });

  // A number already on the shelf: the main button restocks it, Go does the same.
  await number.fill('90915-YZZD2');
  await expect(form.getByRole('region', { name: 'Already in your parts' })).toContainText('Oil filter (genuine) · Shelf A1');
  await expect(form.getByRole('button', { name: 'Add 1 to its stock' })).toBeInViewport();
  await expect(form.getByRole('button', { name: 'Add as a new part' })).toBeVisible();
  await page.screenshot({ path: '/tmp/tt-parts-kiosk-phone-match.png' });
  await name.press('Enter');
  await expect(form.getByRole('status')).toContainText('Added 1 to Oil filter (genuine): 1 in stock');
  expect(server.writes.find((w) => w.entity === 'Part' && w.op === 'update' && w.id === 'p1').data).toEqual({ quantity_in_stock: 1 });

  // What was added here, from the header.
  await page.getByRole('button', { name: /^Added on this screen/ }).click();
  const log = page.getByRole('dialog', { name: 'Added on this screen' });
  await expect(log.getByRole('listitem')).toHaveCount(3);
  await expect(log.getByRole('link', { name: 'See all parts' })).toHaveAttribute('href', '/workshop/parts');
  await page.screenshot({ path: '/tmp/tt-parts-kiosk-phone-log.png' });
  await page.keyboard.press('Escape');

  // A shorter phone screen still fits.
  await page.setViewportSize({ width: 390, height: 664 });
  await fits();

  expect(adminCode).toEqual([]);
  expect(photoDownloads).toEqual([]);
  expect(server.reads.filter((r) => r.entity === 'Part' && r.op === 'list')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('the parts kiosk fits a phone, and is linked from Parts', async ({ page }) => {
  const { errors } = await open(page, '/admin/parts', { width: 390, height: 844 });
  await page.getByRole('link', { name: /Parts kiosk/ }).click();
  await expect(page).toHaveURL(/\/parts$/);
  await expect(page.getByRole('heading', { name: 'Parts', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Add a part' }).getByLabel('Part number', { exact: true })).toBeVisible();
  // Measured once the new screen has finished sliding in.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('the parts kiosk sends a signed-out visitor to sign in, then back to it; other accounts go to their own screen', async ({ page }) => {
  await mockFleet(page, { signedIn: false });
  await page.goto('/parts');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fparts$/);

  const passenger = await page.context().newPage();
  await mockFleet(passenger, { role: 'staff' });
  await passenger.goto('/parts');
  await expect(passenger).not.toHaveURL(/\/parts$/);
  await expect(passenger.getByRole('region', { name: 'Add a part' })).toHaveCount(0);
});
