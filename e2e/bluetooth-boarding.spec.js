import { test, expect } from '@playwright/test';

// Passenger phone: "Board by Bluetooth" sends the same code as the boarding QR
// to the bus tablet the passenger picks (Web Bluetooth, Chrome on Android).
async function passenger(page, { bluetooth = true } = {}) {
  await page.addInitScript((withBluetooth) => {
    localStorage.setItem('base44_access_token', 'mock-authenticated-session');
    window.__btWritten = [];
    const device = {
      name: 'Bus 12',
      gatt: {
        connect: async () => ({
          getPrimaryService: async (service) => { window.__btService = service; return {
            getCharacteristic: async () => ({ writeValueWithResponse: async (bytes) => { window.__btWritten.push(new TextDecoder().decode(bytes)); } }),
          }; },
        }),
        disconnect: () => { window.__btDisconnected = true; },
      },
    };
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: withBluetooth ? { requestDevice: async (options) => { window.__btOptions = options; return device; } } : undefined });
  }, bluetooth);
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/functions/entityAccess')) {
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { result: body.entity === 'User' && body.operation === 'get' ? { id: 'p', email: 'p@test.local', full_name: 'Pat Passenger', role: 'staff' } : [] } });
    }
    if (url.includes('/functions/generateOneTimeCode')) return route.fulfill({ json: { qr_token: 'QRTOKEN1', has_code: true, permanent: true } });
    if (url.includes('/functions/')) return route.fulfill({ json: {} });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  await page.goto('/account');
  await expect(page.getByText('My permanent boarding QR')).toBeVisible();
}

test('a passenger boards by Bluetooth from their boarding pass', async ({ page }) => {
  await passenger(page);
  await page.getByRole('button', { name: 'Board by Bluetooth' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sent to Bus 12' })).toBeVisible();
  expect(await page.evaluate(() => window.__btWritten)).toEqual(['tt-code:QRTOKEN1']);
  expect(await page.evaluate(() => window.__btOptions)).toEqual({ filters: [{ services: ['7a1c0d3e-5b6f-4c2a-9e41-2f7d8b6a1c01'] }] });
  expect(await page.evaluate(() => window.__btDisconnected)).toBe(true);
});

test('a phone without Web Bluetooth is told to use the QR instead', async ({ page }) => {
  await passenger(page, { bluetooth: false });
  await expect(page.getByText(/Works in Chrome on Android phones/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Board by Bluetooth' })).toHaveCount(0);
});
