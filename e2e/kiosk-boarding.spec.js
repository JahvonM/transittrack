import { test, expect } from '@playwright/test';

// The bus boarding tablet, end to end, with the server mocked.
const TOKEN = 'a'.repeat(64);
const person = { id: 'p1', full_name: 'Maria Joseph', photo_url: '' };
const device = () => ({
  device_id: 'tab-1', paired: true, status: 'active', kiosk_type: 'bus_boarding', company_id: 'a', company_name: 'Spice Isle Tours',
  vehicle_id: 'bus-a', vehicle_name: 'Bus 12',
  context: { vehicle: { id: 'bus-a', name: 'Bus 12', capacity: 30, current_lat: 12.05, current_lng: -61.75 }, route: { stops: [{ name: 'Grand Anse', lat: 12.02, lng: -61.76 }] }, ads: [], occupancy: 4, today_count: 9 },
});

async function setup(page, { heartbeat = () => ({ json: device() }), checkIn = () => null, paired = true, queue } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(({ paired, TOKEN, queue }) => {
    if (paired) { localStorage.setItem('tt_kiosk_device_id', 'tab-1'); localStorage.setItem('tt_device_token_tab-1', TOKEN); }
    if (queue !== undefined) localStorage.setItem('tt_offline_checkins', queue);
  }, { paired, TOKEN, queue });
  await page.route('https://api.mapbox.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: { current: { temperature_2m: 29, weather_code: 1 } } }));
  const calls = [];
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch { /* no body */ }
    if (url.includes('/functions/kioskHeartbeat')) return route.fulfill(heartbeat(body));
    if (url.includes('/functions/pairKioskDevice')) { calls.push(['pair', body.pairing_code]); return route.fulfill({ json: { ...device(), device_token: TOKEN } }); }
    if (url.includes('/functions/kioskCheckIn')) {
      calls.push([body.action, body.status || '']);
      const r = checkIn(body);
      if (r === 'abort') return route.abort('internetdisconnected');
      if (r) return route.fulfill(r);
      if (body.action === 'offline_directory') return route.fulfill({ json: { staff: [] } });
      return route.fulfill({ status: 400, json: { error: 'Unknown action' } });
    }
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  return { calls, errors };
}

async function unlock(page) {
  const track = page.getByText('Slide to check in', { exact: true }).locator('..');
  const b = await track.boundingBox();
  await page.mouse.move(b.x + 36, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 30, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}
const tap = (page) => page.evaluate(() => {
  localStorage.setItem('tt_badge_reader', '1');
  window.dispatchEvent(new CustomEvent('tt-badge', { detail: '04FFEE' + Math.floor(Math.random() * 1e6) }));
});
async function inView(locator, page) {
  const b = await locator.boundingBox();
  const v = page.viewportSize();
  return !!b && b.y >= 0 && b.y + b.height <= v.height;
}

for (const [w, h] of [[1280, 800], [800, 1280], [1024, 600], [1920, 1200]]) {
  test(`boarding tablet keeps the slider and keypad on screen at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const { errors } = await setup(page);
    await page.goto('/kiosk');
    const slider = page.getByText('Slide to check in', { exact: true }).locator('..');
    await expect(slider).toBeVisible();
    expect(await inView(slider, page)).toBe(true);
    await unlock(page);
    const submit = page.getByRole('button', { name: 'Submit code', exact: true });
    await expect(submit).toBeVisible();
    expect(await inView(submit, page)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('card tap boards a passenger and the tablet locks again', async ({ page }) => {
  const { calls } = await setup(page, {
    checkIn: (b) => b.action === 'lookup_tag' ? { json: { staff: person, next_status: 'boarded', verification_grant: 'b'.repeat(64) } }
      : b.action === 'check_in' ? { json: { record: { staff_name: 'Maria Joseph', status: b.status }, occupancy: 5, today_count: 10 } } : null,
  });
  await page.goto('/kiosk');
  await expect(page.getByText('Slide to check in', { exact: true })).toBeVisible();
  await tap(page);
  await expect(page.getByText('Are you boarding or exiting?')).toBeVisible();
  await page.getByRole('button', { name: /Boarding/ }).click();
  await expect(page.getByText(/Welcome aboard, Maria!/)).toBeVisible();
  await expect(page.getByText('Slide to check in', { exact: true })).toBeVisible({ timeout: 6000 });
  expect(calls.filter(([a]) => a === 'check_in')).toEqual([['check_in', 'boarded']]);
});

test('boarding tablet explains unknown cards, rate limits and lost pairing', async ({ page }) => {
  const state = { mode: 'unknown' };
  await setup(page, {
    checkIn: (b) => {
      if (b.action !== 'lookup_tag') return null;
      if (state.mode === 'unknown') return { status: 404, json: { error: 'badge_not_registered' } };
      if (state.mode === '429') return { status: 429, json: { error: 'Too many attempts' } };
      return { status: 401, json: { error: 'Invalid or unpaired kiosk device' } };
    },
  });
  await page.goto('/kiosk');
  await expect(page.getByText('Slide to check in', { exact: true })).toBeVisible();
  await tap(page);
  await expect(page.getByText(/This card isn't registered yet/)).toBeVisible();
  await expect(page.getByText('Slide to check in', { exact: true })).toBeVisible({ timeout: 6000 });
  state.mode = '429';
  await tap(page);
  await expect(page.getByText('Too many attempts. Try again in a minute.')).toBeVisible();
  await expect(page.getByText(/Connect to WiFi to verify/)).toHaveCount(0);
  await expect(page.getByText('Slide to check in', { exact: true })).toBeVisible({ timeout: 8000 });
  state.mode = 'unpaired';
  await tap(page);
  await expect(page.getByText(/pairing was reset/)).toBeVisible();
});

test('a typed code check-in is saved on the tablet when the connection drops', async ({ page }) => {
  await setup(page, {
    checkIn: (b) => b.action === 'lookup_code' ? { json: { staff: person, next_status: 'off_board', code_type: 'access', verification_grant: 'c'.repeat(64) } }
      : b.action === 'check_in' ? 'abort' : null,
  });
  await page.goto('/kiosk');
  await unlock(page);
  for (const d of '123456789012') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Submit code', exact: true }).click();
  await expect(page.getByText('Are you boarding or exiting?')).toBeVisible();
  await page.getByRole('button', { name: /Exiting/ }).click();
  await expect(page.getByText('See you later, Maria!')).toBeVisible();
  await expect(page.getByText(/Saved offline/)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tt_offline_checkins') || '[]').length)).toBe(1);
});

test('an unpaired tablet keeps the real reason on screen', async ({ page }) => {
  await setup(page, { heartbeat: () => ({ status: 401, json: { error: 'Device authentication required' } }) });
  await page.goto('/kiosk');
  await expect(page.getByText(/no longer paired/)).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByText(/no longer paired/)).toBeVisible();
});

test('pairing from a link removes the code from the address bar', async ({ page }) => {
  const { calls } = await setup(page, { paired: false });
  await page.goto('/kiosk?code=PAIRCODE123');
  await expect(page.getByText('Slide to check in', { exact: true })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  expect(calls[0]).toEqual(['pair', 'PAIRCODE123']);
});

test('a damaged saved check-in list does not crash the boarding tablet', async ({ page }) => {
  const { errors } = await setup(page, { queue: '{not json' });
  await page.goto('/kiosk');
  await expect(page.getByText('Slide to check in', { exact: true })).toBeVisible();
  await unlock(page);
  await expect(page.getByText(/Saved check-ins cannot be read/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit code', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the tablet shows the names on its saved card list', async ({ page }) => {
  const now = Date.now();
  await setup(page, {
    checkIn: (b) => b.action === 'offline_directory' ? {
      json: {
        version: 1, device_id: 'tab-1', company_id: 'a', vehicle_id: 'bus-a', directory_grant: 'd'.repeat(64),
        generated_at: new Date(now).toISOString(), expires_at: new Date(now + 3600_000).toISOString(),
        staff: [{ id: 'p2', full_name: 'Zane Charles', card_fingerprint: 'e'.repeat(64) }, { id: 'p1', full_name: 'Maria Joseph', card_fingerprint: 'f'.repeat(64) }],
      },
    } : null,
  });
  await page.goto('/kiosk');
  await page.getByRole('button', { name: /Passenger list: 2 cards/ }).click();
  const list = page.getByRole('list', { name: 'Passengers with cards' });
  await expect(list.getByRole('listitem')).toHaveText(['Maria Joseph', 'Zane Charles']);
  expect(await page.evaluate(() => localStorage.getItem('tt_boarding_card_index_v1'))).not.toMatch(/04[0-9A-F]{6}/);
});

test('the check-in slider only unlocks on a real slide, not a cancelled one or a tap', async ({ page }) => {
  const { errors } = await setup(page);
  await page.goto('/kiosk');
  const handle = page.getByRole('button', { name: 'Slide to check in' });
  await expect(handle).toBeVisible();
  const b = await handle.boundingBox();
  const track = await page.getByText('Slide to check in', { exact: true }).locator('..').boundingBox();
  // The system takes the gesture over half-way: springs back, stays locked.
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width - 30, b.y + b.height / 2, { steps: 8 });
  await handle.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Submit code', exact: true })).toHaveCount(0);
  // A tap explains what to do.
  await handle.click();
  await expect(page.getByText('Drag the arrow all the way to the right.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit code', exact: true })).toHaveCount(0);
  // Keyboard and screen readers can unlock too.
  await handle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Submit code', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the boarding screen says when the card reader helper stops reaching it', async ({ page }) => {
  await page.clock.install();
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('tt_badge_reader', '1'));
  await page.goto('/kiosk');
  await expect(page.getByText('Slide to check in', { exact: true })).toBeVisible();
  const warning = page.getByText("Card reader isn't connected to this screen.");
  await expect(warning).toHaveCount(0);
  // The helper reports every minute; after 4 silent minutes the screen says so.
  await page.clock.fastForward('04:00');
  await expect(warning).toBeVisible();
  // A report from the helper clears it.
  await page.evaluate(() => { window.__ttHelperHealth = { at: Date.now(), version: '1.7' }; });
  await page.clock.fastForward('00:31');
  await expect(warning).toHaveCount(0);
});
