import { test, expect } from '@playwright/test';

// The public website (mcsweenstransport.com), seen under /site in the app.
// It has no sign-in: only the WhatsApp number and the booking request reach
// the server.

async function site(page, { whatsapp = '14735550100' } = {}) {
  const requests = [];
  await page.route('**/api/**', (r) => {
    const url = r.request().url();
    if (url.includes('/functions/appSupport')) return r.fulfill({ json: { whatsapp_number: whatsapp } });
    if (url.includes('/functions/bookingRequest')) { requests.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true, id: 'req1' } }); }
    return r.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });
  return requests;
}

test('the home page leads to a ride request for the ride chosen', async ({ page }) => {
  await site(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/site');
  await expect(page.getByRole('heading', { level: 1, name: /Airport pickups, transfers and island tours in Grenada/ })).toBeVisible();
  // Five rides on the board, each with its own request link.
  await expect(page.locator('.mcs-board-row')).toHaveCount(5);
  await expect(page.getByRole('link', { name: 'Message us on WhatsApp' })).toHaveAttribute('href', /wa\.me\/14735550100/);
  await page.getByRole('link', { name: 'Request island tours' }).click();
  await expect(page).toHaveURL(/\/site\/book\?service=hotel_tour/);
  await expect(page.getByRole('radio', { name: /Island tours/ })).toBeChecked();
});

test('the moving sign can be stopped', async ({ page }) => {
  await site(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/site');
  await page.getByRole('button', { name: 'Stop the sign' }).click();
  await expect(page.getByRole('button', { name: 'Start the sign' })).toBeVisible();
});

test('a ride request fills in the ticket beside the form and sends what was typed', async ({ page }) => {
  const requests = await site(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/site/book');
  const ticket = page.locator('.mcs-ticket');
  await expect(ticket).toContainText('Airport pickup');
  await page.getByRole('radio', { name: /Transfers/ }).check();
  await expect(ticket).toContainText('Transfers');
  // Nothing missing is sent; the first answer to fix gets the focus.
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText("Some answers need a look. They're marked above.")).toBeVisible();
  expect(requests).toHaveLength(0);

  const when = await page.evaluate(() => {
    const d = new Date(Date.now() - 4 * 3600_000 + 3 * 86400_000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T10:30`;
  });
  await page.getByLabel('Pickup time').fill(when);
  await page.getByLabel('Pick up from').fill('Spice Island Beach Resort');
  await page.getByLabel('Going to').fill("St. George's market");
  await page.getByLabel('Passengers').fill('4');
  await page.getByLabel('Your name').fill('Ana Joseph');
  await page.getByLabel('Phone or WhatsApp').fill('+1 473 555 0101');
  await page.getByLabel('Email').fill('ana@example.com');
  await expect(ticket).toContainText('Spice Island Beach Resort');
  await expect(ticket).toContainText("St. George's market");
  await expect(ticket).toContainText('4 passengers');
  await expect(ticket).toContainText('10:30 am, Grenada time');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Request sent' })).toBeVisible();
  await expect(page.getByText('Thanks, Ana. We have your request.')).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ action: 'request', service: 'transfer', pickup: 'Spice Island Beach Resort', dropoff: "St. George's market", guests: 4, name: 'Ana Joseph', email: 'ana@example.com' });
});

for (const width of [320, 390]) {
  test(`the website fits a ${width}px phone without sideways scrolling`, async ({ page }) => {
    await site(page);
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/site', '/site/book']) {
      await page.goto(path);
      await expect(page.getByRole('link', { name: 'Request a ride' }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    }
  });
}

test('without a WhatsApp number, the contact part offers the form instead', async ({ page }) => {
  await site(page, { whatsapp: '' });
  await page.goto('/site');
  await expect(page.getByText("Send a ride request and we'll reply by email.")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Message us on WhatsApp' })).toHaveCount(0);
});
