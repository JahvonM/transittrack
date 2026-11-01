import { test, expect } from '@playwright/test';
import { fleetData, mockFleet } from './helpers/fleetFixture.js';

// Admin → Card issuing → Issued cards: each card's state in words, stopping a
// card three ways, switching a suspended one back on, and honest wording about
// boarding tablets that are offline.

const card = (id, extra) => ({ id, card_uid: '04A1B2C3', holder_name: 'Rita Rider', holder_source: 'user', holder_id: 'u-pass', company_id: 'a', company_name: 'Six Senses', access_level: 'STAFF_BUS_BOARDING', issue_date: '2026-10-28T12:00:00Z', ...extra });

async function open(page, cards) {
  const data = fleetData();
  data.cards = cards;
  const fleet = await mockFleet(page, { role: 'admin', data });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/admin/cards');
  await page.getByRole('tab', { name: /Issued cards/ }).click();
  return { ...fleet, errors };
}
const cardCalls = (calls) => calls.filter((c) => c.fn === 'nfcCards' && ['revoke', 'reactivate'].includes(c.body?.action)).map((c) => c.body);

test('an active card can be suspended, with the offline limit said plainly', async ({ page }) => {
  const { calls, errors } = await open(page, [card('c1', { is_active: true, status: 'active' })]);
  const row = page.getByRole('row', { name: /Rita Rider/ });
  await expect(row.getByText('Active', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: "Stop Rita Rider's card" }).click();
  await page.getByRole('menuitem', { name: /Suspend/ }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await expect(dialog.getByText(/A tablet with no connection can still accept it until it reconnects/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByText('Card suspended').first()).toBeVisible();
  expect(cardCalls(calls)).toEqual([{ action: 'revoke', card_id: 'c1', status: 'suspended' }]);
  expect(errors).toEqual([]);
});

test('each stopped state is shown in words, and only a suspended card can be switched back on', async ({ page }) => {
  const { calls } = await open(page, [
    card('s', { is_active: false, status: 'suspended', revoke_reason: 'Suspended', revoked_at: '2026-10-30T10:00:00Z' }),
    card('l', { holder_name: 'Lou Lost', holder_id: 'u-l', card_uid: '04A1B2C4', is_active: false, status: 'lost', revoke_reason: 'Reported lost', revoked_at: '2026-10-30T10:00:00Z' }),
    card('r', { holder_name: 'Rex Replaced', holder_id: 'u-r', card_uid: '04A1B2C5', is_active: false, status: 'replaced', revoke_reason: 'Replaced by a new card', revoked_at: '2026-10-29T10:00:00Z' }),
  ]);
  await page.getByRole('combobox', { name: 'Show' }).click();
  await page.getByRole('option', { name: /Suspended, lost, revoked or replaced/ }).click();
  for (const [name, state] of [['Rita Rider', 'Suspended'], ['Lou Lost', 'Lost'], ['Rex Replaced', 'Replaced']])
    await expect(page.getByRole('row', { name: new RegExp(name) }).getByText(state, { exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: /Lou Lost/ }).getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Rex Replaced/ }).getByRole('button')).toHaveCount(0);
  await page.getByRole('row', { name: /Rita Rider/ }).getByRole('button', { name: /Switch back on/ }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Switch back on' }).click();
  await expect(page.getByText('Card switched back on').first()).toBeVisible();
  expect(cardCalls(calls)).toEqual([{ action: 'reactivate', card_id: 's' }]);
});
