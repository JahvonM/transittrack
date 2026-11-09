import { test, expect } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';

// Admin -> the bell in the header and the notices that drop in under it:
// new jobs and ride requests, jobs started, completed, cancelled or not
// started on time, incidents, faults and lost items.

async function open(page, { lateJob = false, clock = false } = {}) {
  const data = fleetData();
  if (lateJob) data.tables.Trip.push({ id: 'job-late', company_id: 'a', vehicle_id: 'bus-b', vehicle_name: 'Bus 2', job_type: 'transfer', status: 'scheduled', scheduled_time: new Date(Date.now() - 20 * 60_000).toISOString(), pickup_name: 'Coyaba Beach Resort' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const session = await mockFleet(page, { role: 'admin', data });
  await page.setViewportSize({ width: 1440, height: 900 });
  if (clock) await page.clock.install();
  await page.goto('/admin/vehicles');
  return { data, errors, session };
}

test('a job not started on time pops up and stays until handled; Open goes to Jobs', async ({ page }) => {
  const { errors } = await open(page, { lateJob: true });
  const notices = page.getByRole('region', { name: 'New notifications' });
  const late = notices.getByRole('alert');
  await expect(late).toContainText('Job not started');
  await expect(late).toContainText('Bus 2 was due at');
  await expect(late).toContainText('Coyaba Beach Resort');
  await expect(page.getByRole('button', { name: 'Notifications, 1 new' })).toBeVisible();
  await page.screenshot({ path: '/tmp/tt-admin-alert.png' });
  await late.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/admin\/trips/);
  await expect(notices).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  // It's in the bell list, read.
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Notifications' }).getByRole('button', { name: /Job not started/ })).toBeVisible();
  // A reload doesn't pop it up again.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('region', { name: 'New notifications' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a new ride request pops up when the lists refresh, then goes; pop-ups can be turned off', async ({ page }) => {
  const { data, errors } = await open(page, { clock: true });
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.clock.fastForward(3000); // the first refresh: what's already there doesn't pop up
  await expect(page.getByRole('region', { name: 'New notifications' })).toHaveCount(0);

  data.tables.BookingRequest.push({ id: 'req-9', status: 'new', service: 'transfer', requested_time: new Date(Date.now() + 86_400_000).toISOString(), pickup: 'Spice Island Beach Resort', name: 'Ana Joseph', email: 'ana@example.com', created_date: new Date().toISOString() });
  await page.clock.fastForward(35_000);
  const notice = page.getByRole('region', { name: 'New notifications' }).getByRole('status');
  await expect(notice).toContainText('New ride request on the website');
  await expect(notice).toContainText('Spice Island Beach Resort');
  await expect(notice).not.toContainText('Ana');
  await expect(page.getByRole('button', { name: 'Notifications, 1 new' })).toBeVisible();
  // It goes by itself after a few seconds; the bell keeps it.
  await page.clock.fastForward(9000);
  await expect(page.getByRole('region', { name: 'New notifications' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Notifications, 1 new' }).click();
  await page.getByRole('button', { name: /New ride request on the website/ }).click();
  await expect(page).toHaveURL(/\/admin\/trips\?view=requests/);
  await expect(page.getByRole('group', { name: 'Jobs view' }).getByRole('button', { name: /Requests/ })).toHaveAttribute('aria-pressed', 'true');

  // Turned off: the next one is listed but doesn't pop up.
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('switch', { name: 'Pop-ups at the top of the page' }).click();
  await page.keyboard.press('Escape');
  data.tables.Fault.push({ id: 'fault-9', vehicle_id: 'bus-a', vehicle_name: 'Bus 1', title: 'Wing mirror cracked', severity: 'low', status: 'open', created_date: new Date(Date.now() + 40_000).toISOString() });
  await page.clock.fastForward(35_000);
  await expect(page.getByRole('button', { name: 'Notifications, 1 new' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'New notifications' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
