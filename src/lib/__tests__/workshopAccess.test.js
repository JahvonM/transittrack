import { describe, it, expect } from 'vitest';
import { load, mock, request } from '../../../security-tests/helpers.js';

// The Workshop app through entityAccess: torque values per model (TorqueSpec),
// the workshop's own cars (WorkshopVehicle), and bolt pins on part pictures.
const call = (sdk, body) => load('entityAccess', sdk).default(request(body));
const json = async (res) => ({ status: res.status, body: await res.json() });

function workshop(role) {
  const sdk = mock(role);
  sdk.tables.VehicleGuide = [{ id: 'g1', make: 'Toyota', model: 'Hiace' }, { id: 'g2', make: 'BMW', model: 'X3' }];
  sdk.tables.TorqueSpec = [
    { id: 't1', guide_id: 'g1', system: 'wheels_brakes', item: 'Wheel nuts', nm: 103, status: 'unchecked' },
    { id: 't2', guide_id: 'g2', system: 'wheels_brakes', item: 'Wheel bolts', nm: 140, status: 'unchecked' },
  ];
  sdk.tables.WorkshopVehicle = [{ id: 'w1', name: 'BMW X3', make: 'BMW', model: 'X3', year: 2013 }];
  sdk.tables.Part = [{ id: 'p1', part_name: 'Brake pads', quantity_in_stock: 2 }];
  sdk.tables.PartDiagram = [{ id: 'd1', guide_id: 'g1', title: 'Front brakes', pins: [] }];
  sdk.tables.CatalogueGroup = [
    { id: 'c1', guide_id: 'g1', code: '4702', title: 'FRONT DISC BRAKE CALIPER', parts: [] },
    { id: 'c2', guide_id: 'g2', code: '34_1', title: 'Front brake', parts: [] },
  ];
  return sdk;
}
const TORQUE = { guide_id: 'g1', system: 'wheels_brakes', item: 'Caliper bracket bolts', size: 'M12', nm: 107, source_link: 'https://example.com/hiace' };
const CAR = { name: 'Serena', make: 'Nissan', model: 'Serena', year: 1998 };

describe('who reaches the Workshop data', () => {
  it.each([null, 'staff', 'passenger', 'driver', 'company'])('%s cannot read or write torque values or workshop cars', async (role) => {
    for (const [entity, data] of [['TorqueSpec', TORQUE], ['WorkshopVehicle', CAR]]) {
      const sdk = workshop(role);
      const list = await json(await call(sdk, { entity, operation: 'list' }));
      if (role === null) expect(list.status).toBe(401);
      else expect(list.body.result).toEqual([]);
      expect((await call(sdk, { entity, operation: 'create', data })).status).toBe(role === null ? 401 : 403);
      expect(sdk.writes).toEqual([]);
    }
  });

  it('a mechanic adds and edits; only an administrator deletes', async () => {
    const sdk = workshop('mechanic');
    expect((await call(sdk, { entity: 'TorqueSpec', operation: 'create', data: TORQUE })).status).toBe(200);
    expect((await call(sdk, { entity: 'WorkshopVehicle', operation: 'create', data: CAR })).status).toBe(200);
    expect((await call(sdk, { entity: 'TorqueSpec', operation: 'delete', id: 't1' })).status).toBe(403);
    expect((await call(sdk, { entity: 'WorkshopVehicle', operation: 'delete', id: 'w1' })).status).toBe(403);
    const admin = workshop('admin');
    expect((await call(admin, { entity: 'TorqueSpec', operation: 'delete', id: 't1' })).status).toBe(200);
    expect((await call(admin, { entity: 'WorkshopVehicle', operation: 'delete', id: 'w1' })).status).toBe(200);
  });
});

describe('torque values', () => {
  it.each([
    ['an unknown model page', { ...TORQUE, guide_id: 'nope' }],
    ['no bolt named', { ...TORQUE, item: '  ' }],
    ['an unknown part of the vehicle', { ...TORQUE, system: 'roof' }],
    ['a torque below zero', { ...TORQUE, nm: -5 }],
    ['a torque over 2000 N·m', { ...TORQUE, nm: 2500 }],
    ['a torque that is not a number', { ...TORQUE, nm: 'tight' }],
    ['a source that is not https', { ...TORQUE, source_link: 'javascript:alert(1)' }],
    ['a "new bolt" that is not yes or no', { ...TORQUE, new_bolt: 'yes' }],
    ['an unknown status', { ...TORQUE, status: 'maybe' }],
  ])('refuse %s', async (_, data) => {
    const sdk = workshop('mechanic');
    expect((await call(sdk, { entity: 'TorqueSpec', operation: 'create', data })).status).toBe(400);
    expect(sdk.writes).toEqual([]);
  });

  it('records who checked a value, and a changed value needs checking again', async () => {
    const sdk = workshop('mechanic');
    expect((await call(sdk, { entity: 'TorqueSpec', operation: 'update', id: 't1', data: { status: 'checked' } })).status).toBe(200);
    let row = sdk.tables.TorqueSpec.find((t) => t.id === 't1');
    expect(row).toMatchObject({ status: 'checked', checked_by: expect.any(String) });
    expect(row.checked_by).not.toBe('');
    expect((await call(sdk, { entity: 'TorqueSpec', operation: 'update', id: 't1', data: { nm: 110 } })).status).toBe(200);
    row = sdk.tables.TorqueSpec.find((t) => t.id === 't1');
    expect(row).toMatchObject({ nm: 110, status: 'unchecked', checked_by: '' });
    // A mechanic can't set who checked it.
    await call(sdk, { entity: 'TorqueSpec', operation: 'update', id: 't1', data: { status: 'wrong', checked_by: 'Someone else' } });
    expect(sdk.tables.TorqueSpec.find((t) => t.id === 't1').checked_by).not.toBe('Someone else');
  });
});

describe('workshop cars', () => {
  it('need a name, make and model, and a sensible year', async () => {
    const sdk = workshop('admin');
    expect((await call(sdk, { entity: 'WorkshopVehicle', operation: 'create', data: { ...CAR, name: '' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'WorkshopVehicle', operation: 'create', data: { ...CAR, make: '' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'WorkshopVehicle', operation: 'create', data: { ...CAR, year: 1800 } })).status).toBe(400);
    expect(sdk.writes).toEqual([]);
  });
});

describe('bolt pins', () => {
  it("keep a torque from the picture's own model page, and drop one from another", async () => {
    const sdk = workshop('mechanic');
    const pins = [
      { n: 1, x: 0.2, y: 0.3, part_id: 'p1', torque_id: 't1', label: '' },
      { n: 2, x: 0.5, y: 0.5, part_id: '', torque_id: 't2', label: 'Not this model' },
      { n: 3, x: 0.6, y: 0.6, torque_id: 'gone', label: '' },
    ];
    expect((await call(sdk, { entity: 'PartDiagram', operation: 'update', id: 'd1', data: { pins } })).status).toBe(200);
    expect(sdk.tables.PartDiagram.find((d) => d.id === 'd1').pins.map((p) => [p.n, p.part_id, p.torque_id])).toEqual([[1, 'p1', 't1'], [2, '', ''], [3, '', '']]);
  });

  it("keep the maker's number for the row they point at", async () => {
    const sdk = workshop('mechanic');
    expect((await call(sdk, { entity: 'PartDiagram', operation: 'update', id: 'd1', data: { pins: [{ n: 1, x: 0.1, y: 0.1, ref: ' 47750 ' }] } })).status).toBe(200);
    expect(sdk.tables.PartDiagram.find((d) => d.id === 'd1').pins[0].ref).toBe('47750');
    expect((await call(sdk, { entity: 'PartDiagram', operation: 'update', id: 'd1', data: { pins: [{ n: 1, x: 0.1, y: 0.1, ref: 'x'.repeat(21) }] } })).status).toBe(400);
    expect((await call(sdk, { entity: 'PartDiagram', operation: 'update', id: 'd1', data: { pins: [{ n: 1, x: 0.1, y: 0.1, ref: 7 }] } })).status).toBe(400);
  });

  it('refuse a torque id that is not text', async () => {
    const sdk = workshop('mechanic');
    expect((await call(sdk, { entity: 'PartDiagram', operation: 'update', id: 'd1', data: { pins: [{ n: 1, x: 0.1, y: 0.1, torque_id: { $ne: '' } }] } })).status).toBe(400);
    expect(sdk.writes).toEqual([]);
  });
});

describe("photos of the maker's diagrams", () => {
  it('link only to a catalogue diagram on the same model page, and can be unlinked', async () => {
    const sdk = workshop('mechanic');
    const link = (catalogue_group_id) => call(sdk, { entity: 'PartDiagram', operation: 'update', id: 'd1', data: { catalogue_group_id } });
    expect((await link('c1')).status).toBe(200);
    expect(sdk.tables.PartDiagram.find((d) => d.id === 'd1').catalogue_group_id).toBe('c1');
    expect((await link('c2')).status).toBe(400);
    expect((await link('missing')).status).toBe(400);
    expect((await link({ $ne: '' })).status).toBe(400);
    expect((await link('')).status).toBe(200);
    expect(sdk.tables.PartDiagram.find((d) => d.id === 'd1').catalogue_group_id).toBe('');
    const made = await call(sdk, { entity: 'PartDiagram', operation: 'create', data: { guide_id: 'g2', title: 'Front brake', catalogue_group_id: 'c1' } });
    expect(made.status).toBe(400);
  });
});
