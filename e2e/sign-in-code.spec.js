import { test, expect } from '@playwright/test';
import { SESSION_KEY, sessionJson, signInProviders } from './helpers/supabaseAuth.js';

// Someone who signed up but quit before typing the emailed code comes back to
// sign in: the sign-in page sends a new code and they finish signing in there.
// And a sign-up with a blank or broken email is answered in plain words,
// before anything is sent.

async function mockApi(page) {
  const auth = { resends: [], verifies: [], signups: 0 };
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/token?grant_type=password')) {
      return route.fulfill({ status: 400, json: { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' } });
    }
    if (url.includes('/auth/v1/resend')) { auth.resends.push(route.request().postDataJSON()); return route.fulfill({ json: {} }); }
    if (url.includes('/auth/v1/verify')) {
      const body = route.request().postDataJSON();
      auth.verifies.push(body);
      if (body.token !== '123456') return route.fulfill({ status: 403, json: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' } });
      return route.fulfill({ json: sessionJson('confirmed-session', { id: 'new-person', email: 'pat@example.com' }) });
    }
    if (url.includes('/auth/v1/signup')) { auth.signups += 1; return route.fulfill({ json: {} }); }
    if (url.includes('/functions/v1/entityAccess')) {
      const body = route.request().postDataJSON();
      if (body.entity === 'User') return route.fulfill({ json: { result: { id: 'new-person', email: 'pat@example.com', full_name: 'Pat', role: 'user' } } });
      return route.fulfill({ json: { result: [] } });
    }
    if (url.includes('/functions/')) return route.fulfill({ json: {} });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  await signInProviders(page, {});
  return auth;
}

test('an unconfirmed email gets a new code from the sign-in page and finishes signing in', async ({ page }) => {
  const auth = await mockApi(page);
  await page.goto('/login');
  await page.getByLabel(/email/i).first().fill('pat@example.com');
  await page.getByLabel(/^password$/i).fill('a-good-password');
  await page.getByRole('button', { name: /^sign in$/i }).click();

  const alert = page.getByRole('alert').filter({ hasText: "hasn't been confirmed" });
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'Send a new code' }).click();
  await expect.poll(() => auth.resends).toEqual([expect.objectContaining({ email: 'pat@example.com', type: 'signup' })]);

  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  await expect(page.getByText('We sent a 6-digit code to pat@example.com')).toBeVisible();
  const code = page.getByRole('textbox', { name: '6-digit code' });
  await code.fill('111111');
  await page.getByRole('button', { name: 'Confirm and sign in' }).click();
  await expect(page.getByRole('alert')).toContainText(/expired|ask for a new one/i);

  await page.getByRole('button', { name: 'Send another code' }).click();
  await expect(page.getByRole('status')).toContainText('A new code is on its way');
  expect(auth.resends).toHaveLength(2);

  await code.fill('123456');
  await page.getByRole('button', { name: 'Confirm and sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  expect(auth.verifies.at(-1)).toEqual(expect.objectContaining({ email: 'pat@example.com', token: '123456', type: 'signup' }));
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null')?.access_token, SESSION_KEY)).toBe('confirmed-session');
});

test('Edit email address returns to sign in from the code screen', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await page.getByLabel(/email/i).first().fill('pat@example.com');
  await page.getByLabel(/^password$/i).fill('a-good-password');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.getByRole('button', { name: 'Send a new code' }).click();
  await page.getByRole('button', { name: 'Edit email address' }).click();
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send a new code' })).toHaveCount(0);
});

test('sign-up says when the email is blank or broken, and sends nothing', async ({ page }) => {
  const auth = await mockApi(page);
  await page.goto('/register');
  const email = page.getByLabel(/email/i).first();
  await expect(email).toHaveAttribute('required', '');
  await page.getByLabel(/^password$/i).fill('a-good-password');
  await page.getByLabel(/confirm password/i).fill('a-good-password');
  await email.fill('pat@example');
  await page.getByRole('button', { name: /create account|sign up/i }).click();
  await expect(page.getByText("That email address doesn't look right. Check it and try again.")).toBeVisible();
  expect(auth.signups).toBe(0);
});
