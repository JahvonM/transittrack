import { test, expect } from '@playwright/test';

async function profile(page, failUpload = false) {
  const user = { id: 'test-person', role: 'driver', email: 'person@example.test', full_name: 'Test Person', photo_url: '/brand/icon-192.png' };
  const uploads = [], saves = [];
  await page.addInitScript(() => localStorage.setItem('base44_access_token', 'mock-profile-session'));
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.includes('/integration-endpoints/Core/')) {
      uploads.push({ url, body: route.request().postDataBuffer().toString() });
      return route.fulfill(failUpload ? { status: 503, json: { message: 'Upload temporarily unavailable' } } : { json: { file_url: '/brand/icon-512.png' } });
    }
    let b = {}; try { b = route.request().postDataJSON() || {}; } catch {}
    if (url.includes('/functions/entityAccess')) {
      if (b.entity === 'User' && b.operation === 'get') return route.fulfill({ json: { result: user } });
      if (b.entity === 'User' && b.operation === 'update') { saves.push(b); Object.assign(user, b.data); return route.fulfill({ json: { result: user } }); }
      return route.fulfill({ json: { result: [] } });
    }
    if (url.includes('/functions/')) return route.fulfill({ json: {} });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  await page.goto('/account');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1600; c.height = 800; return c.toDataURL('image/png').split(',')[1]; });
  return { uploads, saves, png };
}

test('profile photo uses a resized JPEG and only saves after Save', async ({ page }) => {
  const { uploads, saves, png } = await profile(page);
  await page.getByLabel('Profile photo').setInputFiles({ name: 'camera.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByText('Photo ready', { exact: true })).toBeVisible();
  expect(uploads).toHaveLength(1);
  expect(uploads[0].url).toContain('/Core/UploadFile');
  expect(uploads[0].body).toContain('filename="profile.jpg"');
  expect(uploads[0].body).toContain('image/jpeg');
  expect(saves).toHaveLength(0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  expect(saves[0].data.photo_url).toBe('/brand/icon-512.png');
});

test('failed profile upload keeps the old picture and permits retrying the same file', async ({ page }) => {
  const { uploads, saves, png } = await profile(page, true);
  const file = { name: 'camera.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
  await page.getByLabel('Profile photo').setInputFiles(file);
  await expect(page.getByText("Couldn't upload photo", { exact: true })).toBeVisible();
  await expect(page.getByLabel('Profile photo')).toBeEnabled();
  await page.getByLabel('Profile photo').setInputFiles(file);
  await expect.poll(() => uploads.length).toBe(2);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  expect(saves[0].data.photo_url).toBe('/brand/icon-192.png');
});

test('an avatar is uploaded like a photo, so the saved picture is a file link', async ({ page }) => {
  const { uploads, saves } = await profile(page);
  await page.getByRole('button', { name: 'Ocean avatar', exact: true }).click();
  await expect.poll(() => uploads.length).toBe(1);
  expect(uploads[0].url).toContain('/Core/UploadFile');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  expect(saves[0].data.photo_url).toBe('/brand/icon-512.png');
});

for (const path of ['/privacy', '/terms']) test(`${path} is readable signed out, with no invented contact details`, async ({ page }) => {
  await page.route('**/api/**', r => r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } }));
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The Privacy Policy still has decisions to confirm; the Terms are final.
  await expect(page.getByText('Review draft.', { exact: true })).toHaveCount(path === '/privacy' ? 1 : 0);
  await expect(page.locator('main')).toContainText('Mc Sween’s Transport and Reside Co.');
  await expect(page.locator('main')).not.toContainText('[COMPANY');
  await expect(page.locator('main')).not.toContainText('[CONTACT');
  await expect(page.locator('main')).not.toContainText('[RETENTION');
  expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  if (path === '/terms') {
    await expect(page.locator('main')).toContainText('Reply to any email we have sent you about your ride.');
    await expect(page.locator('main')).toContainText('tell us as early as possible');
    await expect(page.locator('main')).not.toContainText('Cancelling is free');
    await expect(page.locator('main')).not.toContainText('draft');
  }
});

test('/terms shows the business details and cancelling rule set in Admin', async ({ page }) => {
  await page.route('**/api/**', (r) => {
    if (r.request().url().includes('/functions/appSupport')) return r.fulfill({ json: { whatsapp_number: '14735550100', business: { contact_email: 'bookings@example.com', contact_phone: '+1 473 555 0199', business_address: 'Grand Anse, St. George, Grenada', cancel_free_hours: 24, cancel_late_charge: 'the full price' } } });
    return r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  await page.goto('/terms');
  const main = page.locator('main');
  await expect(main.getByRole('link', { name: 'bookings@example.com' })).toHaveAttribute('href', 'mailto:bookings@example.com');
  await expect(main.getByRole('link', { name: '+1 473 555 0199' })).toHaveAttribute('href', 'tel:+14735550199');
  await expect(main.getByRole('link', { name: '+14735550100' })).toHaveAttribute('href', 'https://wa.me/14735550100');
  await expect(main).toContainText('Address: Grand Anse, St. George, Grenada');
  await expect(main).toContainText('Cancelling is free until 24 hours before the pickup time. After that, the full price may be charged.');
});
