import { test, expect } from '@playwright/test';
import { mockFleet } from './helpers/fleetFixture.js';

// Admin menu: the everyday screens sit at the top, and four of them are hubs
// (Live fleet, Vehicles & drivers, Routes, Passengers). A hub is one menu link;
// its screens are tabs under the page title. Every old address still opens
// its own tab.
const HUBS = [
  ['Live fleet', [['Live map', 'fleet'], ['Fleet workspace', 'fleet-workspace'], ['Fleet health', 'health']]],
  ['Vehicles & drivers', [['Vehicles', 'vehicles'], ['Drivers', 'drivers'], ['Driver shifts', 'shifts']]],
  ['Routes', [['Route planner', 'route-planner'], ['Route explorer', 'route-explorer'], ['Plan pickups', 'plan-pickups'], ['Travel times', 'travel-times']]],
  ['Passengers', [['Directory', 'directory'], ['Sign-up day', 'signup-day'], ['Card issuing', 'cards'], ['Card designer', 'card-designs'], ['Sign-in log', 'checkins']]],
];

async function open(page, path = '/admin', size = { width: 1440, height: 900 }) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockFleet(page, { role: 'admin' });
  await page.setViewportSize(size);
  await page.goto(path);
  return errors;
}
const menu = (page) => page.getByRole('navigation', { name: 'Admin', exact: true });
const heading = (page, name) => page.getByRole('heading', { level: 1, name, exact: true });

test('each hub is one menu link, and its screens are tabs under the title', async ({ page }) => {
  const errors = await open(page);
  const nav = menu(page);
  // At the top of the menu, with nothing to unfold.
  for (const name of ['Overview', 'Live fleet', 'Jobs', 'Vehicles & drivers', 'Routes', 'Passengers', 'Users & roles', 'Companies']) {
    await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // The screens inside a hub are not separate menu links any more.
  for (const name of ['Fleet workspace', 'Drivers', 'Route planner', 'Passenger directory', 'Card issuing', 'Sign-in log']) {
    await expect(nav.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  for (const [hub, tabs] of HUBS) {
    await nav.getByRole('button', { name: hub, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/${tabs[0][1]}$`));
    await expect(heading(page, hub)).toBeVisible();
    await expect(nav.getByRole('button', { name: hub, exact: true })).toHaveAttribute('aria-current', 'page');
    const row = page.getByRole('navigation', { name: `${hub} tabs` });
    await expect(row.getByRole('link')).toHaveText(tabs.map(([label]) => label));
    for (const [label, id] of tabs) {
      await row.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/${id}$`));
      await expect(row.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(heading(page, hub)).toBeVisible();
    }
  }
  await nav.getByRole('button', { name: 'Vehicles & drivers', exact: true }).click();
  await page.screenshot({ path: '/tmp/tt-admin-hub-vehicles.png' });
  expect(errors).toEqual([]);
});

test('an old address opens its tab, and a hub link comes back to the last tab used', async ({ page }) => {
  const errors = await open(page, '/admin/card-designs');
  await expect(heading(page, 'Passengers')).toBeVisible();
  const row = page.getByRole('navigation', { name: 'Passengers tabs' });
  await expect(row.getByRole('link', { name: 'Card designer', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/tt-admin-hub-passengers.png' });
  const nav = menu(page);
  await nav.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$|\/admin\/overview$/);
  await nav.getByRole('button', { name: 'Passengers', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/card-designs$/);
  // The search box finds a hub by its own name too.
  await nav.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search admin' }).fill('routes');
  await page.getByRole('option', { name: 'Routes', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/route-planner$/);
  await expect(heading(page, 'Routes')).toBeVisible();
  // Folding groups still work for the rest.
  await expect(nav.getByRole('button', { name: 'Maintenance', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await nav.getByRole('button', { name: 'Maintenance', exact: true }).click();
  await nav.getByRole('button', { name: 'Faults', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/faults$/);
  await expect(page.getByRole('navigation', { name: /tabs$/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('on a phone the tabs scroll sideways and start at the open tab; the page does not', async ({ page }) => {
  const errors = await open(page, '/admin/checkins', { width: 390, height: 844 });
  await expect(heading(page, 'Passengers')).toBeVisible();
  const row = page.getByRole('navigation', { name: 'Passengers tabs' });
  await expect(row.getByRole('link', { name: 'Sign-in log', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(row.getByRole('link', { name: 'Sign-in log', exact: true })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/tt-admin-hub-phone.png' });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('button', { name: 'Vehicles & drivers', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/vehicles$/);
  await page.getByRole('navigation', { name: 'Vehicles & drivers tabs' }).getByRole('link', { name: 'Drivers', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/drivers$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
