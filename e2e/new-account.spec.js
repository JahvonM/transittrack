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

// Nobody has set the account up yet: say so (it used to get only the company
// code box), keep the code box for passengers who have one, and let them in as
// soon as an admin adds them.
test('an account nobody has set up yet sees it is waiting, and gets in once an admin adds it', async ({ page }) => {
  let approved = false;
  const state = await newAccount(page, {
    companyAccess: () => approved
      ? { json: { company: { id: 'a', name: 'Company A' }, grant: 'c'.repeat(64), my_bus: null } }
      : { status: 401, json: { error: 'Company code required', code: 'COMPANY_ACCESS_REQUIRED' } },
  });
  await page.goto('/staff');
  await expect(page.getByRole('heading', { name: 'Your account is waiting to be set up' })).toBeVisible();
  await expect(page.getByRole('main').getByText('New Person')).toBeVisible();
  await expect(page.getByRole('main').getByText('new@test.local')).toBeVisible();
  // Passengers with a code can still join on their own.
  await expect(page.getByText('Enter your company code')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  const before = state.companyChecks;
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Still waiting · checked at/ })).toBeVisible();
  expect(state.companyChecks).toBeGreaterThan(before);

  approved = true;
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('heading', { name: 'Your account is waiting to be set up' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tt_company_access_grant'))).toBe('c'.repeat(64));
  expect(state.logins).toEqual([]);
});

test('a join link still checks its code straight away, without the waiting screen', async ({ page }) => {
  await newAccount(page, { companyAccess: () => ({ status: 401, json: { error: 'Company code required', code: 'COMPANY_ACCESS_REQUIRED' } }) });
  await page.addInitScript(() => sessionStorage.setItem('tt_pending_company_code', 'ABCD2345EFGH'));
  await page.goto('/staff');
  await expect(page.getByText('Enter your company code')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your account is waiting to be set up' })).toHaveCount(0);
});
