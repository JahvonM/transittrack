import { test, expect } from '@playwright/test';
import { webcrypto } from 'node:crypto';

// The phone app opens /phone-signin in the phone's browser for Google/Apple
// sign-in; the page hands the session back to the app, sealed with the key
// from the # part of the link.
const STATE = 'S'.repeat(20) + 'tate_' + 'x'.repeat(18);
const KEY_BYTES = new Uint8Array(32).map((_, i) => (i * 7 + 3) % 256);
const KEY = Buffer.from(KEY_BYTES).toString('base64url');
// A Supabase session: the app is handed "<access token>~<refresh token>".
const TOKEN = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1MSJ9.sig';
const HANDOFF = `${TOKEN}~test-refresh-token`;

async function mockServer(page, { signedIn }) {
  const seen = { providerLogins: [] };
  if (signedIn) {
    await page.addInitScript((token) => { localStorage.setItem('sb-localhost-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,expires_at:4102444800,user:{id:'test-user'}})); }, TOKEN);
  }
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/functions/v1/entityAccess')) {
      const body = route.request().postDataJSON();
      if (body.entity === 'User' && body.operation === 'get') {
        if (!signedIn) return route.fulfill({ status: 401, json: { error: 'Authentication required' } });
        return route.fulfill({ json: { result: { id: 'u1', email: 'rider@test.local', full_name: 'Rider', role: 'staff' } } });
      }
      return route.fulfill({ json: { result: [] } });
    }
    if (url.includes('/functions/')) return route.fulfill({ json: {} });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  // Supabase Auth's Google/Apple sign-in starts at /authorize.
  await page.route('**/api/auth/v1/authorize**', async (route) => {
    seen.providerLogins.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: '<p>provider</p>' });
  });
  return seen;
}

async function openSealed(link) {
  const u = new URL(link);
  const iv = Buffer.from(u.searchParams.get('iv'), 'base64url');
  const data = Buffer.from(u.searchParams.get('data'), 'base64url');
  const key = await webcrypto.subtle.importKey('raw', KEY_BYTES, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(u.searchParams.get('state')) }, key, data);
  return new TextDecoder().decode(plain);
}

test('signed in: asks first, then hands the app a sealed session only its key opens', async ({ page }) => {
  await mockServer(page, { signedIn: true });
  await page.goto(`/phone-signin?state=${STATE}&provider=google#k=${KEY}`);
  await expect(page.getByText('rider@test.local')).toBeVisible();
  // The key leaves the address bar once read.
  expect(page.url()).not.toContain('#k=');
  const open = page.getByRole('link', { name: 'Open McSween Transport app' });
  await expect(open).toBeVisible();
  const href = await open.getAttribute('href');
  expect(href).toMatch(new RegExp(`^com\\.transittrack\\.app://signin\\?state=${STATE}&iv=`));
  expect(href).not.toContain(TOKEN);
  expect(await openSealed(href)).toBe(HANDOFF);
});

test('signed out: goes straight to Google and comes back to the same sign-in, without the key', async ({ page }) => {
  const seen = await mockServer(page, { signedIn: false });
  await page.goto(`/phone-signin?state=${STATE}&provider=google#k=${KEY}`);
  await expect.poll(() => seen.providerLogins.length).toBe(1);
  const login = new URL(seen.providerLogins[0]);
  expect(login.pathname).toBe('/api/auth/v1/authorize');
  expect(login.searchParams.get('provider')).toBe('google');
  const back = new URL(login.searchParams.get('redirect_to'));
  expect(back.pathname).toBe('/phone-signin');
  expect(back.searchParams.get('state')).toBe(STATE);
  expect(seen.providerLogins[0]).not.toContain(KEY);
});

test('a link without the app key is refused', async ({ page }) => {
  await mockServer(page, { signedIn: true });
  await page.goto(`/phone-signin?state=${STATE}&provider=google`);
  await expect(page.getByText("This sign-in link isn't valid")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open McSween Transport app' })).toHaveCount(0);
});

test('Cancel shares nothing with the app', async ({ page }) => {
  await mockServer(page, { signedIn: true });
  await page.goto(`/phone-signin?state=${STATE}&provider=apple#k=${KEY}`);
  await expect(page.getByRole('link', { name: 'Open McSween Transport app' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('App sign-in cancelled')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open McSween Transport app' })).toHaveCount(0);
});
