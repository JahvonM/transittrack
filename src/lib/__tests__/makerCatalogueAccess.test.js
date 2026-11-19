import { describe, it, expect } from 'vitest';
import { load, mock, request } from '../../../security-tests/helpers.js';

// The maker's catalogue through entityAccess: a diagram's parts as Toyota or
// Nissan list them, pasted in from Partsouq. Administrators and mechanics only.
const call = (sdk, body) => load('entityAccess', sdk).default(request(body));
const json = async (res) => ({ status: res.status, body: await res.json() });

function catalogue(role) {
  const sdk = mock(role);
  sdk.tables.VehicleGuide = [{ id: 'g1', make: 'Toyota', model: 'Hiace' }];
  sdk.tables.CatalogueGroup = [{ id: 'c1', guide_id: 'g1', code: '1502', title: 'OIL FILTER', parts: [] }];
  return sdk;
}
const NEW = { guide_id: 'g1', category: 'Engine / Fuel / Tool', code: '2302', title: 'FUEL FILTER', link: 'https://partsouq.com/en/catalog/genuine/x' };

describe("who reaches the maker's catalogue", () => {
  it.each([null, 'staff', 'passenger', 'driver', 'company'])('%s cannot read or write it', async (role) => {
    const sdk = catalogue(role);
    const list = await json(await call(sdk, { entity: 'CatalogueGroup', operation: 'list' }));
    if (role === null) expect(list.status).toBe(401);
    else expect(list.body.result).toEqual([]);
    expect((await call(sdk, { entity: 'CatalogueGroup', operation: 'create', data: NEW })).status).toBe(role === null ? 401 : 403);
    expect(sdk.writes).toEqual([]);
  });

  it('a mechanic pastes diagrams and parts, but only an administrator deletes', async () => {
    const sdk = catalogue('mechanic');
    expect((await call(sdk, { entity: 'CatalogueGroup', operation: 'create', data: NEW })).status).toBe(200);
    expect((await call(sdk, { entity: 'CatalogueGroup', operation: 'update', id: 'c1', data: { parts: [{ ref: '1', number: '90915-YZZD2', name: 'ELEMENT KIT, OIL FILTER', qty: '1' }] } })).status).toBe(200);
    expect((await call(sdk, { entity: 'CatalogueGroup', operation: 'delete', id: 'c1' })).status).toBe(403);
    expect((await call(catalogue('admin'), { entity: 'CatalogueGroup', operation: 'delete', id: 'c1' })).status).toBe(200);
  });
});

describe('catalogue diagrams', () => {
  it('sit on a library page, need a number and title, and link only over https', async () => {
    const sdk = catalogue('mechanic');
    expect((await call(sdk, { entity: 'CatalogueGroup', operation: 'create', data: { ...NEW, guide_id: 'nope' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'CatalogueGroup', operation: 'create', data: { ...NEW, code: ' ' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'CatalogueGroup', operation: 'create', data: { ...NEW, title: '' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'CatalogueGroup', operation: 'create', data: { ...NEW, link: 'javascript:alert(1)' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'CatalogueGroup', operation: 'create', data: { ...NEW, link: 'http://partsouq.com/' } })).status).toBe(400);
    expect(sdk.writes).toEqual([]);
  });

  it('keep only the text of each part, trimmed and capped', async () => {
    const sdk = catalogue('mechanic');
    const res = await call(sdk, { entity: 'CatalogueGroup', operation: 'update', id: 'c1', data: { parts: [
      { ref: ' 1 ', number: ' 90915-YZZD2 ', name: 'ELEMENT KIT, OIL FILTER', qty: 1, info: 'x'.repeat(500), extra: '<script>' },
    ] } });
    expect(res.status).toBe(200);
    const saved = sdk.tables.CatalogueGroup.find((g) => g.id === 'c1').parts;
    expect(saved).toEqual([{ ref: '1', number: '90915-YZZD2', name: 'ELEMENT KIT, OIL FILTER', qty: '1', info: 'x'.repeat(300) }]);
  });

  it.each([
    ['not a list', { parts: 'oil filter' }],
    ['a row that is not a part', { parts: ['90915-YZZD2'] }],
    ['a part with neither number nor name', { parts: [{ ref: '1', qty: '2' }] }],
    ['a field that is not text', { parts: [{ number: { $gt: '' } }] }],
    ['more than 400 parts', { parts: Array.from({ length: 401 }, (_, i) => ({ number: `P-${i}` })) }],
  ])('refuse %s', async (_, data) => {
    const sdk = catalogue('mechanic');
    expect((await call(sdk, { entity: 'CatalogueGroup', operation: 'update', id: 'c1', data })).status).toBe(400);
    expect(sdk.writes).toEqual([]);
  });
});
