import { describe, it, expect } from 'vitest';
import { load, mock, request } from '../../../security-tests/helpers.js';

// Bus library (VehicleGuide, GuideFact, GuideDocument) through entityAccess:
// fleet-wide pages that only administrators and mechanics reach.
const call = (sdk, body) => load('entityAccess', sdk).default(request(body));
const json = async (res) => ({ status: res.status, body: await res.json() });
const UPLOADED = 'storage://private/uploads/2026-11/0f8fad5b-d9cb-469f-a165-70867728950e.pdf';

function withGuide(role) {
  const sdk = mock(role);
  sdk.tables.VehicleGuide = [{ id: 'g1', make: 'Toyota', model: 'Hiace', year_from: 2014, year_to: 2018 }];
  sdk.tables.GuideFact = [{ id: 'f1', guide_id: 'g1', section: 'fluids', label: 'Engine oil', value: '7.0 L', status: 'checked', checked_by: 'Someone', checked_at: '2026-11-01T00:00:00.000Z' }];
  sdk.tables.GuideDocument = [{ id: 'd1', guide_id: 'g1', title: "Owner's manual", kind: 'owners_manual', file_uri: UPLOADED }];
  return sdk;
}

describe('who reaches the bus library', () => {
  const NEW = {
    VehicleGuide: { make: 'Nissan', model: 'NV350' },
    GuideFact: { guide_id: 'g1', section: 'notes', label: 'x' },
    GuideDocument: { guide_id: 'g1', title: 'x', file_uri: UPLOADED },
  };
  it.each([null, 'staff', 'passenger', 'driver', 'company'])('%s cannot read or write it', async (role) => {
    for (const entity of Object.keys(NEW)) {
      const sdk = withGuide(role);
      const list = await json(await call(sdk, { entity, operation: 'list' }));
      if (role === null) expect(list.status).toBe(401);
      else expect(list.body.result).toEqual([]);
      expect((await call(sdk, { entity, operation: 'get', id: entity === 'VehicleGuide' ? 'g1' : entity === 'GuideFact' ? 'f1' : 'd1' })).status).toBe(role === null ? 401 : 404);
      const made = await call(sdk, { entity, operation: 'create', data: NEW[entity] });
      expect(made.status).toBe(role === null ? 401 : 403);
      const changed = await call(sdk, { entity, operation: 'update', id: 'g1', data: {} });
      expect([401, 404]).toContain(changed.status);
      expect(sdk.writes).toEqual([]);
    }
  });

  it('a mechanic reads, adds and edits, but does not delete', async () => {
    const sdk = withGuide('mechanic');
    expect((await json(await call(sdk, { entity: 'GuideFact', operation: 'filter', query: { guide_id: 'g1' } }))).body.result).toHaveLength(1);
    expect((await call(sdk, { entity: 'VehicleGuide', operation: 'create', data: { make: 'Nissan', model: 'NV350', year_from: 2012, year_to: 2021 } })).status).toBe(200);
    expect((await call(sdk, { entity: 'GuideFact', operation: 'create', data: { guide_id: 'g1', section: 'tyres', label: 'Tyre size', value: '195R15C' } })).status).toBe(200);
    for (const [entity, id] of [['VehicleGuide', 'g1'], ['GuideFact', 'f1'], ['GuideDocument', 'd1']]) {
      expect((await call(sdk, { entity, operation: 'delete', id })).status).toBe(403);
    }
    expect(sdk.tables.GuideFact.map((f) => f.id)).toContain('f1');
  });

  it('an administrator deletes', async () => {
    const sdk = withGuide('admin');
    expect((await call(sdk, { entity: 'GuideFact', operation: 'delete', id: 'f1' })).status).toBe(200);
    expect(sdk.tables.GuideFact).toEqual([]);
  });
});

describe('library pages', () => {
  it('need a make and model, and years in order', async () => {
    const sdk = withGuide('admin');
    expect((await call(sdk, { entity: 'VehicleGuide', operation: 'create', data: { make: 'Toyota' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'VehicleGuide', operation: 'create', data: { make: 'Toyota', model: 'Hiace', year_from: 2019, year_to: 2014 } })).status).toBe(400);
    expect((await call(sdk, { entity: 'VehicleGuide', operation: 'update', id: 'g1', data: { model: '' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'VehicleGuide', operation: 'create', data: { make: 'Toyota', model: 'Hiace', starter_key: 'Not A Key' } })).status).toBe(400);
  });
});

describe('library facts', () => {
  it('sit on a page that exists, in a known section, with an https source', async () => {
    const sdk = withGuide('mechanic');
    expect((await call(sdk, { entity: 'GuideFact', operation: 'create', data: { guide_id: 'missing', section: 'notes', label: 'x' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'GuideFact', operation: 'create', data: { guide_id: 'g1', section: 'gossip', label: 'x' } })).status).toBe(400);
    expect((await call(sdk, { entity: 'GuideFact', operation: 'create', data: { guide_id: 'g1', section: 'notes', label: '' } })).status).toBe(400);
    for (const source_link of ['http://example.com/manual', 'javascript:alert(1)', 'ftp://x']) {
      expect((await call(sdk, { entity: 'GuideFact', operation: 'create', data: { guide_id: 'g1', section: 'notes', label: 'x', source_link } })).status).toBe(400);
    }
    expect((await call(sdk, { entity: 'GuideFact', operation: 'create', data: { guide_id: 'g1', section: 'service', label: 'Oil change', interval_km: -5 } })).status).toBe(400);
    expect(sdk.writes).toEqual([]);
  });

  it('record who checked them; the caller cannot say who', async () => {
    const sdk = withGuide('mechanic');
    const made = await json(await call(sdk, { entity: 'GuideFact', operation: 'create', data: { guide_id: 'g1', section: 'tyres', label: 'Tyre size', value: '195R15C', status: 'checked', checked_by: 'The owner', checked_at: '2020-01-01T00:00:00Z' } }));
    expect(made.status).toBe(200);
    expect(made.body.result.checked_by).toBe('Caller');
    expect(Date.parse(made.body.result.checked_at)).toBeGreaterThan(Date.parse('2026-01-01'));
    const fresh = await json(await call(sdk, { entity: 'GuideFact', operation: 'create', data: { guide_id: 'g1', section: 'tyres', label: 'Spare' } }));
    expect(fresh.body.result.status).toBe('unchecked');
    expect(fresh.body.result.checked_by).toBe('');
  });

  it('go back to unchecked when their answer changes', async () => {
    const sdk = withGuide('mechanic');
    const edited = await json(await call(sdk, { entity: 'GuideFact', operation: 'update', id: 'f1', data: { value: '6.5 L' } }));
    expect(edited.body.result).toMatchObject({ value: '6.5 L', status: 'unchecked', checked_by: '' });
    const marked = await json(await call(sdk, { entity: 'GuideFact', operation: 'update', id: 'f1', data: { status: 'wrong' } }));
    expect(marked.body.result).toMatchObject({ status: 'wrong', checked_by: 'Caller' });
    // Saving the same answer again keeps the mark.
    const same = await json(await call(sdk, { entity: 'GuideFact', operation: 'update', id: 'f1', data: { value: '6.5 L' } }));
    expect(same.body.result).toMatchObject({ status: 'wrong', checked_by: 'Caller' });
  });

  it('import as a batch with one look-up of their page', async () => {
    const sdk = withGuide('admin');
    const data = Array.from({ length: 30 }, (_, i) => ({ guide_id: 'g1', section: 'specs', label: 'Fact ' + i, value: String(i) }));
    const res = await json(await call(sdk, { entity: 'GuideFact', operation: 'bulkCreate', data }));
    expect(res.status).toBe(200);
    expect(res.body.result).toHaveLength(30);
    expect(sdk.reads.filter((r) => r.name === 'VehicleGuide' && r.method === 'get')).toHaveLength(1);
  });
});

describe('library manuals', () => {
  it('must be a file uploaded in the app', async () => {
    const sdk = withGuide('mechanic');
    for (const file_uri of [
      '', 'https://example.com/manual.pdf',
      'storage://private/driver_document/abc/file_uri-123.pdf',
      'storage://private/uploads/2026-11/../secret.pdf',
      'https://evil.example/storage/v1/object/sign/private/uploads/2026-11/0f8fad5b-d9cb-469f-a165-70867728950e.pdf?token=x',
    ]) {
      expect((await call(sdk, { entity: 'GuideDocument', operation: 'create', data: { guide_id: 'g1', title: 'Manual', file_uri } })).status).toBe(400);
    }
    expect(sdk.writes).toEqual([]);
    expect((await call(sdk, { entity: 'GuideDocument', operation: 'create', data: { guide_id: 'g1', title: 'Manual', kind: 'workshop_manual', file_uri: UPLOADED } })).status).toBe(200);
    const signed = 'https://abcdefgh.supabase.co/storage/v1/object/sign/private/uploads/2026-11/0f8fad5b-d9cb-469f-a165-70867728950e.pdf?token=eyJ';
    expect((await call(sdk, { entity: 'GuideDocument', operation: 'create', data: { guide_id: 'g1', title: 'Manual', file_uri: signed } })).status).toBe(200);
  });

  it('keep their file: a new file is a new document', async () => {
    const sdk = withGuide('admin');
    expect((await call(sdk, { entity: 'GuideDocument', operation: 'update', id: 'd1', data: { file_uri: UPLOADED } })).status).toBe(400);
    expect((await call(sdk, { entity: 'GuideDocument', operation: 'update', id: 'd1', data: { notes: 'Chapter 3: brakes' } })).status).toBe(200);
    expect((await call(sdk, { entity: 'GuideDocument', operation: 'create', data: { guide_id: 'g1', title: 'x', kind: 'novel', file_uri: UPLOADED } })).status).toBe(400);
  });
});
