import { test, expect } from '@playwright/test';

// The service worker only switches the offline copy to a new version once
// every file of that version is saved, so a half-finished update can't leave
// a device unable to open.
const SHELL = 'tt-shell-v1';

async function ready(page) {
  await page.route('**/api/**', (r) => r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } }));
  await page.goto('/login');
  await expect(page.getByText('Welcome back')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async (name) => !!(await caches.match('/', { cacheName: name })), SHELL), { timeout: 30000 }).toBe(true);
  return page.evaluate(async (name) => (await (await caches.match('/', { cacheName: name })).text()), SHELL);
}
const stageNow = (page) => page.evaluate(() => new Promise((resolve) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => resolve(e.data);
  navigator.serviceWorker.controller.postMessage({ type: 'tt-stage-update' }, [ch.port2]);
}));
async function newDeploy(context, oldHtml, { brokenFile }) {
  const entry = oldHtml.match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
  const renamed = entry.replace('/index-', '/index-NEWBUILD-');
  const html = oldHtml.replace(entry, renamed);
  await context.route(/^http:\/\/localhost:4173\/(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await context.route('**' + renamed, async (r) => {
    if (brokenFile) return r.fulfill({ status: 404, body: '' });
    const real = await r.fetch({ url: 'http://localhost:4173' + entry });
    return r.fulfill({ response: real });
  });
  return renamed;
}

test('an update that cannot fully download keeps the last working version offline', async ({ page, context }) => {
  const oldHtml = await ready(page);
  const renamed = await newDeploy(context, oldHtml, { brokenFile: true });
  expect(await stageNow(page)).toEqual({ ok: false });
  const shell = await page.evaluate(async (name) => (await (await caches.match('/', { cacheName: name })).text()), SHELL);
  expect(shell).not.toContain(renamed);
  await context.unrouteAll();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Welcome back')).toBeVisible();
});

test('a complete update becomes the offline copy and opens with no connection', async ({ page, context }) => {
  const oldHtml = await ready(page);
  const renamed = await newDeploy(context, oldHtml, { brokenFile: false });
  expect(await stageNow(page)).toEqual({ ok: true });
  const shell = await page.evaluate(async (name) => (await (await caches.match('/', { cacheName: name })).text()), SHELL);
  expect(shell).toContain(renamed);
  await context.unrouteAll();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Welcome back')).toBeVisible();
});
