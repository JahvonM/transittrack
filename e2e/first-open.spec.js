import { test, expect } from '@playwright/test';

// The first time someone opens the app in a browser they're asked to get the
// app (a walkthrough on iPhone/iPad, the Install button on Android), then to
// allow notifications, location, camera and microphone in one go.
//
// Automated browsers normally skip these screens (navigator.webdriver), so
// every other test opens straight to its page; these tests switch that off.

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

async function asPerson(page, { installOffer = false } = {}) {
  await page.addInitScript((offer) => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    if (offer) {
      // What Chrome on Android sends when the app can be installed.
      window.addEventListener('load', () => setTimeout(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => { window.__installAsked = true; };
        event.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(event);
      }, 50));
    }
  }, installOffer);
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/functions/entityAccess')) return route.fulfill({ status: 401, json: { error: 'Authentication required' } });
    if (url.includes('/functions/')) return route.fulfill({ json: {} });
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
}
const setup = (page) => page.getByRole('dialog', { name: /McSween|Allow what the app needs|Home Screen/ });

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE, viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test('walks through adding the app to the Home Screen, once', async ({ page }) => {
    await asPerson(page);
    await page.goto('/login');
    const dialog = setup(page);
    await expect(dialog.getByRole('heading', { name: 'Add McSween Transport to your iPhone' })).toBeVisible();
    await expect(dialog.getByText('Step 1 of 2')).toBeVisible();
    for (const text of ['Tap the Share button', 'Add to Home Screen', 'Open McSween Transport from your Home Screen']) {
      await expect(dialog.getByText(text, { exact: false }).first()).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/tt-first-open-iphone.png' });
    await dialog.getByRole('button', { name: "I've added it" }).click();
    await expect(dialog.getByRole('heading', { name: 'Now open it from your Home Screen' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(setup(page)).toHaveCount(0);
    await page.reload();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await page.waitForTimeout(900);
    await expect(setup(page)).toHaveCount(0);
  });

  test('"Not now" goes on to the permissions, and Allow all asks for every one', async ({ page, context }) => {
    await asPerson(page);
    await page.goto('/login');
    const dialog = setup(page);
    await dialog.getByRole('button', { name: 'Not now' }).click();
    await expect(dialog.getByRole('heading', { name: 'Allow what the app needs' })).toBeVisible();
    await expect(dialog.getByText('Step 2 of 2')).toBeVisible();
    for (const title of ['Notifications', 'Location', 'Camera and microphone']) await expect(dialog.getByText(title, { exact: true })).toBeVisible();
    await page.screenshot({ path: '/tmp/tt-first-open-permissions.png' });
    await context.grantPermissions(['notifications', 'geolocation', 'camera', 'microphone']);
    await context.setGeolocation({ latitude: 12.0561, longitude: -61.7488 });
    await dialog.getByRole('button', { name: 'Allow all' }).click();
    await expect(dialog.getByText('Allowed', { exact: true })).toHaveCount(3);
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(setup(page)).toHaveCount(0);
    expect(await page.evaluate(() => Notification.permission)).toBe('granted');
  });
});

test.describe('on an Android phone', () => {
  test.use({ userAgent: ANDROID, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });

  test('the Install button opens the browser\'s own install, then the permissions follow', async ({ page }) => {
    await asPerson(page, { installOffer: true });
    await page.goto('/login');
    const dialog = setup(page);
    await expect(dialog.getByRole('heading', { name: 'Install the McSween Transport app' })).toBeVisible();
    await page.screenshot({ path: '/tmp/tt-first-open-android.png' });
    await dialog.getByRole('button', { name: 'Install the app' }).click();
    expect(await page.evaluate(() => window.__installAsked)).toBe(true);
    await expect(dialog.getByRole('heading', { name: 'Allow what the app needs' })).toBeVisible();
    // A blocked permission says so, and closing is remembered.
    await dialog.getByRole('button', { name: 'Allow notifications' }).click();
    await expect(dialog.getByText('Blocked', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Not now' }).click();
    await expect(setup(page)).toHaveCount(0);
  });

  test('without an install offer it shows the browser-menu steps', async ({ page }) => {
    await asPerson(page);
    await page.goto('/login');
    const dialog = setup(page);
    await expect(dialog.getByRole('heading', { name: 'Add McSween Transport to your phone' })).toBeVisible();
    await expect(dialog.getByText('Install app', { exact: true })).toBeVisible();
  });
});

test('a guest following a ride link is not interrupted', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await asPerson(page);
  await page.goto('/track?t=abc');
  await page.waitForTimeout(1600);
  await expect(setup(page)).toHaveCount(0);
});
