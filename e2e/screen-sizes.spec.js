import { test, expect } from '@playwright/test';
import { mockFleet } from './helpers/fleetFixture.js';
import { open as openWorkshop, noSideScroll, settle } from './helpers/workshopScan.js';

// The main screens on the shapes phones come in that the other tests don't
// cover: the narrow outer screen of a folding phone, a phone turned on its
// side, and the phone's text made twice as big. Each screen must fit the width
// (no sideways scrolling) and keep its main button on screen.

const SIZES = [
  { name: 'a folded phone', width: 344, height: 882 },
  { name: 'a phone on its side', width: 844, height: 390 },
];

const SCREENS = [
  { name: 'sign-in', path: '/login', signedIn: false, main: (page) => page.getByRole('button', { name: /^sign in$/i }) },
  { name: 'passenger home', path: '/', role: 'staff', main: (page) => page.getByRole('main').first() },
  { name: 'driver phone', path: '/driver-phone', role: 'driver', main: (page) => page.getByRole('main').first() },
  { name: 'Workshop home', path: '/workshop', workshop: true, main: (page) => page.getByRole('heading', { name: 'Workshop', exact: true }).first() },
];

async function show(page, screen, { width, height }) {
  if (screen.workshop) {
    await openWorkshop(page, screen.path, { role: 'mechanic', width, height });
  } else {
    await page.setViewportSize({ width, height });
    await mockFleet(page, { role: screen.role || 'staff', signedIn: screen.signedIn !== false });
    await page.goto(screen.path);
  }
  await expect(screen.main(page)).toBeVisible({ timeout: 15000 });
  await settle(page);
}

for (const size of SIZES) {
  for (const screen of SCREENS) {
    test(`${screen.name} fits ${size.name}`, async ({ page }) => {
      await show(page, screen, size);
      await noSideScroll(page);
      // On a short screen the main button may be further down: it must be
      // reachable by scrolling.
      await screen.main(page).scrollIntoViewIfNeeded();
      await expect(screen.main(page)).toBeInViewport({ ratio: 0.1 });
    });
  }
}

// Text made twice as big (the phone's own "larger text" setting): the app's
// sizes follow the page's root font size, so double it and check nothing
// pushes the page wider than the phone.
for (const screen of SCREENS) {
  test(`${screen.name} fits a phone with 200% text`, async ({ page }) => {
    await show(page, screen, { width: 390, height: 844 });
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await settle(page);
    await noSideScroll(page);
    await screen.main(page).scrollIntoViewIfNeeded();
    await expect(screen.main(page)).toBeVisible();
  });
}
