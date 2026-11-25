// The Workshop's one search box, scanning a part's barcode, and the reorder
// list. The fake camera shows a real Code 39 barcode of the genuine oil
// filter's number (see helpers/workshopScan.js).
import { expect, noSideScroll, open, settle, test } from './helpers/workshopScan.js';

test('one search box finds parts by a replacement number, torque, specs, a diagram part and a manual, and Back returns to the results', async ({ page }) => {
  const { errors } = await open(page, '/workshop');
  await page.getByRole('searchbox', { name: 'Search the Workshop' }).fill('z418');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\/workshop\/search\?q=z418$/);
  const parts = page.getByRole('region', { name: /^Parts/ });
  await expect(parts.getByRole('link')).toHaveText([/Oil filter \(genuine\).*Low: 1 left/, /Ryco oil filter.*Out of stock/]);
  await parts.getByRole('link', { name: /Oil filter \(genuine\)/ }).click();
  await expect(page).toHaveURL(/\/workshop\/parts\/p1$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/workshop\/search\?q=z418$/);
  await expect(page.getByRole('searchbox', { name: 'Search the Workshop' })).toHaveValue('z418');

  const search = async (q) => {
    const box = page.getByRole('searchbox', { name: 'Search the Workshop' });
    await box.fill(q);
    await box.press('Enter');
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(q).replace(/%20/g, '(\\+|%20)')}$`));
  };
  await search('wheel nuts');
  await page.getByRole('region', { name: /^Torque values/ }).getByRole('link', { name: /Wheel nuts/ }).click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/torque$/);
  await page.goBack();
  await search('engine oil');
  await page.getByRole('region', { name: /^Specs & service/ }).getByRole('link', { name: /Engine oil with filter/ }).click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/specs$/);
  await page.goBack();
  await search('element kit');
  await page.getByRole('region', { name: /^Maker's diagrams/ }).getByRole('link', { name: /Element kit, oil filter/ }).click();
  await expect(page).toHaveURL(/\/workshop\/bus\/bus-a\/group\/c1$/);
  await page.goBack();
  await search('fuses');
  await expect(page.getByRole('region', { name: /^Manuals/ }).getByRole('link', { name: /Owner's manual 2017/ })).toHaveAttribute('href', '/workshop/bus/bus-a/manuals');
  // A vehicle by its chassis number, which the results never show.
  await search('0000000001');
  await expect(page.getByRole('region', { name: /^Vehicles/ })).toContainText('St.George');
  await expect(page.getByText('TESTVIN0000000001')).toHaveCount(0);
  await search('nothing like this');
  await expect(page.getByText('Nothing found for “nothing like this”.')).toBeVisible();
  // The header's Search link is on every page.
  await page.goto('/workshop/parts');
  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\/workshop\/search$/);
  expect(errors).toEqual([]);
});

test("scanning a part's barcode opens its page", async ({ page }) => {
  const { errors } = await open(page, '/workshop/parts');
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.getByRole('dialog', { name: 'Scan a part' })).toBeVisible();
  // The fake camera shows the genuine filter's box: its page opens.
  await expect(page).toHaveURL(/\/workshop\/parts\/p1$/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'Oil filter (genuine)' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the quick add form fills the number from a scanned barcode, so a part on the shelf becomes a restock', async ({ page }) => {
  const { errors } = await open(page, '/workshop/parts');
  await page.getByRole('button', { name: 'Add a part' }).click();
  const add = page.getByRole('dialog', { name: 'Add a part' });
  await add.getByRole('button', { name: 'Scan a barcode' }).click();
  await expect(add.getByLabel('Part number')).toHaveValue('90915YZZD2', { timeout: 20000 });
  await expect(add.getByRole('region', { name: 'Already in your parts' })).toContainText('Oil filter (genuine)');
  await expect(add.getByRole('button', { name: 'Add 1 to its stock' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the reorder list: by supplier, with amounts to order, sent on WhatsApp or by email, or copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { errors } = await open(page, '/workshop');
  await page.getByRole('region', { name: 'Stock' }).getByRole('link', { name: /Reorder list/ }).click();
  await expect(page).toHaveURL(/\/workshop\/parts\/reorder$/);
  await expect(page.getByRole('heading', { name: 'Reorder list' })).toBeVisible();
  // Ryco, then Toyota Grenada; the wheel nut (12 on the shelf) isn't low.
  const orders = page.getByRole('region', { name: /^Order from/ });
  await expect(orders).toHaveCount(2);
  const toyota = page.getByRole('region', { name: 'Order from Toyota Grenada' });
  await expect(toyota.getByRole('listitem')).toHaveText([/Air filter.*× 2/, /Oil filter \(genuine\).*× 3/]);
  await expect(page.getByText('Wheel nut', { exact: true })).toHaveCount(0);

  // One more oil filter, and no air filter this time: the message follows.
  await toyota.getByRole('button', { name: 'Order one more Oil filter (genuine)' }).click();
  await toyota.getByRole('checkbox', { name: 'Order Air filter' }).uncheck();
  const message = 'Hello Toyota Grenada,\nMcSween Transport would like to order:\n• 90915-YZZD2 Oil filter (genuine) × 4\n\nThank you.';
  await toyota.getByText('The message').click();
  await expect(toyota.getByLabel('Message to Toyota Grenada')).toHaveText(message);
  await expect(toyota.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', `https://wa.me/?text=${encodeURIComponent(message)}`);
  await expect(toyota.getByRole('link', { name: 'Email' })).toHaveAttribute('href', `mailto:?subject=${encodeURIComponent('Parts order from McSween Transport')}&body=${encodeURIComponent(message)}`);
  await toyota.getByRole('button', { name: 'Copy' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(message);
  await page.screenshot({ path: '/tmp/tt-workshop-reorder.png' });
  expect(errors).toEqual([]);
});

test('on a phone the search, reorder and scan screens fit', async ({ page }) => {
  const { errors } = await open(page, '/workshop', { width: 390, height: 844 });
  for (const path of ['/workshop', '/workshop/search?q=filter', '/workshop/parts/reorder', '/workshop/parts']) {
    await page.goto(path);
    // Measured once the Workshop has loaded, not on the loading screen.
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByRole('main')).not.toBeEmpty();
    await settle(page);
    await noSideScroll(page);
  }
  await page.goto('/workshop/search?q=filter');
  await expect(page.getByRole('region', { name: /^Parts/ })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: '/tmp/tt-workshop-search-phone.png', fullPage: true });
  await page.goto('/workshop/parts');
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.getByRole('dialog', { name: 'Scan a part' })).toBeVisible();
  await expect(page).toHaveURL(/\/workshop\/parts\/p1$/, { timeout: 20000 });
  expect(errors).toEqual([]);
});
