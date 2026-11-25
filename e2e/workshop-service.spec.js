// Service due in the Workshop: a bus's services (every so many km or months,
// whichever comes first) by its odometer and the date; set up from its model
// page in one go; marked done here or by the job that did them; and what's
// due across the fleet on the Home and the Service page. The browser's clock
// is fixed, so "overdue by 13 days" stays true.
import { expect, test } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';
import { memoryTables } from './helpers/memoryTables.js';
import { noSideScroll, settle } from './helpers/workshopScan.js';

const NOW = new Date('2026-11-10T15:00:00Z'); // 11 in the morning in Grenada

// Routine service is six months old (overdue by date, plenty of km left);
// the air filter is 300 km from due.
const ROUTINE = { id: 's1', vehicle_id: 'bus-a', vehicle_name: 'St.George', company_id: 'a', service_type: 'Routine service', due_type: 'mileage', interval_km: 10000, interval_days: 180, last_service_mileage: 98000, last_service_date: '2026-05-01', status: 'overdue' };
const AIR = { id: 's2', vehicle_id: 'bus-a', vehicle_name: 'St.George', company_id: 'a', service_type: 'Air filter', due_type: 'mileage', interval_km: 20000, interval_days: 0, last_service_mileage: 85300, last_service_date: '2026-02-01', status: 'due' };

function tables(schedules) {
  return {
    VehicleGuide: [{ id: 'g1', make: 'Toyota', model: 'Hiace', generation: 'H200', year_from: 2004, year_to: 2019 }],
    GuideFact: [
      { id: 'f1', guide_id: 'g1', section: 'service', label: 'Routine service', value: 'Oil, filter and checks', interval_km: 10000, interval_months: 6, status: 'unchecked', sort_order: 20 },
      { id: 'f2', guide_id: 'g1', section: 'service', label: 'Diesel fuel filter', value: 'Replace', interval_km: 20000, interval_months: null, status: 'unchecked', sort_order: 10 },
      { id: 'f3', guide_id: 'g1', section: 'service', label: 'Coolant', value: 'Super Long Life', status: 'unchecked', sort_order: 30 },
    ],
    MaintenanceSchedule: structuredClone(schedules),
    MaintenanceSettings: [{ id: 'm', maintenance_reminder_days: 14 }],
    WorkshopVehicle: [{ id: 'car-1', name: 'BMW X3', make: 'BMW', model: 'X3', year: 2013 }],
    WorkshopJob: [], WorkshopJobPart: [], Fault: [], Part: [], PartInterchange: [], TorqueSpec: [], PartDiagram: [], CatalogueGroup: [], GuideDocument: [],
  };
}

async function open(page, path, { role = 'admin', width = 1024, height = 768, schedules = [] } = {}) {
  const data = fleetData();
  Object.assign(data.tables.Vehicle[0], { name: 'St.George', make: 'Toyota', model: 'Hiace', year: 2017, current_odometer: 105000 });
  Object.assign(data.tables.Vehicle[1], { name: 'Grenville', make: 'Toyota', model: 'Hiace', year: 2016, current_odometer: 52000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t = { ...tables(schedules), Vehicle: data.tables.Vehicle };
  Object.assign(data.tables, t);
  await mockFleet(page, { role, data });
  const server = await memoryTables(page, t, { who: role === 'admin' ? 'Admin Person' : 'Mo Mechanic', vehicles: { 'bus:bus-a': 'St.George', 'bus:bus-b': 'Grenville' } });
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width, height });
  await page.goto(path);
  return { errors, server };
}

const rowOf = (page, name) => page.getByRole('list', { name: 'Services' }).getByRole('listitem').filter({ hasText: name });

test("a bus's services set up from its model page, each by km or date, whichever comes first", async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a/service');
  await expect(page.getByRole('group', { name: 'Odometer' })).toContainText('105,000 km');
  await expect(page.getByText("The Toyota Hiace model page has 2 service intervals St.George doesn't have yet.")).toBeVisible();
  await page.getByRole('button', { name: "Add the model's 2 services" }).click();
  const sheet = page.getByRole('dialog', { name: 'Service schedule' });
  // Each starts from today and the odometer now; this one was really done in May.
  await expect(sheet.getByLabel('Routine service: last done')).toHaveValue('2026-11-10');
  await expect(sheet.getByLabel('Routine service: at km')).toHaveValue('105000');
  await sheet.getByLabel('Routine service: last done').fill('2026-05-01');
  await sheet.getByLabel('Routine service: at km').fill('98,000');
  await sheet.getByLabel('Diesel fuel filter: at km').fill('90000');
  await sheet.getByRole('button', { name: 'Add 2' }).click();
  await expect(sheet).toBeHidden();

  const made = server.writes.filter((w) => w.entity === 'MaintenanceSchedule' && w.op === 'create').map((w) => w.data);
  expect(made).toEqual([
    expect.objectContaining({ vehicle_id: 'bus-a', vehicle_name: 'St.George', service_type: 'Diesel fuel filter', interval_km: 20000, interval_days: 0, due_type: 'mileage', last_service_mileage: 90000, last_service_date: '2026-11-10', status: 'upcoming' }),
    expect.objectContaining({ vehicle_id: 'bus-a', service_type: 'Routine service', interval_km: 10000, interval_days: 180, last_service_mileage: 98000, last_service_date: '2026-05-01', status: 'overdue' }),
  ]);

  // The most urgent first: six months up, though km are fine.
  const routine = rowOf(page, 'Routine service');
  await expect(page.getByRole('list', { name: 'Services' }).getByRole('listitem').first()).toContainText('Routine service');
  await expect(routine).toContainText('Overdue');
  await expect(routine).toContainText('Overdue by 13 days');
  await expect(routine).toContainText('Every 10,000 km or 6 months · Last done 1 May 2026 at 98,000 km');
  await expect(routine).toContainText('Next at 108,000 km or by 28 Oct 2026');
  await expect(rowOf(page, 'Diesel fuel filter')).toContainText('In 5,000 km');
  await expect(page.getByText("doesn't have yet")).toHaveCount(0);

  // The bus's page sums it up.
  await page.goto('/workshop/bus/bus-a');
  await expect(page.getByRole('region', { name: 'Sections' }).getByRole('link', { name: /Service \(2\)/ })).toContainText('1 overdue');
  expect(errors).toEqual([]);
});

test('done, a new reading, edit, add and delete; a mechanic has no Delete', async ({ page, browser }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a/service', { schedules: [ROUTINE, AIR] });
  await expect(rowOf(page, 'Air filter')).toContainText('Due in 300 km');

  // Routine service done today at a newer reading, which moves the bus's up.
  await page.getByRole('button', { name: 'Done: Routine service' }).click();
  const done = page.getByRole('dialog', { name: 'Mark done' });
  await expect(done.getByLabel('Done on')).toHaveValue('2026-11-10');
  await expect(done.getByLabel('Odometer (km)')).toHaveValue('105000');
  await done.getByLabel('Odometer (km)').fill('105400');
  await done.getByRole('button', { name: 'Mark done' }).click();
  await expect(done).toBeHidden();
  expect(server.writes.find((w) => w.entity === 'MaintenanceSchedule' && w.op === 'update')).toMatchObject({ id: 's1', data: { last_service_date: '2026-11-10', last_service_mileage: 105400, status: 'upcoming' } });
  expect(server.writes.find((w) => w.entity === 'Vehicle' && w.op === 'update')).toMatchObject({ id: 'bus-a', data: { current_odometer: 105400 } });
  await expect(page.getByRole('group', { name: 'Odometer' })).toContainText('105,400 km');
  await expect(rowOf(page, 'Routine service')).toContainText('In 10,000 km');
  // The new reading takes the air filter past its km.
  await expect(rowOf(page, 'Air filter')).toContainText('Overdue by 100 km');

  // A longer interval for the air filter.
  await page.getByRole('button', { name: 'Edit: Air filter' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit service' });
  await edit.getByLabel('Every (km)').fill('25000');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  expect(server.writes.filter((w) => w.entity === 'MaintenanceSchedule' && w.op === 'update').at(-1)).toMatchObject({ id: 's2', data: { interval_km: 25000, status: 'upcoming' } });
  await expect(rowOf(page, 'Air filter')).toContainText('In 4,900 km');

  // A service kept by date alone.
  await page.getByRole('button', { name: 'Add a service' }).click();
  const add = page.getByRole('dialog', { name: 'Add a service' });
  await expect(add.getByRole('button', { name: 'Save' })).toBeDisabled();
  await add.getByLabel('What').fill('Brake fluid');
  await expect(add).toContainText('Say how often');
  await add.getByLabel('Every (months)').fill('12');
  await add.getByLabel('Last done').fill('2025-11-01');
  await add.getByLabel('At (km)').fill('');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add).toBeHidden();
  expect(server.writes.filter((w) => w.entity === 'MaintenanceSchedule' && w.op === 'create').at(-1).data).toMatchObject({ vehicle_id: 'bus-a', service_type: 'Brake fluid', interval_km: 0, interval_days: 360, due_type: 'days', last_service_date: '2025-11-01', status: 'overdue' });
  await expect(rowOf(page, 'Brake fluid')).toContainText('Overdue by 14 days');
  await expect(rowOf(page, 'Brake fluid')).toContainText('Every 12 months');

  // An administrator deletes it, with a second tap.
  await page.getByRole('button', { name: 'Edit: Brake fluid' }).click();
  const remove = page.getByRole('dialog', { name: 'Edit service' });
  await remove.getByRole('button', { name: 'Delete this service' }).click();
  await remove.getByRole('button', { name: 'Tap again to delete' }).click();
  await expect(rowOf(page, 'Brake fluid')).toHaveCount(0);
  expect(server.writes.filter((w) => w.entity === 'MaintenanceSchedule' && w.op === 'delete')).toHaveLength(1);
  expect(errors).toEqual([]);

  // A mechanic changes a service but can't delete one.
  const mechanic = await browser.newPage();
  const theirs = await open(mechanic, '/workshop/bus/bus-a/service', { role: 'mechanic', schedules: [ROUTINE] });
  await mechanic.getByRole('button', { name: 'Edit: Routine service' }).click();
  await expect(mechanic.getByRole('dialog', { name: 'Edit service' }).getByLabel('What')).toHaveValue('Routine service');
  await expect(mechanic.getByRole('button', { name: 'Delete this service' })).toHaveCount(0);
  expect(theirs.errors).toEqual([]);
  await mechanic.close();
});

test("the Home and the Service page show what's due across the fleet; cars have no Service", async ({ page }) => {
  const { errors } = await open(page, '/workshop', { schedules: [ROUTINE, AIR] });
  const tile = page.getByRole('region', { name: 'Work' }).getByRole('link', { name: /Service/ });
  await expect(tile).toContainText('1 overdue · 1 due soon');
  await expect(page.getByRole('region', { name: 'Buses' }).getByRole('link', { name: /St\.George/ })).toContainText('Service overdue');
  await expect(page.getByRole('region', { name: 'Buses' }).getByRole('link', { name: /Grenville/ })).not.toContainText('Service');

  await tile.click();
  await expect(page).toHaveURL(/\/workshop\/service$/);
  await expect(page.getByRole('heading', { name: 'Service', level: 2 })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Overdue/ })).toContainText('St.George · Routine service');
  await expect(page.getByRole('region', { name: /^Due soon/ })).toContainText('St.George · Air filter');
  await expect(page.getByRole('region', { name: /^No services yet/ }).getByRole('link', { name: /Grenville/ })).toContainText('Its model page has 2 service intervals to add');
  await page.screenshot({ path: '/tmp/tt-workshop-service-page.png', fullPage: true });
  await page.getByRole('region', { name: /^Overdue/ }).getByRole('link', { name: /Routine service/ }).click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/service$/);

  // A car has no Service section; its address for one leads to the car.
  await page.goto('/workshop/car/car-1');
  await expect(page.getByRole('link', { name: /^Service/ })).toHaveCount(0);
  await page.goto('/workshop/car/car-1/service');
  await expect(page).toHaveURL(/\/workshop\/car\/car-1$/);
  expect(errors).toEqual([]);
});

test('a job started from a due service, marked done, ticks it off and moves the odometer', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a/service', { role: 'mechanic', schedules: [ROUTINE, AIR] });
  await page.getByRole('button', { name: 'Start a job: Routine service' }).click();
  const start = page.getByRole('dialog', { name: 'New job' });
  await expect(start.getByLabel("What's being done")).toHaveValue('Routine service');
  await start.getByRole('button', { name: 'Start job' }).click();
  await expect(page).toHaveURL(/\/workshop\/jobs\/WorkshopJob-\d+$/);

  await page.getByRole('button', { name: 'Mark done' }).click();
  const done = page.getByRole('dialog', { name: 'Mark done' });
  const services = done.getByRole('group', { name: 'Services done on this job' });
  await expect(services.getByRole('checkbox', { name: /Routine service/ })).toBeChecked();
  await expect(services.getByRole('checkbox', { name: /Air filter/ })).not.toBeChecked();
  await done.getByLabel('What fixed it?').fill('Oil and filter, checks done');
  await done.getByLabel('Odometer (km)').fill('105600');
  await settle(page);
  await page.screenshot({ path: '/tmp/tt-workshop-job-done-services.png' });
  await done.getByRole('button', { name: 'Mark done' }).click();
  await expect(done).toBeHidden();

  expect(server.writes.filter((w) => w.entity === 'MaintenanceSchedule' && w.op === 'update')).toEqual([
    expect.objectContaining({ id: 's1', data: { last_service_date: '2026-11-10', last_service_mileage: 105600, status: 'upcoming' } }),
  ]);
  expect(server.writes.find((w) => w.entity === 'Vehicle' && w.op === 'update')).toMatchObject({ id: 'bus-a', data: { current_odometer: 105600 } });

  await page.goto('/workshop/bus/bus-a/service');
  await expect(rowOf(page, 'Routine service')).toContainText('In 10,000 km');
  await expect(rowOf(page, 'Air filter')).toContainText('Overdue by 300 km');
  expect(errors).toEqual([]);
});

test('on a phone the Service section, its Done sheet and the Service page fit', async ({ page }) => {
  const { errors } = await open(page, '/workshop/bus/bus-a/service', { role: 'mechanic', width: 390, height: 844, schedules: [ROUTINE, AIR] });
  await expect(page.getByRole('list', { name: 'Services' })).toBeVisible();
  await settle(page);
  await noSideScroll(page);
  await page.screenshot({ path: '/tmp/tt-workshop-service-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Done: Air filter' }).click();
  await expect(page.getByRole('dialog', { name: 'Mark done' })).toBeVisible();
  await settle(page);
  await noSideScroll(page);
  await page.screenshot({ path: '/tmp/tt-workshop-service-done-phone.png' });
  await page.keyboard.press('Escape');
  await page.goto('/workshop/service');
  await expect(page.getByRole('region', { name: /^Overdue/ })).toBeVisible();
  await settle(page);
  await noSideScroll(page);
  await page.screenshot({ path: '/tmp/tt-workshop-service-page-phone.png', fullPage: true });
  expect(errors).toEqual([]);
});
