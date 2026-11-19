import { describe, it, expect } from 'vitest';
import { load, mock, request } from '../../../security-tests/helpers.js';

// Parts catalogue through entityAccess: part pictures with pins
// (PartDiagram), replacement numbers (PartInterchange) and the new Part
// fields (models it fits, low-stock level, shelf).
const call = (sdk, body) => load('entityAccess', sdk).default(request(body));
const json = async (res) => ({ status: res.status, body: await res.json() });

function catalogue(role) {
  const sdk = mock(role);
  sdk.tables.VehicleGuide = [{ id: 'g1', make: 'Toyota', model: 'Hiace' }, { id: 'g2', make: 'Nissan', model: 'NV350' }];
  sdk.tables.Part = [
    { id: 'p1', company_id: 'a', part_name: 'Oil filter', oem_number: '90915-YZZD2', quantity_in_stock: 4 },
    { id: 'p2', part_name: 'Brake pads (front)', oem_number: '04465-26420', quantity_in_stock: 0 },
  ];
  sdk.tables.PartDiagram = [{ id: 'd1', guide_id: 'g1', title: 'Front brakes', pins: [{ n: 1, x: 0.5, y: 0.5, part_id: 'p2', label: '' }] }];
  sdk.tables.PartInterchange = [{ id: 'x1', part_number: '90915-YZZD2', alt_number: 'Z418', alt_brand: 'Ryco', kind: 'aftermarket', status: 'unchecked' }];
  return sdk;
}

describe('who reaches the parts catalogue', () => {
  const NEW = {
    PartDiagram: { guide_id: 'g1', title: 'Filters' },
    PartInterchange: { part_number: '90915-YZZD2', alt_number: 'WCO-75' },
  };
  it.each([null, 'staff', 'passenger', 'driver', 'company'])('%s cannot read or write pictures or replacements', async (role) => {
    for (const entity of Object.keys(NEW)) {
      const sdk = catalogue(role);
      const list = await json(await call(sdk, { entity, operation: 'list' }));
      if (role === null) expect(list.status).toBe(401);
      else expect(list.body.result).toEqual([]);
      expect((await call(sdk, { entity, operation: 'create', data: NEW[entity] })).status).toBe(role === null ? 401 : 403);
      expect(sdk.writes).toEqual([]);
    }
  });

  it('a mechanic adds and edits, but only an administrator deletes', async () => {
    const sdk = catalogue('mechanic');
    expect((await call(sdk, { entity: 'PartDiagram', operation: 'create', data: NEW.PartDiagram })).status).toBe(200);
    expect((await call(sdk, { entity: 'PartInterchange', operation: 'create', data: NEW.PartInterchange })).status).toBe(200);
    expect((await call(sdk, { entity: 'PartDiagram', operation: 'delete', id: 'd1' })).status).toBe(403);
    expect((await call(sdk, { entity: 'PartInterchange', operation: 'delete', id: 'x1' })).status).toBe(403);
    const admin = catalogue('admin');
    expect((await call(admin, { entity: 'PartInterchange', operation: 'delete', id: 'x1' })).status).toBe(200);
  });
});

describe('part pictures', () => {
  it('sit on a library page and link to the maker only over https', async () => {
    const sdk = catalogue('mechanic');
    expect((await call(sdk, { entity: 'PartDiagram', operation: 'create', data: { guide_id: 'nope', title: 'x' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'PartDiagram', operation: 'create', data: { guide_id: 'g1', title: '' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'PartDiagram', operation: 'create', data: { guide_id: 'g1', title: 'x', catalogue_link: 'javascript:alert(1)' } })).status).toBe(400);
    // A mechanic's picture is a file uploaded in the app, not a link elsewhere.
    expect((await call(sdk, { entity: 'PartDiagram', operation: 'create', data: { guide_id: 'g1', title: 'x', image_url: 'https://example.com/brakes.jpg' } })).status).toBe(400);
    expect(sdk.writes).toEqual([]);
  });

  it('take a built-in guide drawing, or none', async () => {
    const sdk = catalogue('mechanic');
    const set = (drawing_key) => call(sdk, { entity: 'PartDiagram', operation: 'update', id: 'd1', data: { drawing_key } });
    expect((await json(await set('front-brakes'))).body.result.drawing_key).toBe('front-brakes');
    expect((await json(await set(''))).body.result.drawing_key).toBe(null);
    for (const bad of ['https://example.com/brakes.svg', '../oil-filter', 'gearbox']) expect((await set(bad)).status).toBe(400);
  });

  it('keep tidy pins: a place on the picture, a number, a part that exists', async () => {
    const sdk = catalogue('mechanic');
    for (const pins of [
      [{ n: 1, x: 1.2, y: 0.5 }],
      [{ n: 0, x: 0.5, y: 0.5 }],
      [{ n: 1, x: 0.5, y: 0.5, part_id: { $ne: '' } }],
      'pins',
      Array.from({ length: 81 }, (_, i) => ({ n: i + 1, x: 0.1, y: 0.1 })),
    ]) {
      expect((await call(sdk, { entity: 'PartDiagram', operation: 'update', id: 'd1', data: { pins } })).status).toBe(400);
    }
    const saved = await json(await call(sdk, { entity: 'PartDiagram', operation: 'update', id: 'd1', data: { pins: [
      { n: 1, x: 0.123456, y: 0.5, part_id: 'p2', label: ' Pads ', extra: 'dropped' },
      { n: 2, x: 0.2, y: 0.3, part_id: 'deleted-part' },
    ] } }));
    expect(saved.status).toBe(200);
    expect(saved.body.result.pins).toEqual([
      { n: 1, x: 0.1235, y: 0.5, part_id: 'p2', torque_id: '', ref: '', label: 'Pads' },
      { n: 2, x: 0.2, y: 0.3, part_id: '', torque_id: '', ref: '', label: '' },
    ]);
  });
});

describe('replacement numbers', () => {
  it('need both numbers, a known kind and an https source, and never replace themselves', async () => {
    const sdk = catalogue('mechanic');
    const make = (data) => call(sdk, { entity: 'PartInterchange', operation: 'create', data });
    expect((await make({ part_number: '90915-YZZD2' })).status).toBe(400);
    expect((await make({ part_number: '90915-YZZD2', alt_number: '90915 yzzd2' })).status).toBe(400);
    expect((await make({ part_number: 'A1', alt_number: 'B2', kind: 'cheap' })).status).toBe(400);
    expect((await make({ part_number: 'A1', alt_number: 'B2', source_link: 'http://x.com' })).status).toBe(400);
    expect(sdk.writes).toEqual([]);
  });

  it('record who checked them, and need checking again when changed', async () => {
    const sdk = catalogue('mechanic');
    const marked = await json(await call(sdk, { entity: 'PartInterchange', operation: 'update', id: 'x1', data: { status: 'checked', checked_by: 'Someone else' } }));
    expect(marked.body.result).toMatchObject({ status: 'checked', checked_by: 'Caller' });
    const changed = await json(await call(sdk, { entity: 'PartInterchange', operation: 'update', id: 'x1', data: { alt_number: 'Z419' } }));
    expect(changed.body.result).toMatchObject({ status: 'unchecked', checked_by: '' });
  });
});

describe('new part fields', () => {
  it('administrators and mechanics say which models a part fits; the models must exist', async () => {
    const sdk = catalogue('mechanic');
    const ok = await json(await call(sdk, { entity: 'Part', operation: 'update', id: 'p2', data: { guide_ids: ['g1', 'g1', 'g2'], min_stock: '2', bin_location: 'Shelf B2' } }));
    expect(ok.status).toBe(200);
    expect(ok.body.result).toMatchObject({ guide_ids: ['g1', 'g2'], min_stock: 2, bin_location: 'Shelf B2' });
    expect((await call(sdk, { entity: 'Part', operation: 'update', id: 'p2', data: { guide_ids: ['missing'] } })).status).toBe(400);
    expect((await call(sdk, { entity: 'Part', operation: 'update', id: 'p2', data: { guide_ids: 'g1' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'Part', operation: 'update', id: 'p2', data: { min_stock: -1 } })).status).toBe(400);
  });

  it("a company manager keeps their parts but can't set the models", async () => {
    const sdk = catalogue('company');
    expect((await call(sdk, { entity: 'Part', operation: 'update', id: 'p1', data: { guide_ids: ['g1'] } })).status).toBe(403);
    expect((await call(sdk, { entity: 'Part', operation: 'update', id: 'p1', data: { quantity_in_stock: 5, min_stock: 2 } })).status).toBe(200);
  });
});
