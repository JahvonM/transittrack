import { test, expect } from '@playwright/test';

// A tablet set up as a kiosk (the boarding or signing tablet) that is now a
// driver tablet, or the other way round. The code from Admin → Kiosk tablets
// is typed on the screen the tablet was set up for: the app opens the right
// screen and pairs there with the same code. The locked screens also lead
// back to "What is this tablet for?".

const CODE = 'ABCD2345EFGH';

async function backend(page, kioskType) {
  const pairs = [];
  await page.route('https://api.mapbox.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: { current: { temperature_2m: 28, weather_code: 0 } } }));
  await page.route('**/api/**', (route) => {
    const fn = route.request().url().match(/\/functions\/([A-Za-z]+)/)?.[1];
    if (fn === 'pairKioskDevice') {
      const body = route.request().postDataJSON();
      pairs.push({ code: body.pairing_code, screen: body.expected_type });
      const driver = kioskType === 'driver';
      if (body.expected_type === 'kiosk' && driver) return route.fulfill({ status: 400, json: { error: 'Not a kiosk tablet', code: 'DRIVER_TABLET' } });
      if (body.expected_type === 'driver' && !driver) return route.fulfill({ status: 400, json: { error: 'Not a driver tablet', code: 'KIOSK_TABLET' } });
      return route.fulfill({ json: { device_id: 'dev-1', device_token: 'a'.repeat(64), kiosk_type: kioskType, company_id: 'a', company_name: 'Company A', vehicle_id: 'bus-a', vehicle_name: 'Bus 1' } });
    }
    if (fn) return route.fulfill({ json: {} });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  return pairs;
}
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

test('a driver tablet\'s code typed on the kiosk screen opens the driver screen and pairs there', async ({ page }) => {
  const pairs = await backend(page, 'driver');
  await page.goto('/kiosk');
  await expect(page.getByText('Have a pairing code? Enter it below to reconnect this tablet.')).toBeVisible();
  await page.getByPlaceholder('Pairing code').fill(CODE);
  await page.getByRole('button', { name: 'Pair' }).click();
  await expect(page).toHaveURL(/\/driver(\?|$)/);
  await expect.poll(() => pairs).toEqual([{ code: CODE, screen: 'kiosk' }, { code: CODE, screen: 'driver' }]);
  await expect.poll(() => stored(page, 'tt_driver_device_id')).toBe('dev-1');
  expect(await stored(page, 'tt_tablet_mode')).toBe('driver');
  await expect(page.getByText('Not a kiosk tablet')).toHaveCount(0);
});

test('a kiosk\'s code typed on the driver screen opens the kiosk screen and pairs there', async ({ page }) => {
  const pairs = await backend(page, 'bus_boarding');
  await page.goto('/driver');
  await expect(page.getByText('Enter your code', { exact: true })).toBeVisible();
  await page.getByPlaceholder('e.g. ABCD2345EFGH').fill(CODE);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page).toHaveURL(/\/kiosk(\?|$)/);
  await expect.poll(() => pairs).toEqual([{ code: CODE, screen: 'driver' }, { code: CODE, screen: 'kiosk' }]);
  await expect.poll(() => stored(page, 'tt_kiosk_device_id')).toBe('dev-1');
  expect(await stored(page, 'tt_tablet_mode')).toBe('kiosk');
});

test('the locked kiosk and driver screens lead back to choosing the tablet screen', async ({ page }) => {
  await backend(page, 'driver');
  await page.goto('/kiosk');
  await page.getByRole('link', { name: 'Choose tablet screen' }).click();
  await expect(page.getByRole('heading', { name: 'What is this tablet for?' })).toBeVisible();
  await page.getByRole('link', { name: /Driver tablet/ }).click();
  await expect(page).toHaveURL(/\/driver$/);
  await expect(page.getByText('Enter your code', { exact: true })).toBeVisible();
  expect(await stored(page, 'tt_tablet_mode')).toBe('driver');
  await page.getByRole('link', { name: 'Choose tablet screen' }).click();
  await expect(page.getByRole('heading', { name: 'What is this tablet for?' })).toBeVisible();
});
