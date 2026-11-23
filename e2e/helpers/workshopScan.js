import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as base, expect } from '@playwright/test';
import { fleetData, mockFleet } from './fleetFixture.js';
import { memoryTables } from './memoryTables.js';

// Shared by the Workshop's search, scan and reorder browser tests. The camera
// is a fake video of a real Code 39 barcode, so a scan runs end to end
// through the same scanner library as on a tablet.

// Code 39, as the scanner library reads it: 9 elements per character
// (bars and spaces in turn), 1 = wide (3 units), 0 = narrow (1 unit).
const CODE39_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
const CODE39 = [
  0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064,
  0x109, 0x049, 0x148, 0x019, 0x118, 0x058, 0x00D, 0x10C, 0x04C, 0x01C,
  0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016,
  0x181, 0x0C1, 0x1C0, 0x091, 0x190, 0x0D0, 0x085, 0x184, 0x0C4, 0x0A8,
  0x0A2, 0x08A, 0x02A,
];
const ASTERISK = 0x094;

export function cameraOfCode39(text) {
  const W = 800, H = 480, unit = 3;
  const codes = text ? [ASTERISK, ...[...text].map((c) => CODE39[CODE39_ALPHABET.indexOf(c)]), ASTERISK] : [];
  // Each element as [isBar, width in units]; a narrow space between characters.
  const elements = [];
  codes.forEach((code, i) => {
    for (let b = 8; b >= 0; b--) elements.push([(8 - b) % 2 === 0, (code >> b) & 1 ? 3 : 1]);
    if (i < codes.length - 1) elements.push([false, 1]);
  });
  const width = elements.reduce((n, [, w]) => n + w * unit, 0);
  const y = Buffer.alloc(W * H, 235);
  let x = Math.floor((W - width) / 2);
  for (const [bar, w] of elements) {
    if (bar) for (let row = Math.floor(H * 0.25); row < Math.floor(H * 0.75); row++) y.fill(16, row * W + x, row * W + x + w * unit);
    x += w * unit;
  }
  const uv = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, uv, uv]);
  const file = path.join(os.tmpdir(), `tt-barcode-camera-${process.pid}-${text || 'blank'}.y4m`);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame]));
  return file;
}
// The camera shows the genuine oil filter's box (its number with no dash),
// or nothing (cameraText ''), for the tests that type a number instead.
export const test = base.extend({
  cameraText: ['90915YZZD2', { scope: 'worker', option: true }],
  launchOptions: [async ({ launchOptions, cameraText }, use) => {
    const camera = cameraOfCode39(cameraText);
    await use({ ...launchOptions, args: [...(launchOptions.args || []), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${camera}`] });
  }, { scope: 'worker' }],
});

export function tables() {
  return {
    VehicleGuide: [{ id: 'g1', make: 'Toyota', model: 'Hiace', generation: 'H200', year_from: 2004, year_to: 2019 }],
    WorkshopVehicle: [],
    TorqueSpec: [{ id: 't1', guide_id: 'g1', system: 'wheels_brakes', item: 'Wheel nuts', nm: 100, status: 'unchecked', sort_order: 10 }],
    PartDiagram: [],
    CatalogueGroup: [{
      id: 'c1', guide_id: 'g1', vehicle_id: 'bus-a', model_code: 'KDH212R-JEMDY', category: 'Engine / Fuel / Tool', code: '1502', title: 'OIL FILTER', sort_order: 10,
      parts: [{ ref: '15601', number: '90915-YZZD2', name: 'Element kit, oil filter', qty: '1', info: '2KD-FTV' }],
    }],
    GuideFact: [{ id: 'f1', guide_id: 'g1', section: 'fluids', label: 'Engine oil with filter', value: '7.0 litres', status: 'unchecked', sort_order: 10 }],
    GuideDocument: [{ id: 'doc-1', guide_id: 'g1', title: "Owner's manual 2017", kind: 'owners_manual', notes: 'Fuses, tyre pressures', file_uri: 'storage://private/uploads/2026-11/00000000-0000-4000-8000-000000000001.pdf' }],
    Part: [
      { id: 'p1', part_name: 'Oil filter (genuine)', oem_number: '90915-YZZD2', quantity_in_stock: 1, min_stock: 2, supplier: 'Toyota Grenada', bin_location: 'Shelf A1', guide_ids: ['g1'] },
      { id: 'p2', part_name: 'Ryco oil filter', aftermarket_number: 'Z418', quantity_in_stock: 0, supplier: 'Ryco', bin_location: 'Shelf A2' },
      { id: 'p3', part_name: 'Wheel nut', oem_number: '90942-01058', quantity_in_stock: 12, min_stock: 4, guide_ids: ['g1'] },
      { id: 'p4', part_name: 'Air filter', oem_number: '17801-30040', quantity_in_stock: 0, min_stock: 1, supplier: 'Toyota Grenada' },
    ],
    PartInterchange: [{ id: 'i1', part_number: '90915-YZZD2', alt_number: 'Z418', alt_brand: 'Ryco', kind: 'aftermarket', status: 'unchecked' }],
  };
}

export async function open(page, path, { role = 'mechanic', width = 1024, height = 768 } = {}) {
  const data = fleetData();
  Object.assign(data.tables.Vehicle[0], { name: 'St.George', make: 'Toyota', model: 'Hiace', year: 2017, engine: '2KD-FTV 2.5 diesel turbo', vin: 'TESTVIN0000000001' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t = tables();
  Object.assign(data.tables, t);
  await mockFleet(page, { role, data });
  const server = await memoryTables(page, t, { who: 'Mo Mechanic' });
  await page.setViewportSize({ width, height });
  await page.goto(path);
  return { errors, server };
}

export const noSideScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
export const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));

export { expect };
