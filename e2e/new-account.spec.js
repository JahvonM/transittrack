import { test, expect } from '@playwright/test';

// A brand-new Google or Apple account was sent from the passenger screen to the
// login page, signed in again and landed straight back there, round and round.
async function newAccount(page, { companyAccess, meAfterCheck = null }) {
  const state = { role: 'user', me: 0, companyChecks: 0, logins: [] };
  await page.addInitScript(() => {
    localStorage.setItem('base44_access_token', 'mock-authenticated-session');
    localStorage.setItem('tt-map-engine', 'basic');
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/login') state.logins.push(frame.url());
  });
  await page.route('https://api.mapbox.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/functions/entityAccess')) {
      const body = route.request().postDataJSON();
      if (body.entity === 'User' && body.operation === 'get') {
        state.me += 1;
        if (state.companyChecks && meAfterCheck) return route.fulfill(meAfterCheck);
        return route.fulfill({ json: { result: { id: 'new', email: 'new@test.local', full_name: 'New Person', role: state.role } } });
      }
      return route.fulfill({ json: { result: [] } });
    }
    if (url.includes('/functions/companyAccess')) {
      state.companyChecks += 1;
      return route.fulfill(companyAccess(state));
    }
    if (url.includes('/functions/driverPhone')) return route.fulfill({ json: { driver: null } });
    if (url.includes('/functions/')) return route.fulfill({ json: {} });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  return state;
}

test('a brand-new account opens the company code screen instead of the login page', async ({ page }) => {
  const state = await newAccount(page, {
    companyAccess: (s) => { s.role = 'staff'; return { status: 401, json: { error: 'Company code required', code: 'COMPANY_ACCESS_REQUIRED' } }; },
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByText('Enter your company code')).toBeVisible();
  // The profile is refreshed once the server has made the account a passenger.
  await expect.poll(() => state.me).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(500);
  expect(state.logins).toEqual([]);
});

test('a refused company check while still signed in offers Retry, not the login page', async ({ page }) => {
  const state = await newAccount(page, {
    companyAccess: () => ({ status: 401, json: { error: 'Sign in to continue' } }),
  });
  await page.goto('/staff');
  await expect(page.getByText("Couldn't reconnect to your company")).toBeVisible();
  await expect(page).toHaveURL(/\/staff$/);
  expect(state.logins).toEqual([]);
});

test('a sign-in the server really ended still goes to the login page and back', async ({ page }) => {
  await newAccount(page, {
    companyAccess: () => ({ status: 401, json: { error: 'Sign in to continue' } }),
    meAfterCheck: { status: 401, json: { error: 'Authentication required' } },
  });
  await page.goto('/staff');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fstaff$/);
});
