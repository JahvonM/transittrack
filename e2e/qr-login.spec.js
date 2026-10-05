import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import { test as base, expect } from '@playwright/test';

// The phone camera is a fake video of a real company join QR, so the scan
// itself runs end to end through the same scanner library as on a phone.
function cameraOf(text) {
  const W = 480, H = 480;
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, cell = Math.floor((W - 80) / (n + 8)), off = Math.floor((W - cell * n) / 2);
  const y = Buffer.alloc(W * H, 235);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.modules.get(r, c)) continue;
    for (let dy = 0; dy < cell; dy++) y.fill(16, (off + r * cell + dy) * W + off + c * cell, (off + r * cell + dy) * W + off + (c + 1) * cell);
  }
  const uv = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, uv, uv]);
  const file = path.join(os.tmpdir(), `tt-qr-camera-${process.pid}.y4m`);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame]));
  return file;
}
const camera = cameraOf('https://transittrack.example/join#code=ABCD2345EFGH');

const test = base.extend({
  launchOptions: [async ({ launchOptions }, use) => {
    await use({ ...launchOptions, args: [...(launchOptions.args || []), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${camera}`] });
  }, { scope: 'worker' }],
});

async function mockApi(page, { signedIn = false } = {}) {
  const verifies = [];
  await page.addInitScript((signedIn) => { if (signedIn) localStorage.setItem('base44_access_token', 'mock-authenticated-session'); }, signedIn);
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/functions/companyAccess')) {
      const b = route.request().postDataJSON();
      if (b.action === 'verify') { verifies.push(b.code); return route.fulfill({ json: { company: { id: 'a', name: 'Company A' }, grant: 'b'.repeat(64) } }); }
      return route.fulfill({ status: 401, json: { error: 'Company code required' } });
    }
    if (url.includes('/functions/entityAccess')) {
      const b = route.request().postDataJSON();
      if (!signedIn) return route.fulfill({ status: 401, json: { error: 'Not signed in' } });
      return route.fulfill({ json: { result: b.entity === 'User' ? { id: 'p', email: 'p@test.local', full_name: 'Pat Passenger', role: 'staff' } : [] } });
    }
    if (url.includes('/entities/User/me') && !signedIn) return route.fulfill({ status: 401, json: { error: 'Not signed in' } });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  return verifies;
}

test('login screen scans a company QR and joins the passenger after they sign in', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Scan company QR code' }).click();
  await expect(page.getByRole('dialog', { name: 'Scan your company QR' })).toBeVisible();
  // The pop-up closes by itself on the scan.
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByText('Company QR scanned.')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('tt_pending_company_code'))).toBe('ABCD2345EFGH');
  await expect(page.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/register?returnTo=%2Fjoin');
});

test('company code screen scans the QR in a pop-up and lets the passenger in', async ({ page }) => {
  const verifies = await mockApi(page, { signedIn: true });
  await page.goto('/staff');
  await expect(page.getByText('Enter your company code')).toBeVisible();
  await page.getByRole('button', { name: 'Scan company QR code' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15000 });
  await expect.poll(() => verifies).toEqual(['ABCD2345EFGH']);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tt_company_access_grant'))).toBe('b'.repeat(64));
});
