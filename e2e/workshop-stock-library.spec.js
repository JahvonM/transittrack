import { test, expect } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';
import { memoryTables } from './helpers/memoryTables.js';

// Parts, Specs & service and Manuals moved into the Workshop (/workshop): a
// Parts page with a page for each part (big − and + for the stock, its
// shelf, numbers, models and replacements); on each vehicle its specs and
// service schedule (It's right / It's wrong), the parts that fit, and its
// manuals. Admin's Parts and Bus library, and the mechanic's tabs, open the
// Workshop; the old screens stay one tap away for one release.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC', 'base64');
const PHOTO = 'https://ghqtest.supabase.co/storage/v1/object/public/public/uploads/2026-11/part.png';
const SIGNED = 'https://ghqtest.supabase.co/storage/v1/object/sign/private/uploads/2026-11/00000000-0000-4000-8000-000000000001.pdf?token=test';
const NEW_FILE = 'storage://private/uploads/2026-11/00000000-0000-4000-8000-000000000002.pdf';

function tables() {
  return {
    VehicleGuide: [
      { id: 'g1', make: 'Toyota', model: 'Hiace', generation: 'H200', year_from: 2004, year_to: 2019 },
      { id: 'g2', make: 'BMW', model: 'X3', year_from: 2010, year_to: 2017 },
    ],
    WorkshopVehicle: [{ id: 'car-1', name: 'BMW X3', make: 'BMW', model: 'X3', year: 2013, engine: '2.0 diesel (N47)' }],
    TorqueSpec: [],
    PartDiagram: [],
    CatalogueGroup: [],
    GuideFact: [
      { id: 'f1', guide_id: 'g1', section: 'fluids', label: 'Engine oil with filter', value: '7.0 litres', applies_to: '2KD-FTV', status: 'unchecked', checked_by: '', source_name: "Owner's manual", source_link: 'https://example.com/hiace-manual', sort_order: 10 },
      { id: 'f2', guide_id: 'g1', section: 'tyres', label: 'Tyre pressure, front', value: '350 kPa', status: 'checked', checked_by: 'Mo Mechanic', checked_at: '2026-11-01T10:00:00Z', sort_order: 20 },
      { id: 'f3', guide_id: 'g1', section: 'service', label: 'Engine oil and filter', value: 'Change', interval_km: 5000, interval_months: 6, status: 'wrong', checked_by: 'Mo Mechanic', sort_order: 30 },
    ],
    GuideDocument: [
      { id: 'doc-1', guide_id: 'g1', title: "Owner's manual 2017", kind: 'owners_manual', notes: 'Fuses, tyre pressures', file_uri: 'storage://private/uploads/2026-11/00000000-0000-4000-8000-000000000001.pdf', file_name: 'hiace-2017.pdf' },
    ],
    Part: [
      { id: 'p1', part_name: 'Wheel nut', oem_number: '90942-01058', quantity_in_stock: 12, bin_location: 'Shelf C1', guide_ids: ['g1'] },
      { id: 'p2', part_name: 'Oil filter (genuine)', oem_number: '90915-YZZD2', quantity_in_stock: 1, min_stock: 2, bin_location: 'Shelf A1', guide_ids: ['g1'] },
      { id: 'p3', part_name: 'Ryco oil filter', aftermarket_number: 'Z418', quantity_in_stock: 4, bin_location: 'Shelf A2', guide_ids: [] },
    ],
    PartInterchange: [{ id: 'i1', part_number: '90915-YZZD2', alt_number: 'Z418', alt_brand: 'Ryco', kind: 'aftermarket', status: 'unchecked', checked_by: '', source_name: 'Ryco catalogue' }],
  };
}

async function open(page, path, { role = 'mechanic', width = 1024, height = 768 } = {}) {
  const data = fleetData();
  Object.assign(data.tables.Vehicle[0], { name: 'St.George', make: 'Toyota', model: 'Hiace', year: 2017, engine: '2KD-FTV 2.5 diesel turbo', transmission: 'Manual', vin: 'TESTVIN0000000001' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t = tables();
  Object.assign(data.tables, t);
  await mockFleet(page, { role, data });
  const server = await memoryTables(page, t, { who: role === 'admin' ? 'Admin Person' : 'Mo Mechanic' });
  const uploads = [];
  // Uploads arrive as a form; a manual's link is asked for with action "sign".
  await page.route('**/api/functions/v1/integrations', (r) => {
    if ((r.request().headers()['content-type'] || '').startsWith('multipart/form-data')) {
      uploads.push(r.request().url());
      return r.fulfill({ json: { file_url: PHOTO, file_uri: NEW_FILE } });
    }
    const body = r.request().postDataJSON();
    if (body?.action === 'sign') return r.fulfill({ json: { signed_url: SIGNED } });
    return r.fulfill({ status: 400, json: { error: 'unexpected' } });
  });
  await page.route(PHOTO, (r) => r.fulfill({ body: PNG, contentType: 'image/png' }));
  await page.setViewportSize({ width, height });
  await page.goto(path);
  return { errors, server, uploads };
}

const noSideScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));

test('Parts in the Workshop: find a part by a replacement number, see what is low, and count stock with big buttons', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop');
  const stock = page.getByRole('region', { name: 'Stock' });
  await expect(stock.getByRole('link', { name: /Parts/ })).toContainText('3 parts on the shelves');
  await expect(stock.getByRole('link', { name: /Parts/ })).toContainText('1 low or out');
  await stock.getByRole('link', { name: /Parts/ }).click();
  await expect(page).toHaveURL(/\/workshop\/parts$/);

  const list = page.getByRole('list', { name: 'Parts' });
  await expect(list.getByRole('link')).toHaveCount(3);
  // A replacement number finds the part it replaces, and the part with that number.
  await page.getByRole('textbox', { name: 'Find a part' }).fill('z418');
  await expect(list.getByRole('link')).toHaveText([/Oil filter \(genuine\)/, /Ryco oil filter/]);
  await page.getByRole('textbox', { name: 'Find a part' }).fill('');
  await page.getByRole('group', { name: 'Which parts' }).getByRole('button', { name: /Low or out/ }).click();
  await expect(list.getByRole('link')).toHaveText([/Oil filter \(genuine\).*Low: 1 left/]);
  await page.screenshot({ path: '/tmp/tt-workshop-parts.png' });
  await list.getByRole('link', { name: /Oil filter \(genuine\)/ }).click();
  await expect(page).toHaveURL(/\/workshop\/parts\/p2$/);
  await expect(page.getByRole('heading', { name: 'Oil filter (genuine)' })).toBeVisible();
  // Low, with the replacement that is on the shelf.
  await expect(page.getByText('Replacement on the shelf')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ryco oil filter' })).toBeVisible();

  // Three quick taps: the count goes up at once, and one save follows. It
  // adds to the latest count, here changed meanwhile by the parts kiosk.
  const more = page.getByRole('button', { name: 'One more Oil filter (genuine)' });
  await more.click();
  await more.click();
  await more.click();
  await expect(page.getByRole('region', { name: 'On the shelf' })).toContainText('4in stock');
  server.tables.Part.find((p) => p.id === 'p2').quantity_in_stock = 5;
  await expect.poll(() => server.writes.filter((w) => w.entity === 'Part' && w.op === 'update').length).toBe(1);
  expect(server.writes.find((w) => w.entity === 'Part' && w.op === 'update')).toMatchObject({ id: 'p2', data: { quantity_in_stock: 8 } });
  await expect(page.getByRole('region', { name: 'On the shelf' })).toContainText('8in stock');
  await page.screenshot({ path: '/tmp/tt-workshop-part.png' });

  // Details: shelf, warning level and models. A mechanic can't delete a part.
  await page.getByRole('button', { name: 'Edit details' }).click();
  const sheet = page.getByRole('dialog', { name: 'Edit part' });
  await expect(sheet.getByRole('button', { name: 'Delete this part' })).toHaveCount(0);
  await sheet.getByLabel('Kept at').fill('Shelf A3');
  await sheet.getByLabel('Warn at (qty)').fill('3');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  const details = page.getByRole('region', { name: 'Details' });
  await expect(details).toContainText('Shelf A3');
  await expect(details).toContainText('3 or fewer');
  expect(server.writes.filter((w) => w.entity === 'Part' && w.op === 'update').at(-1).data).toMatchObject({ bin_location: 'Shelf A3', min_stock: 3, guide_ids: ['g1'] });
  await expect(page.getByRole('region', { name: 'Fits these models' })).toContainText('Toyota Hiace (H200)');
  await expect(page.getByRole('region', { name: 'Fits these models' }).getByRole('link', { name: 'St.George' })).toBeVisible();

  // Replacements: checked by whoever says it fits.
  const reps = page.getByRole('region', { name: 'Replacements' });
  await reps.getByRole('button', { name: 'It fits' }).click();
  await expect(reps).toContainText('Mo Mechanic');
  await expect(reps.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an administrator adds a part from the Workshop, and deletes one with a second tap', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/parts', { role: 'admin' });
  await page.getByRole('button', { name: 'Add a part' }).click();
  const add = page.getByRole('dialog', { name: 'Add a part' });
  await add.getByLabel('Part number').fill('04465-26420');
  await add.getByLabel('Name', { exact: true }).fill('Front brake pads');
  await add.getByRole('button', { name: 'Add part', exact: true }).click();
  await expect(add.getByRole('status')).toContainText('Added Front brake pads');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('list', { name: 'Parts' }).getByRole('link', { name: /Front brake pads/ })).toBeVisible();

  await page.getByRole('list', { name: 'Parts' }).getByRole('link', { name: /Wheel nut/ }).click();
  await page.getByRole('button', { name: 'Edit details' }).click();
  const sheet = page.getByRole('dialog', { name: 'Edit part' });
  await sheet.getByRole('button', { name: 'Delete this part' }).click();
  await sheet.getByRole('button', { name: 'Tap again to delete' }).click();
  await expect(page).toHaveURL(/\/workshop\/parts$/);
  await expect(page.getByRole('list', { name: 'Parts' }).getByRole('link', { name: /Wheel nut/ })).toHaveCount(0);
  expect(server.writes.find((w) => w.entity === 'Part' && w.op === 'delete')).toMatchObject({ id: 'p1' });
  expect(errors).toEqual([]);
});

test("Specs & service on a vehicle: by section, who checked each, and adding a service interval", async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a/specs');
  await expect(page.getByRole('navigation', { name: 'Catalogue' }).getByRole('link', { name: /Specs & service/ })).toHaveAttribute('aria-current', 'page');
  const fluids = page.getByRole('region', { name: /^Oils & fluids/ });
  const oil = fluids.getByRole('listitem').filter({ hasText: 'Engine oil with filter' });
  await expect(oil).toContainText('7.0 litres');
  await expect(oil).toContainText('Only for: 2KD-FTV');
  await expect(oil).toContainText('Not checked');
  await expect(oil.getByRole('link', { name: /Source: Owner's manual/ })).toHaveAttribute('target', '_blank');
  await expect(oil.getByRole('link', { name: /Source: Owner's manual/ })).toHaveAttribute('rel', /noopener/);
  await expect(page.getByRole('region', { name: /^Service schedule/ })).toContainText('Every 5,000 km or 6 months');
  await expect(page.getByRole('region', { name: /^Tyres & wheels/ })).toContainText('Mo Mechanic');

  await oil.getByRole('button', { name: "It's right" }).click();
  await expect(oil).toContainText('Checked');
  await expect(oil).toContainText('Mo Mechanic');
  await oil.getByRole('button', { name: /Undo/ }).click();
  await expect(oil).toContainText('Not checked');

  await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: /Wrong/ }).click();
  await expect(page.getByRole('region', { name: /^Service schedule/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Oils & fluids/ })).toHaveCount(0);
  await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'All' }).click();
  await page.getByRole('textbox', { name: 'Find a fact' }).fill('pressure');
  await expect(page.getByRole('region', { name: /^Tyres & wheels/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Oils & fluids/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Find a fact' }).fill('');

  // A new service interval: km and months only for the service schedule.
  await page.getByRole('button', { name: 'Add a fact' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a fact' });
  await expect(sheet.getByLabel('Every … km')).toHaveCount(0);
  await expect(sheet.getByLabel('Section').locator('option')).not.toContainText(['Tightening torques']);
  await sheet.getByLabel('Section').selectOption('service');
  await sheet.getByLabel('What it is').fill('Air filter');
  await sheet.getByLabel('Answer').fill('Replace');
  await sheet.getByLabel('Every … km').fill('20000');
  await sheet.getByLabel('or every … months').fill('12');
  await sheet.getByLabel('Source link (optional)').fill('http://example.com');
  await expect(sheet.getByText('The source link must start with https://')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled();
  await sheet.getByLabel('Source link (optional)').fill('');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  const air = page.getByRole('region', { name: /^Service schedule/ }).getByRole('listitem').filter({ hasText: 'Air filter' });
  await expect(air).toContainText('Every 20,000 km or 12 months');
  await expect(air).toContainText('Not checked');
  expect(server.writes.find((w) => w.entity === 'GuideFact' && w.op === 'create').data).toMatchObject({ guide_id: 'g1', section: 'service', label: 'Air filter', interval_km: 20000, interval_months: 12, sort_order: 40 });

  // A checked fact warns that changing the answer unchecks it; saving it
  // unchanged sends nothing. A mechanic can't delete facts.
  const writes = server.writes.length;
  await page.getByRole('button', { name: 'Edit Tyre pressure, front' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit fact' });
  await expect(edit).toContainText('Changing the answer marks it Not checked again.');
  await expect(edit.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  expect(server.writes.length).toBe(writes);
  await page.screenshot({ path: '/tmp/tt-workshop-specs.png' });

  // A model page with no facts yet says so.
  await page.goto('/workshop/car/car-1/specs');
  await expect(page.getByText('No specs for the BMW X3 yet.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Manuals: open one through a short-lived link, add one, and an administrator deletes one', async ({ page, context }) => {
  const { errors, server, uploads } = await open(page, '/workshop/bus/bus-a/manuals', { role: 'admin' });
  await context.route(SIGNED, (r) => r.fulfill({ contentType: 'text/html', body: '<title>Manual</title><p>Owner manual</p>' }));
  const manuals = page.getByRole('list', { name: 'Manuals' });
  await expect(manuals).toContainText("Owner's manual 2017");
  await expect(manuals).toContainText("Owner's manual · hiace-2017.pdf");
  const [tab] = await Promise.all([page.waitForEvent('popup'), manuals.getByRole('button', { name: "Open Owner's manual 2017" }).click()]);
  await tab.waitForURL(SIGNED);
  await tab.close();

  await page.getByRole('button', { name: 'Add a manual' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a manual' });
  await expect(sheet.getByRole('button', { name: 'Add' })).toBeDisabled();
  await sheet.getByLabel('File').setInputFiles({ name: 'workshop.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await sheet.getByLabel('Title').fill('Workshop manual, engine');
  await sheet.getByLabel('Kind').selectOption('workshop_manual');
  await sheet.getByRole('button', { name: 'Add' }).click();
  await expect(sheet).toBeHidden();
  await expect(manuals).toContainText('Workshop manual, engine');
  expect(uploads).toHaveLength(1);
  expect(server.writes.find((w) => w.entity === 'GuideDocument' && w.op === 'create').data).toMatchObject({ guide_id: 'g1', title: 'Workshop manual, engine', kind: 'workshop_manual', file_uri: NEW_FILE, file_name: 'workshop.pdf' });

  await manuals.getByRole('button', { name: "Delete Owner's manual 2017" }).click();
  await manuals.getByRole('button', { name: "Tap again to delete Owner's manual 2017" }).click();
  await expect(manuals).not.toContainText("Owner's manual 2017");
  expect(server.writes.find((w) => w.entity === 'GuideDocument' && w.op === 'delete')).toMatchObject({ id: 'doc-1' });
  expect(errors).toEqual([]);
});

test('Parts that fit a vehicle, and linking one from stock', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a/parts');
  const fit = page.getByRole('list', { name: 'Parts that fit' });
  await expect(fit.getByRole('link')).toHaveText([/Oil filter \(genuine\)/, /Wheel nut/]);
  await page.getByRole('button', { name: 'Link a part' }).click();
  const sheet = page.getByRole('dialog', { name: 'Link a part' });
  await sheet.getByRole('button', { name: 'Link Ryco oil filter' }).click();
  await expect(sheet.getByRole('button', { name: 'Ryco oil filter linked' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(fit.getByRole('link')).toHaveText([/Oil filter \(genuine\)/, /Ryco oil filter/, /Wheel nut/]);
  expect(server.writes.find((w) => w.entity === 'Part' && w.op === 'update')).toMatchObject({ id: 'p3', data: { guide_ids: ['g1'] } });
  expect(errors).toEqual([]);
});

test("Admin's Parts and Bus library open the Workshop; the old screens stay one tap away", async ({ page }) => {
  const { errors } = await open(page, '/admin', { role: 'admin', width: 1440, height: 900 });
  const nav = page.getByRole('navigation', { name: 'Admin', exact: true });
  await nav.getByRole('button', { name: 'Maintenance', exact: true }).click();
  await nav.getByRole('button', { name: 'Parts', exact: true }).click();
  await expect(page).toHaveURL(/\/workshop\/parts$/);
  await expect(page.getByRole('link', { name: 'Old view of Parts' })).toHaveAttribute('href', '/admin/parts');
  await page.getByRole('link', { name: 'Old view of Parts' }).click();
  await expect(page).toHaveURL(/\/admin\/parts$/);
  await expect(page.getByRole('note')).toContainText('Parts now lives in the Workshop.');
  await expect(page.getByRole('textbox', { name: 'Search parts' })).toBeVisible();

  await page.goto('/admin');
  await nav.getByRole('button', { name: 'Maintenance', exact: true }).click();
  await nav.getByRole('button', { name: 'Bus library', exact: true }).click();
  await expect(page).toHaveURL(/\/workshop$/);
  await page.getByRole('link', { name: 'Bus library (old view)' }).click();
  await expect(page).toHaveURL(/\/admin\/library$/);
  await expect(page.getByRole('note')).toContainText('The Bus library now lives in the Workshop');
  await page.getByRole('note').getByRole('link', { name: 'Open in the Workshop' }).click();
  await expect(page).toHaveURL(/\/workshop$/);
  expect(errors).toEqual([]);
});

test("a mechanic's Parts and Library tabs say they moved; Old view shows the old screen, on a phone", async ({ page }) => {
  const { errors } = await open(page, '/mechanic', { width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Parts' }).click();
  const note = page.getByRole('note');
  await expect(note).toContainText('Parts now lives in the Workshop.');
  await expect(note.getByRole('link', { name: 'Open in the Workshop' })).toHaveAttribute('href', '/workshop/parts');
  await expect(page.getByRole('textbox', { name: 'Search parts' })).toHaveCount(0);
  await note.getByRole('button', { name: 'Old view' }).click();
  await expect(page.getByRole('textbox', { name: 'Search parts' })).toBeVisible();

  // The Workshop's Old view link opens that tab with its old view showing.
  await page.goto('/workshop/parts');
  await page.getByRole('link', { name: 'Old view of Parts' }).click();
  await expect(page).toHaveURL(/\/mechanic\?tab=parts&old=1$/);
  await expect(page.getByRole('tab', { name: 'Parts' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: 'Search parts' })).toBeVisible();

  // The new pages fit a phone.
  for (const path of ['/workshop/parts', '/workshop/parts/p2', '/workshop/bus/bus-a/specs', '/workshop/bus/bus-a/parts', '/workshop/bus/bus-a/manuals']) {
    await page.goto(path);
    await page.getByRole('navigation', { name: 'Where you are' }).waitFor();
    await settle(page);
    await noSideScroll(page);
  }
  await page.goto('/workshop/parts/p2');
  await page.getByRole('navigation', { name: 'Where you are' }).waitFor();
  await settle(page);
  await page.screenshot({ path: '/tmp/tt-workshop-part-phone.png', fullPage: true });
  expect(errors).toEqual([]);
});
