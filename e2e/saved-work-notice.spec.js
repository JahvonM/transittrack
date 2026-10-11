import { test, expect } from '@playwright/test';

// The "saved items" notice used to flicker up for every short signal drop, and
// sat over the bus tablets' screens where nobody can act on it.
async function withSaved(page, items) {
  await page.addInitScript((list) => {
    localStorage.setItem('base44_access_token', 'mock-authenticated-session');
    localStorage.setItem('tt_offline_jobs', JSON.stringify(list));
  }, items);
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/functions/entityAccess')) {
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { result: body.entity === 'User' ? { id: 'u', email: 'u@test.local', full_name: 'U', role: 'admin' } : [] } });
    }
    if (url.includes('/functions/')) return route.fulfill({ status: 503, json: { error: 'down' } });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
}
const job = (id, queuedAt, extra = {}) => ({ id, kind: 'driver_inspection', label: 'Inspection', queued_at: queuedAt, payload: { client_request_id: id }, ...extra });

test('work saved moments ago does not put up a notice', async ({ page }) => {
  await withSaved(page, [job('fresh', new Date().toISOString())]);
  await page.goto('/login');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByRole('status').filter({ hasText: /saved item/ })).toHaveCount(0);
});

test('work waiting more than two minutes shows one notice', async ({ page }) => {
  await withSaved(page, [job('old', new Date(Date.now() - 5 * 60_000).toISOString())]);
  await page.goto('/login');
  await expect(page.getByRole('status').filter({ hasText: '1 saved item waiting to upload' })).toBeVisible();
});

test('bus tablet screens never show the notice', async ({ page }) => {
  await withSaved(page, [job('review', '2026-10-03T12:00:00Z', { state: 'needs_review', last_error: 'Rejected' })]);
  await page.goto('/kiosk');
  await page.waitForTimeout(1500);
  await expect(page.getByRole('status').filter({ hasText: /saved item/ })).toHaveCount(0);
  await page.goto('/login');
  await expect(page.getByRole('status').filter({ hasText: '1 saved item needs review' })).toBeVisible();
});
