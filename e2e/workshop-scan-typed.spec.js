// Typing a part's number in the Scan sheet, with nothing in front of the
// camera (so no barcode is found while typing).
import { expect, open, test } from './helpers/workshopScan.js';

test.use({ cameraText: '' });

test('a typed number not on the shelves can be added; a replacement number finds its part; typing pauses the camera', async ({ page }) => {
  const { errors } = await open(page, '/workshop/parts');
  await page.getByRole('button', { name: 'Scan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Scan a part' });
  await expect(sheet.getByText('Hold the barcode inside the box. It scans by itself.')).toBeVisible();
  await sheet.getByLabel('Or type the number instead').fill('04465-26420');
  await expect(sheet.getByText('Camera paused while you type. Clear the box to scan again.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Find' }).click();
  await expect(sheet.getByRole('region', { name: 'Scan result' })).toContainText('Not in your parts');
  await sheet.getByRole('button', { name: 'Add it' }).click();
  const add = page.getByRole('dialog', { name: 'Add a part' });
  await expect(add.getByLabel('Part number')).toHaveValue('04465-26420');
  await page.keyboard.press('Escape');

  // A replacement number typed in finds the part it replaces.
  await page.getByRole('button', { name: 'Scan' }).click();
  await sheet.getByLabel('Or type the number instead').fill('z418');
  await sheet.getByRole('button', { name: 'Find' }).click();
  await expect(page).toHaveURL(/\/workshop\/parts\/p2$/);
  expect(errors).toEqual([]);
});
