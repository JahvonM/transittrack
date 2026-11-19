import { test, expect } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';
import { memoryTables } from './helpers/memoryTables.js';

// The Workshop (/workshop) on the shared tablet: every vehicle as a big tile
// (the buses, then the workshop's own cars), each with its model page's
// torque values and bolt maps; one thing on screen at a time and all editing
// in one sheet.

function tables() {
  return {
    VehicleGuide: [{ id: 'g1', make: 'Toyota', model: 'Hiace', generation: 'H200', year_from: 2004, year_to: 2019, starter_key: 'toyota-hiace-h200' }],
    TorqueSpec: [{
      id: 't1', guide_id: 'g1', system: 'wheels_brakes', item: 'Wheel nuts', nm: 100, status: 'unchecked', checked_by: '', sort_order: 10,
      source_name: "Toyota Hiace owner's manual", source_link: 'https://www.manualslib.com/manual/2515002/Toyota-Hiace.html?page=195',
    }],
    WorkshopVehicle: [{ id: 'car-1', name: 'BMW X3', make: 'BMW', model: 'X3', year: 2013, engine: '2.0 diesel (N47)' }],
    PartDiagram: [{ id: 'd1', guide_id: 'g1', title: 'Front brakes', system: 'Brakes', drawing_key: 'front-brakes', pins: [], sort_order: 10 }],
    Part: [{ id: 'p1', part_name: 'Wheel nut', oem_number: '90942-01058', quantity_in_stock: 12, bin_location: 'Shelf C1', guide_ids: ['g1'] }],
  };
}

async function open(page, path, { role = 'mechanic', width = 1024, height = 768 } = {}) {
  const data = fleetData();
  Object.assign(data.tables.Vehicle[0], { name: 'St.George', make: 'Toyota', model: 'Hiace', year: 2017, engine: '2KD-FTV 2.5 diesel turbo', transmission: 'Manual' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t = tables();
  Object.assign(data.tables, t);
  await mockFleet(page, { role, data });
  const server = await memoryTables(page, t, { who: role === 'admin' ? 'Admin Person' : 'Mo Mechanic' });
  await page.setViewportSize({ width, height });
  await page.goto(path);
  return { errors, server };
}

const noSideScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

test('on the tablet: open a bus, check a torque value, and add one in the sheet', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop');
  await expect(page.getByRole('heading', { name: 'Workshop', level: 1 })).toBeVisible();
  // A screen of its own: no app menus, the dark look, and its own Home Screen icon.
  await expect(page.getByRole('navigation')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains('tt-future'))).toBe(true);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/workshop.webmanifest?v=workshop1');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Workshop');

  // The buses, then the cars. A mechanic doesn't get the admin tiles.
  const buses = page.getByRole('region', { name: 'Buses' });
  await expect(buses.getByRole('link')).toHaveCount(2);
  await expect(buses.getByRole('link', { name: /St\.George/ })).toContainText('1 torque value');
  await expect(buses.getByRole('link', { name: /St\.George/ })).toContainText('1 not checked');
  await expect(buses.getByRole('link', { name: /Bus 2/ })).toContainText('No model page');
  await expect(page.getByRole('region', { name: 'Cars' }).getByRole('link', { name: /BMW X3/ })).toContainText('No model page');
  await expect(page.getByRole('button', { name: /Add a car/ })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/tt-workshop-home.png' });

  await buses.getByRole('link', { name: /St\.George/ }).click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a$/);
  await expect(page.getByRole('heading', { name: 'St.George' })).toBeVisible();
  await expect(page.getByText('Toyota Hiace 2017 · 2KD-FTV 2.5 diesel turbo · Manual')).toBeVisible();
  await page.getByRole('link', { name: /Torque/ }).click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/torque$/);

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
  await expect(caliper).toContainText('Not checked');

  // Filter, and only the matching value shows.
  await page.getByLabel('Find a bolt').fill('caliper');
  await expect(wheels.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: /^Not checked/ }).click();
  await page.getByLabel('Find a bolt').fill('');
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
  // The data was loaded once: saves update the screen without reloading.
  expect(server.reads.filter((r) => r.entity === 'TorqueSpec')).toHaveLength(1);
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test('a bolt map: pin a torque value and a part on the picture, then tap the pin for its card', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a/maps');
  await expect(page.getByRole('heading', { name: 'Bolt maps' })).toBeVisible();
  await page.getByRole('button', { name: /Front brakes/ }).click();
  await expect(page).toHaveURL(/\/maps\/d1$/);
  await page.getByRole('button', { name: 'Edit pins' }).click();
  await page.getByRole('img', { name: /Front brakes/ }).click({ position: { x: 200, y: 150 } });

  const sheet = page.getByRole('dialog', { name: 'New pin 1' });
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled();
  await sheet.getByLabel('Torque value').selectOption({ label: 'Wheel nuts — 100 N·m' });
  await sheet.getByLabel('Part').selectOption({ label: 'Wheel nut (90942-01058)' });
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveCount(0);
  const saved = server.writes.find((w) => w.entity === 'PartDiagram' && w.op === 'update').data.pins;
  expect(saved).toEqual([expect.objectContaining({ n: 1, torque_id: 't1', part_id: 'p1', label: '' })]);
  expect(saved[0].x).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Pin 1: Wheel nuts' }).first().click();
  const card = page.getByRole('dialog', { name: /Pin 1/ });
  await expect(card.getByRole('region', { name: 'Torque' })).toContainText('Wheel nuts');
  await expect(card.getByRole('region', { name: 'Torque' })).toContainText('100');
  await expect(card.getByRole('region', { name: 'Part' })).toContainText('Wheel nut');
  await expect(card.getByRole('region', { name: 'Part' })).toContainText('Shelf C1');
  await page.screenshot({ path: '/tmp/tt-workshop-pin.png' });
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
  // The Hiace's value is already on its page; the NV350 needs its Bus library page first.
  await expect(ready.getByRole('listitem').filter({ hasText: 'Toyota Hiace H200' })).toHaveCount(0);
  await expect(ready.getByRole('listitem').filter({ hasText: 'Nissan NV350 E26' })).toContainText('in the Bus library first');
  await expect(ready.getByRole('listitem').filter({ hasText: 'Nissan NV350 E26' }).getByRole('button', { name: 'Add' })).toHaveCount(0);
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
  await page.screenshot({ path: '/tmp/tt-workshop-models.png' });

  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Cars' }).getByRole('link', { name: /BMW X3/ })).toContainText('3 torque values');
  await page.getByRole('region', { name: 'Cars' }).getByRole('link', { name: /Serena/ }).click();
  await expect(page.getByRole('link', { name: /Torque/ })).toContainText('1 value · 1 not checked');
  expect(errors).toEqual([]);
});

test('on a phone: tiles and the torque list fit the screen, and the sheet fills it', async ({ page }) => {
  const { errors } = await open(page, '/workshop', { width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Buses' }).getByRole('link')).toHaveCount(2);
  await noSideScroll(page);
  await page.goto('/workshop/bus/bus-a/torque');
  await expect(page.getByRole('heading', { name: 'Torque' })).toBeVisible();
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
  await noSideScroll(page);
  await page.screenshot({ path: '/tmp/tt-workshop-phone.png' });
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
