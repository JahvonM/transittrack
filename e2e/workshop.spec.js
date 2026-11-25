import { test, expect } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';
import { memoryTables } from './helpers/memoryTables.js';

// The Workshop (/workshop) on the shared tablet, laid out like a parts
// catalogue: every vehicle (the buses, then the workshop's own cars); a
// vehicle's details with its sections down the side (torque values, photos,
// the maker's categories of diagrams); and a diagram's picture beside its
// table of parts, a number and its row lighting up together.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC', 'base64');
const PHOTO = 'https://ghqtest.supabase.co/storage/v1/object/public/public/uploads/2026-11/brakes.png';
const OIL_LINK = 'https://partsouq.com/en/catalog/genuine/unit?c=Toyota&number=1502';
const JP_LIST = 'https://jp-carparts.com/toyota/figlist.php?maker=toyota&type=711160&model=KDH201K-ERMDY&profile=143d1f38d2d60c9eba8bbdbe7a0d75360a0f985e528ebb1c964d63495fbee54f';

function tables() {
  return {
    VehicleGuide: [{ id: 'g1', make: 'Toyota', model: 'Hiace', generation: 'H200', year_from: 2004, year_to: 2019, starter_key: 'toyota-hiace-h200' }],
    TorqueSpec: [{
      id: 't1', guide_id: 'g1', system: 'wheels_brakes', item: 'Wheel nuts', nm: 100, status: 'unchecked', checked_by: '', sort_order: 10,
      source_name: "Toyota Hiace owner's manual", source_link: 'https://www.manualslib.com/manual/2515002/Toyota-Hiace.html?page=195',
    }],
    WorkshopVehicle: [{ id: 'car-1', name: 'BMW X3', make: 'BMW', model: 'X3', year: 2013, engine: '2.0 diesel (N47)' }],
    PartDiagram: [{ id: 'd1', guide_id: 'g1', title: 'Front brakes', system: 'Brakes', drawing_key: 'front-brakes', catalogue_link: 'https://partsouq.com/', catalogue_group_id: '', pins: [], sort_order: 10 }],
    CatalogueGroup: [{
      id: 'c1', guide_id: 'g1', vehicle_id: 'bus-a', model_code: 'KDH212R-JEMDY', category: 'Engine / Fuel / Tool', code: '1502', title: 'OIL FILTER', detail: '', link: OIL_LINK, sort_order: 10,
      parts: [
        { ref: '15601', number: '90915-YZZD2', name: 'Element kit, oil filter', qty: '1', info: '2KD-FTV' },
        { ref: '90430A', number: '90430-12031', name: 'Gasket', qty: '1', info: '' },
      ],
    }, {
      id: 'c2', guide_id: 'g1', vehicle_id: 'bus-a', model_code: 'KDH212R-JEMDY', category: 'Engine / Fuel / Tool', code: '1503', title: 'OIL COOLER & TUBE', detail: '', link: '', sort_order: 20, parts: [],
    }],
    Part: [
      { id: 'p1', part_name: 'Wheel nut', oem_number: '90942-01058', quantity_in_stock: 12, bin_location: 'Shelf C1', guide_ids: ['g1'] },
      { id: 'p2', part_name: 'Oil filter (genuine)', oem_number: '90915YZZD2', quantity_in_stock: 3, bin_location: 'Shelf A1', guide_ids: ['g1'] },
    ],
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
  await page.route('**/api/functions/v1/integrations', (r) => r.fulfill({ json: { file_url: PHOTO } }));
  await page.route(PHOTO, (r) => r.fulfill({ body: PNG, contentType: 'image/png' }));
  await page.setViewportSize({ width, height });
  await page.goto(path);
  return { errors, server };
}

const noSideScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));

test('on the tablet: a vehicle page like a parts catalogue, and checking and adding torque values', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop');
  await expect(page.getByRole('heading', { name: 'Workshop', level: 1 })).toBeVisible();
  // A screen of its own in a light catalogue look, with its own Home Screen icon.
  expect(await page.evaluate(() => [...document.documentElement.classList].filter((c) => c.startsWith('tt-')))).toEqual(['tt-workshop']);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/workshop.webmanifest?v=workshop1');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Workshop');

  // The buses, then the cars. A mechanic doesn't get the admin tiles.
  const buses = page.getByRole('region', { name: 'Buses' });
  await expect(buses.getByRole('link')).toHaveCount(2);
  const george = buses.getByRole('link', { name: /St\.George/ });
  await expect(george).toContainText('KDH212R-JEMDY');
  await expect(george).toContainText('1 torque value · 2 diagrams · 1 photo');
  await expect(george).toContainText('1 not checked');
  await expect(buses.getByRole('link', { name: /Bus 2/ })).toContainText('No model page');
  await expect(page.getByRole('region', { name: 'Cars' }).getByRole('link', { name: /BMW X3/ })).toContainText('No model page');
  await expect(page.getByRole('button', { name: /Add a car/ })).toHaveCount(0);

  await george.click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a$/);
  const details = page.getByRole('region', { name: 'Vehicle details' });
  await expect(details).toContainText('Toyota Hiace 2017');
  await expect(details).toContainText('KDH212R-JEMDY');
  await expect(details).toContainText('2KD-FTV 2.5 diesel turbo');
  const sections = page.getByRole('region', { name: 'Sections' });
  await expect(sections.getByRole('link')).toHaveText([/Torque values \(1\)/, /Specs & service \(0\)/, /Parts that fit \(2\)/, /Photos & bolt maps \(1\)/, /Manuals \(0\)/, /Service \(0\)/, /Jobs \(0\)/, /Troubleshooting \(0\)/, /Engine \/ Fuel \/ Tool \(2\)/]);
  await page.screenshot({ path: '/tmp/tt-workshop-vehicle.png' });

  await sections.getByRole('link', { name: /Torque values/ }).click();
  const nav = page.getByRole('navigation', { name: 'Catalogue' });
  await expect(nav.getByRole('link')).toHaveText([/Torque values\s*1/, /Specs & service\s*0/, /Parts that fit\s*2/, /Photos & bolt maps\s*1/, /Manuals\s*0/, /Service\s*0/, /Jobs\s*0/, /Troubleshooting\s*0/, /Engine \/ Fuel \/ Tool\s*2/]);
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/torque$/);
  await expect(nav.getByRole('link', { name: /Torque values/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Where you are' })).toContainText('Workshop');
  const wheels = page.getByRole('region', { name: /Wheels & brakes/ });
  const nuts = wheels.getByRole('listitem').filter({ hasText: 'Wheel nuts' });
  await expect(nuts).toContainText('100');
  await expect(nuts).toContainText('74 ft·lb');
  await expect(nuts).toContainText('Not checked');
  await nuts.getByRole('button', { name: "It's right" }).click();
  await expect(nuts).toContainText('Checked');
  await expect(nuts).toContainText('Mo Mechanic');
  expect(server.writes.find((w) => w.entity === 'TorqueSpec' && w.op === 'update').data).toEqual({ status: 'checked' });

  // Adding: one sheet, Cancel and Save at the top.
  await page.getByRole('button', { name: 'Add a torque' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a torque' });
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled();
  await sheet.getByLabel('Which bolt').fill('Front caliper bracket bolts');
  await sheet.getByLabel('Torque (N·m)').fill('107');
  await expect(sheet).toContainText('79 ft·lb');
  await sheet.getByLabel('Use a new bolt every time').check();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveCount(0);
  const made = server.writes.find((w) => w.entity === 'TorqueSpec' && w.op === 'create').data;
  expect(made).toMatchObject({ guide_id: 'g1', system: 'wheels_brakes', item: 'Front caliper bracket bolts', nm: 107, new_bolt: true, sort_order: 20 });
  const caliper = wheels.getByRole('listitem').filter({ hasText: 'Front caliper bracket bolts' });
  await expect(caliper).toContainText('New bolt');

  await page.getByLabel('Find a bolt').fill('caliper');
  await expect(wheels.getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('Find a bolt').fill('');
  await page.getByRole('button', { name: /^Not checked/ }).click();
  await expect(wheels.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.screenshot({ path: '/tmp/tt-workshop-torque.png' });

  // Editing a checked value says it'll need checking again; a mechanic can't delete.
  await nuts.getByRole('button', { name: 'Edit Wheel nuts' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit torque' });
  await expect(edit).toContainText('marks it Not checked again');
  await expect(edit.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await expect(edit).toHaveCount(0);
  // Loaded once: saves update the screen without reloading.
  expect(server.reads.filter((r) => r.entity === 'TorqueSpec')).toHaveLength(1);
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test("a maker's diagram: its parts beside a photo, numbers and rows lighting up together, and adding to stock", async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a');
  await page.getByRole('region', { name: 'Sections' }).getByRole('link', { name: /Engine \/ Fuel \/ Tool/ }).click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/c\/engine-fuel-tool$/);
  const tile = page.getByRole('link', { name: /1502 OIL FILTER/ });
  await expect(tile).toContainText('2 parts, 1 in stock');
  await page.getByLabel('Filter diagrams').fill('gearbox');
  await expect(tile).toHaveCount(0);
  await page.getByLabel('Filter diagrams').fill('oil');
  await tile.click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/group\/c1$/);
  await expect(page.getByRole('heading', { name: '1502 OIL FILTER' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Where you are' }).getByRole('link', { name: 'Engine / Fuel / Tool' })).toHaveAttribute('href', '/workshop/bus/bus-a/c/engine-fuel-tool');
  await expect(page.getByRole('link', { name: 'Open on Partsouq' }).first()).toHaveAttribute('href', OIL_LINK);

  const table = page.getByRole('region', { name: 'Parts on this diagram' });
  const filterRow = table.getByRole('listitem').filter({ hasText: '90915-YZZD2' });
  await expect(filterRow).toContainText('Element kit, oil filter');
  await expect(filterRow).toContainText('3 in stock');
  // A part not on the shelf goes to stock with its number and name filled in.
  await table.getByRole('button', { name: 'Add 90430-12031 to stock' }).click();
  const add = page.getByRole('dialog', { name: 'Add a part' });
  await expect(add.getByLabel('Part number', { exact: true })).toHaveValue('90430-12031');
  await add.press('Escape');
  await expect(add).toHaveCount(0);

  // No photo yet: one tap makes one, linked to this diagram.
  const picture = page.getByRole('region', { name: 'Picture', exact: true });
  await expect(picture).toContainText('No photo of this diagram yet');
  await picture.getByLabel('Take a photo of 1502 OIL FILTER on St.George').setInputFiles({ name: 'filter.png', mimeType: 'image/png', buffer: PNG });
  await expect(picture.getByRole('img', { name: '1502 OIL FILTER' })).toHaveAttribute('src', PHOTO);
  expect(server.writes.find((w) => w.entity === 'PartDiagram' && w.op === 'create').data).toMatchObject({ guide_id: 'g1', title: '1502 OIL FILTER', system: 'Engine / Fuel / Tool', catalogue_group_id: 'c1', catalogue_link: OIL_LINK, image_url: PHOTO, pins: [] });

  // Put the maker's number on the photo.
  await page.getByRole('button', { name: 'Edit pins' }).click();
  await picture.getByRole('img', { name: '1502 OIL FILTER' }).click({ position: { x: 120, y: 80 } });
  const pin = page.getByRole('dialog', { name: 'New pin' });
  await pin.getByLabel("Number on the maker's list").selectOption({ label: '15601 — Element kit, oil filter' });
  await pin.getByRole('button', { name: 'Save' }).click();
  await expect(pin).toHaveCount(0);
  expect(server.writes.filter((w) => w.entity === 'PartDiagram' && w.op === 'update').at(-1).data.pins).toEqual([expect.objectContaining({ n: 1, ref: '15601' })]);
  await page.getByRole('button', { name: 'Done' }).click();

  // Tap the number: its row lights up. Tap another row: it does instead.
  await picture.getByRole('button', { name: 'Number 15601' }).click();
  await expect(table.getByRole('button', { name: /15601/ })).toHaveAttribute('aria-pressed', 'true');
  await table.getByRole('button', { name: /90430A/ }).click();
  await expect(table.getByRole('button', { name: /90430A/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(picture.getByRole('button', { name: 'Number 15601' })).toHaveAttribute('aria-pressed', 'false');
  await table.getByRole('button', { name: /15601/ }).click();
  await expect(picture.getByRole('button', { name: 'Number 15601' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(picture).toContainText('150%');
  await page.screenshot({ path: '/tmp/tt-workshop-diagram.png' });

  // A fresh parts list, pasted from Partsouq, replaces the old one.
  await page.getByRole('button', { name: 'Paste parts' }).first().click();
  const paste = page.getByRole('dialog', { name: 'Paste parts' });
  await paste.getByLabel('Copied text').fill('No.\tPart number\tName\tQty\n15601\t90915-YZZD2\tELEMENT KIT, OIL FILTER\t1\n90430A\t90430-12031\tGASKET\t1\n15609\t15609-30010\tCAP, OIL FILTER\t1');
  await expect(paste.getByRole('status')).toContainText('Found 3 parts.');
  await paste.getByRole('button', { name: 'Save' }).click();
  await expect(paste).toHaveCount(0);
  expect(server.writes.find((w) => w.entity === 'CatalogueGroup' && w.op === 'update').data.parts).toHaveLength(3);
  await expect(table.getByRole('listitem')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("adding the maker's list of diagrams to a vehicle", async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a');
  await page.getByRole('button', { name: "Add the maker's diagrams" }).click();
  const sheet = page.getByRole('dialog', { name: "Add the maker's diagrams" });
  await sheet.getByLabel('Copied text').fill('Chassis / Driveline\n4401 BRAKE MASTER CYLINDER\n4702 FRONT DISC BRAKE CALIPER & DUST COVER\n\nEngine / Fuel / Tool\n1502 OIL FILTER');
  await expect(sheet.getByRole('status')).toContainText('Found 3 diagrams in Chassis / Driveline, Engine / Fuel / Tool. 2 new.');
  await expect(sheet.getByLabel('Model code (optional)')).toHaveValue('KDH212R-JEMDY');
  await sheet.getByRole('button', { name: 'Add 2' }).click();
  await expect(page).toHaveURL(/\/c\/chassis-driveline$/);
  const made = server.writes.filter((w) => w.entity === 'CatalogueGroup' && w.op === 'bulkCreate').flatMap((w) => w.data);
  expect(made.map((g) => [g.code, g.vehicle_id, g.model_code, g.category])).toEqual([
    ['4401', 'bus-a', 'KDH212R-JEMDY', 'Chassis / Driveline'], ['4702', 'bus-a', 'KDH212R-JEMDY', 'Chassis / Driveline'],
  ]);
  await expect(page.getByRole('link', { name: /4702 FRONT DISC BRAKE CALIPER/ })).toContainText('No parts yet');
  expect(errors).toEqual([]);
});

test("the maker's diagram from JP-CarParts: a category linked in one paste, then the diagram beside its parts", async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a/c/engine-fuel-tool');
  // JP-CarParts' own page, played by a stand-in (the test has no outside network).
  await page.route('https://jp-carparts.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>JP-CarParts</title><h1>1503 OIL COOLER &amp; TUBE (stand-in)</h1>' }));

  await page.getByRole('button', { name: 'Link to JP-CarParts' }).click();
  const sheet = page.getByRole('dialog', { name: 'Link to JP-CarParts' });
  await expect(sheet.getByRole('button', { name: /^Link/ })).toBeDisabled();
  await sheet.getByLabel("JP-CarParts address of your model's list of diagrams").fill('https://partsouq.com/en/catalog/genuine');
  await expect(sheet).toContainText("That isn't a Toyota model's list of diagrams on JP-CarParts");
  await sheet.getByLabel("JP-CarParts address of your model's list of diagrams").fill(JP_LIST);
  await expect(sheet.getByRole('status')).toContainText('Model KDH201K-ERMDY: links 1 diagram that has no link yet; 1 already linked stay as they are.');
  await sheet.getByRole('button', { name: 'Link 1' }).click();
  await expect(sheet).toHaveCount(0);
  const linked = server.writes.filter((w) => w.entity === 'CatalogueGroup' && w.op === 'update');
  expect(linked.map((w) => w.id)).toEqual(['c2']);
  const jpLink = linked[0].data.link;
  expect(Object.fromEntries(new URL(jpLink).searchParams)).toMatchObject({ maker: 'toyota', model: 'KDH201K-ERMDY', fig: '1503' });
  expect(new URL(jpLink).pathname).toBe('/toyota/partlist.php');
  await expect(page.getByRole('link', { name: /1503 OIL COOLER/ })).toContainText("Maker's diagram on JP-CarParts");
  await expect(page.getByRole('link', { name: /1502 OIL FILTER/ })).not.toContainText("Maker's diagram");

  // With no photo yet, the diagram opens on the maker's own page, beside its parts.
  await page.getByRole('link', { name: /1503 OIL COOLER/ }).click();
  const picture = page.getByRole('region', { name: 'Picture', exact: true });
  await expect(picture.getByRole('button', { name: "Maker's diagram" })).toHaveAttribute('aria-pressed', 'true');
  await expect(picture).toContainText("It's the Japanese-market version");
  const frame = picture.locator('iframe[title="1503 OIL COOLER & TUBE on JP-CarParts"]');
  await expect(frame).toHaveAttribute('src', jpLink);
  await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(picture.frameLocator('iframe').getByRole('heading')).toContainText('(stand-in)');
  await expect(page.getByRole('link', { name: 'Open on JP-CarParts' })).toHaveAttribute('href', jpLink);
  await expect(page.getByRole('region', { name: 'Parts on this diagram' })).toBeVisible();
  await page.screenshot({ path: '/tmp/tt-workshop-maker-diagram.png' });

  await picture.getByRole('button', { name: 'Your photo' }).click();
  await expect(picture).toContainText('No photo of this diagram yet');
  await expect(picture.locator('iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a bolt map: pin a torque value and a part on the picture, then a real photo', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a/maps');
  const card = page.getByRole('button', { name: /Front brakes/ });
  await expect(card).toContainText('needs a photo');
  await card.click();
  await expect(page).toHaveURL(/\/maps\/d1$/);
  await expect(page.getByRole('link', { name: 'Open on Partsouq' })).toHaveAttribute('href', 'https://partsouq.com/');
  const picture = page.getByRole('region', { name: 'Picture', exact: true });
  await expect(picture).toContainText('This is a generic guide drawing, not your vehicle.');

  await page.getByRole('button', { name: 'Edit pins' }).click();
  await picture.getByRole('img', { name: /Front brakes/ }).click({ position: { x: 200, y: 150 } });
  const sheet = page.getByRole('dialog', { name: 'New pin' });
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled();
  await sheet.getByLabel('Torque value').selectOption({ label: 'Wheel nuts — 100 N·m' });
  await sheet.getByLabel('Part in stock').selectOption({ label: 'Wheel nut (90942-01058)' });
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveCount(0);
  const saved = server.writes.find((w) => w.entity === 'PartDiagram' && w.op === 'update').data.pins;
  expect(saved).toEqual([expect.objectContaining({ n: 1, torque_id: 't1', part_id: 'p1', ref: '', label: '' })]);
  await page.getByRole('button', { name: 'Done' }).click();

  const table = page.getByRole('region', { name: 'Numbers on this picture' });
  const row = table.getByRole('listitem').filter({ hasText: 'Wheel nuts' });
  await expect(row).toContainText('100');
  await expect(row).toContainText('74 ft·lb');
  await expect(row).toContainText('90942-01058 · Shelf C1');
  await picture.getByRole('button', { name: 'Number 1' }).click();
  await expect(row.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: '/tmp/tt-workshop-pin.png' });

  await picture.getByLabel('Take a photo of Front brakes on St.George').setInputFiles({ name: 'brakes.png', mimeType: 'image/png', buffer: PNG });
  await expect(picture.getByRole('img', { name: 'Front brakes', exact: true })).toHaveAttribute('src', PHOTO);
  await expect(picture).not.toContainText('generic guide drawing');
  await expect(page.getByText('The pins were placed on the drawing: check them with Edit pins.').first()).toBeVisible();
  expect(server.writes.filter((w) => w.entity === 'PartDiagram' && w.op === 'update').at(-1).data).toEqual({ image_url: PHOTO });
  expect(errors).toEqual([]);
});

test('an administrator adds a car, then its researched model page from Models › Ready to add', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop', { role: 'admin' });
  await page.getByRole('button', { name: /Add a car/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a car' });
  await sheet.getByLabel('Name').fill('Serena');
  await sheet.getByLabel('Make').fill('Nissan');
  await sheet.getByLabel('Model').fill('Serena');
  await sheet.getByLabel('Year').fill('98');
  await expect(sheet).toContainText('four digits');
  await sheet.getByLabel('Year').fill('');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/workshop\/car\/WorkshopVehicle-\d+$/);
  expect(server.writes.find((w) => w.entity === 'WorkshopVehicle').data).toMatchObject({ name: 'Serena', make: 'Nissan', model: 'Serena', year: null });
  await expect(page.getByText('No model page covers this car yet.')).toBeVisible();

  await page.getByRole('link', { name: 'Models' }).click();
  const ready = page.getByRole('region', { name: 'Ready to add' });
  await expect(ready.getByRole('listitem').filter({ hasText: 'Toyota Hiace H200' })).toHaveCount(0);
  // The NV350 has no page yet: adding it makes the page with its researched facts, then its torque value.
  const nv350 = ready.getByRole('listitem').filter({ hasText: 'Nissan NV350 E26' });
  await expect(nv350).toContainText(/Makes its model page with \d+ researched facts, then adds 1 torque value\./);
  await expect(nv350.getByRole('button', { name: 'Add Nissan NV350 E26' })).toBeEnabled();
  for (const car of ['BMW X3 F25', 'Nissan Serena C23']) {
    const row = ready.getByRole('listitem').filter({ hasText: car });
    await expect(row).toContainText('Makes its model page');
    await row.getByRole('button', { name: 'Add' }).click();
    await expect(ready.getByRole('listitem').filter({ hasText: car })).toHaveCount(0);
  }
  const pages = server.writes.filter((w) => w.entity === 'VehicleGuide' && w.op === 'create').map((w) => w.data);
  expect(pages.map((g) => [g.make, g.model, g.starter_key])).toEqual([['BMW', 'X3', 'bmw-x3-f25'], ['Nissan', 'Serena', 'nissan-serena-c23']]);
  const added = server.writes.filter((w) => w.entity === 'TorqueSpec' && w.op === 'bulkCreate').flatMap((w) => w.data);
  expect(added).toHaveLength(4);
  for (const row of added) expect(row).toMatchObject({ status: 'unchecked', source_link: expect.stringMatching(/^https:\/\//) });
  await expect(page.getByRole('region', { name: 'Model pages' })).toContainText('Used by BMW X3');

  await page.getByRole('navigation', { name: 'Where you are' }).getByRole('link', { name: 'Workshop' }).click();
  await expect(page.getByRole('region', { name: 'Cars' }).getByRole('link', { name: /BMW X3/ })).toContainText('3 torque values');
  await page.getByRole('region', { name: 'Cars' }).getByRole('link', { name: /Serena/ }).click();
  await expect(page.getByRole('region', { name: 'Sections' }).getByRole('link', { name: /Torque values/ })).toContainText('(1)');
  expect(errors).toEqual([]);
});

test('on a phone: every page fits the screen, and the sheet fills it', async ({ page }) => {
  const { errors } = await open(page, '/workshop', { width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Buses' }).getByRole('link')).toHaveCount(2);
  await noSideScroll(page);
  for (const path of ['/workshop/bus/bus-a', '/workshop/bus/bus-a/torque', '/workshop/bus/bus-a/specs', '/workshop/bus/bus-a/parts', '/workshop/bus/bus-a/manuals', '/workshop/bus/bus-a/c/engine-fuel-tool', '/workshop/bus/bus-a/group/c1', '/workshop/parts', '/workshop/parts/p2']) {
    await page.goto(path);
    await page.getByRole('navigation', { name: 'Where you are' }).waitFor();
    await settle(page);
    await noSideScroll(page);
  }
  await page.screenshot({ path: '/tmp/tt-workshop-phone.png', fullPage: true });
  await page.goto('/workshop/bus/bus-a/torque');
  await page.getByRole('button', { name: 'Add a torque' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a torque' });
  const box = await sheet.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(389);
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeInViewport();
  expect(errors).toEqual([]);
});

test('the Workshop sends a signed-out visitor to sign in, then back to it; other accounts go to their own screen', async ({ page }) => {
  await mockFleet(page, { signedIn: false });
  await page.goto('/workshop/bus/bus-a/torque');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fworkshop$/);

  for (const role of ['staff', 'driver', 'company']) {
    const other = await page.context().newPage();
    await mockFleet(other, { role });
    await other.goto('/workshop');
    await expect(other).not.toHaveURL(/\/workshop$/);
    await expect(other.getByRole('heading', { name: 'Workshop', level: 1 })).toHaveCount(0);
    await other.close();
  }
});

test('the Workshop opens from Admin › Maintenance and the search box, and leads back to Admin', async ({ page }) => {
  const { errors } = await open(page, '/admin', { role: 'admin', width: 1440, height: 900 });
  const nav = page.getByRole('navigation', { name: 'Admin', exact: true });
  await nav.getByRole('button', { name: 'Maintenance', exact: true }).click();
  await nav.getByRole('button', { name: 'Workshop', exact: true }).click();
  await expect(page).toHaveURL(/\/workshop$/);
  await expect(page.getByRole('link', { name: 'Workshop home' })).toBeVisible();
  await page.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('combobox', { name: 'Search admin' }).fill('works');
  await page.getByRole('option', { name: 'Workshop', exact: true }).click();
  await expect(page).toHaveURL(/\/workshop$/);
  // An /admin/workshop address (typed or bookmarked) opens it too.
  await page.goto('/admin/workshop');
  await expect(page).toHaveURL(/\/workshop$/);
  await expect(page.getByRole('link', { name: 'Workshop home' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a mechanic opens the Workshop from their screen, and comes back', async ({ page }) => {
  const { errors } = await open(page, '/mechanic', { role: 'mechanic', width: 390, height: 844 });
  await page.getByRole('link', { name: 'Workshop', exact: true }).click();
  await expect(page).toHaveURL(/\/workshop$/);
  await expect(page.getByRole('link', { name: 'Workshop home' })).toBeVisible();
  // The new screen slides in from the side (.tt-route-in): measure once it
  // has arrived, like the phone test above.
  await settle(page);
  await noSideScroll(page);
  await page.getByRole('link', { name: 'Mechanic', exact: true }).click();
  await expect(page).toHaveURL(/\/mechanic$/);
  expect(errors).toEqual([]);
});
