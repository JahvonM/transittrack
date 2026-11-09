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

test('what was typed in a ride request comes back after visiting another page, until it is sent', async ({ page }) => {
  const requests = await site(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/site/book');
  await page.getByRole('radio', { name: /Transfers/ }).check();
  await page.getByLabel('Pick up from').fill('Spice Island Beach Resort');
  await page.getByLabel('Your name').fill('Ana Joseph');
  await page.getByLabel('Email').fill('ana@example.com');
  // Off to the terms and back.
  await page.getByRole('link', { name: 'terms', exact: true }).click();
  await expect(page).toHaveURL(/\/site\/terms/);
  await page.goBack();
  await expect(page.getByLabel('Your name')).toHaveValue('Ana Joseph');
  // Off to the home page, and back with its Request a ride link.
  await page.goto('/site');
  await page.getByRole('link', { name: 'Request a ride' }).first().click();
  await expect(page).toHaveURL(/\/site\/book/);
  await expect(page.getByLabel('Your name')).toHaveValue('Ana Joseph');
  await expect(page.getByLabel('Email')).toHaveValue('ana@example.com');
  await expect(page.getByLabel('Pick up from')).toHaveValue('Spice Island Beach Resort');
  await expect(page.getByRole('radio', { name: /Transfers/ })).toBeChecked();
  // A reload keeps it too.
  await page.reload();
  await expect(page.getByLabel('Your name')).toHaveValue('Ana Joseph');
  // Once sent, it is forgotten.
  const when = await page.evaluate(() => {
    const d = new Date(Date.now() - 4 * 3600_000 + 3 * 86400_000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T10:30`;
  });
  await page.getByLabel('Pickup time').fill(when);
  await page.getByLabel('Going to').fill("St. George's market");
  await page.getByLabel('Phone or WhatsApp').fill('+1 473 555 0101');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Request sent' })).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.goto('/site/book');
  await expect(page.getByLabel('Your name')).toHaveValue('');
});

for (const width of [320, 360, 375, 390]) {
  test(`the website fits a ${width}px phone without sideways scrolling`, async ({ page }) => {
    await site(page);
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/site', '/site/book']) {
      await page.goto(path);
      await expect(page.getByRole('link', { name: 'Request a ride' }).first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      // The whole name shows, and the button doesn't sit on top of it.
      const header = await page.evaluate(() => {
        const name = document.querySelector('.mcs-brand span');
        const button = document.querySelector('.mcs-nav .mcs-btn');
        return { clipped: name.scrollWidth - name.clientWidth, gap: button.getBoundingClientRect().left - (name.getBoundingClientRect().left + name.scrollWidth) };
      });
      expect(header.clipped).toBeLessThanOrEqual(0);
      expect(header.gap).toBeGreaterThanOrEqual(0);
    }
  });
}

// While the web font is still loading the browser draws a stand-in font; the
// header must still fit small phones.
test('the header fits small phones before its fonts arrive', async ({ page }) => {
  await site(page);
  await page.route('**/*.woff2', (r) => r.abort());
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/site', '/site/book']) {
      await page.goto(path);
      await expect(page.getByRole('link', { name: 'Request a ride' }).first()).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    }
  }
});

test('without a WhatsApp number, the contact part offers the form instead', async ({ page }) => {
  await site(page, { whatsapp: '' });
  await page.goto('/site');
  await expect(page.getByText("Send a ride request and we'll reply by email.")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Message us on WhatsApp' })).toHaveCount(0);
});
