// Workshop jobs: start one from a bus's open fault, tick its steps (one with
// a torque value), take parts from the shelf, mark it done with what fixed
// it, and find that fix again under Troubleshooting and in Search. The test
// server keeps the database's stock rule (helpers/memoryTables.js).
import { expect, test } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';
import { memoryTables } from './helpers/memoryTables.js';
import { noSideScroll, settle, tables } from './helpers/workshopScan.js';

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

async function open(page, path, { role = 'mechanic', width = 1024, height = 768, jobs = [], jobParts = [] } = {}) {
  const data = fleetData();
  Object.assign(data.tables.Vehicle[0], { name: 'St.George', make: 'Toyota', model: 'Hiace', year: 2017, engine: '2KD-FTV 2.5 diesel turbo', current_odometer: 182450 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t = {
    ...tables(),
    Fault: [{ id: 'f-sg', company_id: 'a', vehicle_id: 'bus-a', vehicle_name: 'St.George', title: 'Engine light on', description: 'Loses power uphill', severity: 'high', status: 'open', source: 'manual', created_date: iso(now - 86_400_000) }],
    WorkshopJob: jobs,
    WorkshopJobPart: jobParts,
  };
  t.GuideFact.push({ id: 'k1', guide_id: 'g1', section: 'problems', label: 'EGR valve sticks', value: 'Clean the EGR valve and its pipe', detail: 'Shows as P0401 and loss of power', status: 'checked', sort_order: 20 });
  Object.assign(data.tables, t);
  await mockFleet(page, { role, data });
  const server = await memoryTables(page, t, { who: 'Mo Mechanic', vehicles: { 'bus:bus-a': 'St.George' } });
  await page.setViewportSize({ width, height });
  await page.goto(path);
  return { errors, server };
}

const OPEN_JOB = { id: 'j-open', vehicle_kind: 'bus', vehicle_id: 'bus-a', vehicle_name: 'St.George', guide_id: 'g1', title: 'Wheel nuts', status: 'open', created_date: iso(now - 3_600_000) };

test('a job from an open fault: steps with a torque value, parts off the shelf, done with the fix, then found again', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/bus/bus-a');
  const part = (id) => server.tables.Part.find((p) => p.id === id);

  // The bus's Jobs section shows its open fault; starting a job on it fills in its words.
  await page.getByRole('link', { name: /^Jobs \(0\).*1 open fault/ }).click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/jobs$/);
  await page.getByRole('region', { name: '1 open fault' }).getByRole('button', { name: 'Start a job on Engine light on' }).click();
  const start = page.getByRole('dialog', { name: 'New job' });
  await expect(start.getByLabel("What's being done")).toHaveValue('Engine light on');
  await expect(start.getByLabel("What's wrong")).toHaveValue('Loses power uphill');
  await expect(start.getByLabel('Odometer (km)')).toHaveValue('182450');
  await start.getByLabel('Fault codes').fill('P0401');
  await start.getByRole('button', { name: 'Start job' }).click();
  await expect(page).toHaveURL(/\/workshop\/jobs\/WorkshopJob-1$/);
  await expect(page.getByRole('heading', { name: 'Engine light on' })).toBeVisible();
  expect(server.tables.WorkshopJob[0]).toMatchObject({ vehicle_kind: 'bus', vehicle_id: 'bus-a', guide_id: 'g1', fault_id: 'f-sg', fault_codes: 'P0401', odometer: 182450, vehicle_name: 'St.George' });
  await expect.poll(() => server.tables.Fault[0].status).toBe('in_progress');

  // Steps: one carries the model's torque value, marked as not checked yet.
  const steps = page.getByRole('region', { name: 'Steps' });
  for (const [text, torque] of [['Drain the oil', ''], ['Clean the EGR valve', ''], ['Refit the wheels', 'Wheel nuts · 100 N·m']]) {
    await steps.getByLabel('New step').fill(text);
    if (torque) await steps.getByLabel('Torque value for the step').selectOption({ label: torque });
    await steps.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(steps.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(steps.getByText('Wheel nuts: 100 N·m')).toBeVisible();
  await expect(steps.getByText('Not checked')).toBeVisible();
  await steps.getByRole('checkbox', { name: 'Drain the oil' }).check();
  await expect(steps.getByText('1 of 3 done')).toBeVisible();
  await expect.poll(() => server.tables.WorkshopJob[0].steps?.map((s) => [s.text, s.done, s.torque_id || ''])).toEqual([['Drain the oil', true, ''], ['Clean the EGR valve', false, ''], ['Refit the wheels', false, 't1']]);

  // The genuine filter comes off the shelf (1 there, then none).
  const used = page.getByRole('region', { name: 'Parts used' });
  await used.getByRole('button', { name: 'Add a part' }).click();
  let add = page.getByRole('dialog', { name: 'Add a part' });
  await add.getByLabel('Find a part').fill('90915');
  await add.getByRole('list', { name: 'Matching parts' }).getByRole('button', { name: /Oil filter \(genuine\)/ }).click();
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(add).toBeHidden();
  await expect(used.getByRole('button', { name: /Oil filter \(genuine\), 90915-YZZD2 · × 1 · From the shelf/ })).toBeVisible();
  expect(part('p1').quantity_in_stock).toBe(0);

  // None left: the screen says so and offers the two ways on.
  await used.getByRole('button', { name: 'Add a part' }).click();
  add = page.getByRole('dialog', { name: 'Add a part' });
  await add.getByLabel('Find a part').fill('oil filter');
  await add.getByRole('list', { name: 'Matching parts' }).getByRole('button', { name: /Oil filter \(genuine\)/ }).click();
  await expect(add.getByText('None left on the shelf')).toBeVisible();
  await expect(add.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await expect(add.getByRole('link', { name: 'Fix the count' })).toHaveAttribute('href', '/workshop/parts/p1');
  await add.getByRole('button', { name: 'Bought for this job' }).click();
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(used.getByRole('button', { name: /Oil filter \(genuine\), 90915-YZZD2 · × 1 · Bought for this job/ })).toBeVisible();
  expect(part('p1').quantity_in_stock).toBe(0);

  // A part that isn't on the list, bought for the job and written in.
  await used.getByRole('button', { name: 'Add a part' }).click();
  add = page.getByRole('dialog', { name: 'Add a part' });
  await add.getByRole('button', { name: 'Not on your list? Write it in' }).click();
  await add.getByLabel('Part', { exact: true }).fill('EGR gasket (NAPA)');
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(used.getByRole('button', { name: /EGR gasket \(NAPA\), × 1 · Bought for this job/ })).toBeVisible();

  // Mark it done with the fix; the fault is resolved with it.
  await page.getByRole('button', { name: 'Mark done' }).click();
  const done = page.getByRole('dialog', { name: 'Mark done' });
  await done.getByLabel('What fixed it?').fill('Cleaned the EGR valve and fitted a new gasket');
  await expect(done.getByRole('checkbox', { name: 'Mark the fault “Engine light on” resolved' })).toBeChecked();
  await done.getByRole('button', { name: 'Mark done' }).click();
  await expect(done).toBeHidden();
  await expect(page.getByRole('region', { name: 'Details' })).toContainText('Mo Mechanic');
  await expect(used.getByText('Reopen the job to change its parts.')).toBeVisible();
  await expect(used.getByRole('button', { name: 'Add a part' })).toHaveCount(0);
  await expect.poll(() => server.tables.Fault[0]).toMatchObject({ status: 'resolved', resolved_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });

  // The part's page shows the job it went on.
  await page.goto('/workshop/parts/p1');
  await expect(page.getByRole('region', { name: 'Used on jobs' }).getByRole('link', { name: /Engine light on/ })).toHaveCount(2);

  // Troubleshooting: the model's known problem and this fix, by fault code.
  await page.goto('/workshop/bus/bus-a/troubleshooting');
  await page.getByLabel('Search problems and fixes').fill('p0401');
  await expect(page.getByRole('region', { name: 'Known problems' })).toContainText('EGR valve sticks');
  const fixes = page.getByRole('region', { name: 'Past fixes' });
  await expect(fixes).toContainText('Engine light on');
  await expect(fixes).toContainText('Fixed by: Cleaned the EGR valve and fitted a new gasket');
  await expect(fixes).toContainText('Parts: Oil filter (genuine) × 2, EGR gasket (NAPA)');
  await page.screenshot({ path: '/tmp/tt-workshop-troubleshooting.png' });

  // Use these steps starts a new job with them, unticked.
  await fixes.getByRole('button', { name: 'Use the steps from Engine light on' }).click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/jobs\?from=WorkshopJob-1$/);
  const again = page.getByRole('dialog', { name: 'New job' });
  await expect(again.getByText('Starts with the 3 steps from “Engine light on”.')).toBeVisible();
  await again.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/jobs$/);

  // One search box finds it by the code too.
  await page.goto('/workshop/search?q=p0401');
  await expect(page.getByRole('region', { name: /^Jobs/ }).getByRole('link', { name: /Engine light on.*Done/ })).toBeVisible();

  // Reopened, a part can come off the job again: the shelf gets it back.
  await page.goto('/workshop/jobs/WorkshopJob-1');
  await page.getByRole('button', { name: 'Reopen' }).click();
  await used.getByRole('button', { name: /Oil filter \(genuine\), 90915-YZZD2 · × 1 · From the shelf/ }).click();
  const change = page.getByRole('dialog', { name: 'Part used' });
  await change.getByRole('button', { name: 'Remove from the job (1 back on the shelf)' }).click();
  await change.getByRole('button', { name: 'Tap again to delete' }).click();
  await expect(change).toBeHidden();
  await expect(used.getByRole('button', { name: /From the shelf/ })).toHaveCount(0);
  expect(part('p1').quantity_in_stock).toBe(1);
  await page.screenshot({ path: '/tmp/tt-workshop-job.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('when another screen took the parts first, the shelf count shown is the real one', async ({ page }) => {
  const { errors, server } = await open(page, '/workshop/jobs/j-open', { jobs: [OPEN_JOB] });
  const used = page.getByRole('region', { name: 'Parts used' });
  await used.getByRole('button', { name: 'Add a part' }).click();
  const add = page.getByRole('dialog', { name: 'Add a part' });
  await add.getByLabel('Find a part').fill('wheel nut');
  await add.getByRole('list', { name: 'Matching parts' }).getByRole('button', { name: /Wheel nut/ }).click();
  await add.getByRole('button', { name: 'One more' }).click();
  // Meanwhile the parts kiosk took 11 of the 12.
  server.tables.Part.find((p) => p.id === 'p3').quantity_in_stock = 1;
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Only 1 left on the shelf').first()).toBeVisible();
  await expect(add).toBeVisible();
  await expect(add.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  expect(server.tables.WorkshopJobPart).toEqual([]);
  expect(server.tables.Part.find((p) => p.id === 'p3').quantity_in_stock).toBe(1);
  // A mechanic can edit a job but not delete it.
  await add.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit job' }).getByRole('button', { name: /Delete job/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("an administrator deletes a job, and its shelf parts go back", async ({ page }) => {
  const line = { id: 'jp-1', job_id: 'j-open', part_id: 'p3', part_name: 'Wheel nut', part_number: '90942-01058', qty: 2, from_stock: true, created_date: iso(now - 1_800_000) };
  const { errors, server } = await open(page, '/workshop/jobs/j-open', { role: 'admin', jobs: [OPEN_JOB], jobParts: [line] });
  server.tables.Part.find((p) => p.id === 'p3').quantity_in_stock = 10;
  await page.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit job' });
  await edit.getByRole('button', { name: 'Delete job: its part goes back on the shelf' }).click();
  await edit.getByRole('button', { name: 'Tap again to delete' }).click();
  await expect(page).toHaveURL(/\/workshop\/jobs$/);
  expect(server.tables.WorkshopJob).toEqual([]);
  expect(server.tables.WorkshopJobPart).toEqual([]);
  expect(server.tables.Part.find((p) => p.id === 'p3').quantity_in_stock).toBe(12);
  await expect(page.getByText('No jobs yet.')).toBeVisible();
  expect(errors).toEqual([]);
});

test("the mechanic's Faults screen starts a job in the Workshop, and the Home shows open jobs", async ({ page }) => {
  const { errors } = await open(page, '/mechanic', { jobs: [OPEN_JOB] });
  await page.getByRole('link', { name: 'Job in the Workshop' }).click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/jobs\?fault=f-sg$/);
  await expect(page.getByRole('dialog', { name: 'New job' }).getByLabel("What's being done")).toHaveValue('Engine light on');
  await page.getByRole('dialog', { name: 'New job' }).getByRole('button', { name: 'Cancel' }).click();
  await page.goto('/workshop');
  await expect(page.getByRole('region', { name: 'Work' }).getByRole('link', { name: /Jobs.*1 open job/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /St\.George/ }).first()).toContainText('1 open job');
  await expect(page.getByRole('link', { name: /St\.George/ }).first()).toContainText('1 open fault');
  expect(errors).toEqual([]);
});

test('on a phone the jobs screens fit', async ({ page }) => {
  const line = { id: 'jp-1', job_id: 'j-open', part_id: 'p3', part_name: 'Wheel nut', part_number: '90942-01058', qty: 2, from_stock: true, created_date: iso(now - 1_800_000) };
  const { errors } = await open(page, '/workshop/jobs', { width: 390, height: 844, jobs: [{ ...OPEN_JOB, steps: [{ text: 'Refit the wheels and tighten in a star pattern', done: false, torque_id: 't1' }] }], jobParts: [line] });
  for (const path of ['/workshop/jobs', '/workshop/jobs/j-open', '/workshop/bus/bus-a/jobs', '/workshop/bus/bus-a/troubleshooting', '/workshop']) {
    await page.goto(path);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByRole('main')).not.toBeEmpty();
    await settle(page);
    await noSideScroll(page);
  }
  await page.goto('/workshop/jobs/j-open');
  await expect(page.getByRole('region', { name: 'Steps' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: '/tmp/tt-workshop-job-phone.png', fullPage: true });
  await page.getByRole('region', { name: 'Parts used' }).getByRole('button', { name: 'Add a part' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a part' })).toBeVisible();
  await settle(page);
  await noSideScroll(page);
  expect(errors).toEqual([]);
});
