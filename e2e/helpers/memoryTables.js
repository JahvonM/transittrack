// A stand-in for entityAccess that keeps some tables in memory the way the
// server keeps them: what is created or changed is what the next list shows,
// and marking a record checked records who did it. Register it after
// mockFleet; every other table falls through to the fleet fixture.
export async function memoryTables(page, tables, { who = 'Admin Person' } = {}) {
  const writes = [];
  let n = 0;
  const stamp = (entity, data, before) => {
    if (!['GuideFact', 'PartInterchange'].includes(entity)) return data;
    if (!before && !Object.hasOwn(data, 'status')) return { ...data, status: 'unchecked', checked_by: '' };
    if (!Object.hasOwn(data, 'status') || data.status === before?.status) return data;
    const off = data.status === 'unchecked';
    return { ...data, checked_by: off ? '' : who, checked_at: off ? null : new Date().toISOString() };
  };
  await page.route('**/api/functions/v1/entityAccess', async (route) => {
    const body = route.request().postDataJSON();
    const entity = body?.entity;
    if (!Object.hasOwn(tables, entity)) return route.fallback();
    const rows = tables[entity];
    const op = body.operation;
    if (op === 'list' || op === 'filter') return route.fulfill({ json: { result: rows } });
    writes.push({ entity, op, data: body.data, id: body.id });
    if (op === 'create') { const row = { id: `${entity}-${++n}`, ...stamp(entity, body.data) }; rows.push(row); return route.fulfill({ json: { result: row } }); }
    if (op === 'bulkCreate') { const made = body.data.map((d) => ({ id: `${entity}-${++n}`, ...stamp(entity, d) })); rows.push(...made); return route.fulfill({ json: { result: made } }); }
    if (op === 'update') { const row = rows.find((r) => r.id === body.id); Object.assign(row, stamp(entity, body.data, row)); return route.fulfill({ json: { result: row } }); }
    if (op === 'delete') { tables[entity] = rows.filter((r) => r.id !== body.id); return route.fulfill({ json: { result: { ok: true } } }); }
    if (op === 'get') { const row = rows.find((r) => r.id === body.id); return row ? route.fulfill({ json: { result: row } }) : route.fulfill({ status: 404, json: { error: 'Record not found' } }); }
    return route.fulfill({ status: 400, json: { error: 'Unsupported operation' } });
  });
  return { tables, writes };
}
