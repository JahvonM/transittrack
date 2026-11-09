import { test, expect } from '@playwright/test';
import { mockFleet } from './helpers/fleetFixture.js';

// Admin menu: the everyday screens sit at the top, and three of them are hubs
// (Jobs, Vehicles & drivers, Routes). A hub is one menu link; its screens are
// tabs under the page title. Live fleet is one page of its own (the camera wall
// and Fleet health open on it), and so is Passengers (card issuing, card
// design and the sign-in log open on it); Sign-up day has its own link.
// Every old address still opens its own screen.
const HUBS = [
  ['Jobs', [['Jobs', 'trips'], ['Completed & billing', 'billing']]],
  ['Vehicles & drivers', [['Vehicles', 'vehicles'], ['Drivers', 'drivers'], ['Driver shifts', 'shifts']]],
  ['Routes', [['Route planner', 'route-planner'], ['Route explorer', 'route-explorer'], ['Plan pickups', 'plan-pickups'], ['Travel times', 'travel-times']]],
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
  for (const name of ['Overview', 'Live fleet', 'Jobs', 'Vehicles & drivers', 'Routes', 'Passengers', 'Sign-up day', 'Users & roles', 'Companies']) {
    await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // The screens inside a hub, and the parts of the Live fleet and Passengers
  // pages, are not separate menu links.
  for (const name of ['Live map', 'Fleet workspace', 'Fleet health', 'Drivers', 'Route planner', 'Passenger directory', 'Card issuing', 'Card designer', 'Sign-in log']) {
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
  // Live fleet is one page, with no tabs under its title.
  await nav.getByRole('button', { name: 'Live fleet', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/fleet$/);
  await expect(heading(page, 'Live fleet')).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Live fleet', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: /tabs$/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Buses' })).toBeVisible();
  // Passengers is one page, with no tabs under its title.
  await nav.getByRole('button', { name: 'Passengers', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/directory$/);
  await expect(heading(page, 'Passengers')).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Passengers', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: /tabs$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Rita Rider', exact: true })).toBeVisible();
  // Sign-up day is its own page.
  await nav.getByRole('button', { name: 'Sign-up day', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/signup-day$/);
  await expect(heading(page, 'Sign-up day')).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Sign-up day', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: /tabs$/ })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Vehicles & drivers', exact: true }).click();
  await page.screenshot({ path: '/tmp/tt-admin-hub-vehicles.png' });
  expect(errors).toEqual([]);
});

test('an old address opens its part of the page, and a hub link comes back to the last tab used', async ({ page }) => {
  const errors = await open(page, '/admin/card-designs');
  // The old card designer address opens Passengers with Card design open.
  const design = page.getByRole('dialog', { name: 'Card design' });
  await expect(design.getByRole('button', { name: 'Download PNG', exact: true })).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Passengers');
  await page.screenshot({ path: '/tmp/tt-admin-hub-passengers.png' });
  // Closing it leaves the Passengers page at its own address.
  await page.keyboard.press('Escape');
  await expect(design).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/directory$/);
  await expect(heading(page, 'Passengers')).toBeVisible();
  await expect(menu(page).getByRole('button', { name: 'Passengers', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Open Rita Rider', exact: true })).toBeVisible();
  const nav = menu(page);
  // A hub link comes back to the tab last used in it.
  await nav.getByRole('button', { name: 'Vehicles & drivers', exact: true }).click();
  await page.getByRole('navigation', { name: 'Vehicles & drivers tabs' }).getByRole('link', { name: 'Driver shifts', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/shifts$/);
  await nav.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$|\/admin\/overview$/);
  await nav.getByRole('button', { name: 'Vehicles & drivers', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/shifts$/);
  // The search box finds a hub by its own name too.
  await nav.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search admin' }).fill('routes');
  await page.getByRole('option', { name: 'Routes', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/route-planner$/);
  await expect(heading(page, 'Routes')).toBeVisible();
  // ...and a part of the Passengers page by its name.
  await page.getByRole('combobox', { name: 'Search admin' }).fill('sign-in log');
  await page.getByRole('option', { name: 'Sign-in log', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/checkins$/);
  await expect(page.getByRole('dialog', { name: 'Sign-in log' })).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Passengers');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Sign-in log' })).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/directory$/);
  // ...and a part of the Live fleet page by its name.
  await page.getByRole('combobox', { name: 'Search admin' }).fill('fleet health');
  await page.getByRole('option', { name: 'Fleet health', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/health$/);
  await expect(page.getByRole('dialog', { name: 'Fleet health' })).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Live fleet');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Fleet health' })).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/fleet$/);
  await expect(nav.getByRole('button', { name: 'Live fleet', exact: true })).toHaveAttribute('aria-current', 'page');
  // Folding groups still work for the rest.
  await expect(nav.getByRole('button', { name: 'Maintenance', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await nav.getByRole('button', { name: 'Maintenance', exact: true }).click();
  await nav.getByRole('button', { name: 'Faults', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/faults$/);
  await expect(page.getByRole('navigation', { name: /tabs$/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('on a phone the tabs scroll sideways and start at the open tab; the page does not', async ({ page }) => {
  const errors = await open(page, '/admin/travel-times', { width: 390, height: 844 });
  await expect(heading(page, 'Routes')).toBeVisible();
  const routes = page.getByRole('navigation', { name: 'Routes tabs' });
  await expect(routes.getByRole('link', { name: 'Travel times', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(routes.getByRole('link', { name: 'Travel times', exact: true })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // The old sign-in log address opens Passengers with the log over it.
  await page.goto('/admin/checkins');
  await expect(page.getByRole('dialog', { name: 'Sign-in log' })).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Passengers');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/tt-admin-hub-phone.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Sign-in log' })).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/directory$/);
  await expect(heading(page, 'Passengers')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Live fleet fits a phone too.
  await page.goto('/admin/fleet');
  await expect(page.getByRole('region', { name: 'Buses' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('button', { name: 'Vehicles & drivers', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/vehicles$/);
  await page.getByRole('navigation', { name: 'Vehicles & drivers tabs' }).getByRole('link', { name: 'Drivers', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/drivers$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
