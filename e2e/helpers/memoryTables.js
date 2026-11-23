// A stand-in for entityAccess that keeps some tables in memory the way the
// server keeps them: what is created or changed is what the next list shows,
// and marking a record checked records who did it. Register it after
// mockFleet; every other table falls through to the fleet fixture. `reads`
// counts the lists and single reads, `writes` keeps every change.
//
// Workshop jobs follow the server's rules too: who marked a job done and
// when; a job's vehicle name; a done job's parts staying as they were; and
// the database's stock rule, so a part from the shelf comes off the Part's
// count (refused with the same words when the shelf is short) and goes back
// when removed or its job is deleted. `vehicles` names the vehicles for jobs,
// as { 'bus:bus-a': 'St.George' }.
export async function memoryTables(page, tables, { who = 'Admin Person', vehicles = {} } = {}) {
  const writes = [];
  const reads = [];
  let n = 0;
  const stamp = (entity, data, before) => {
    if (!['GuideFact', 'PartInterchange', 'TorqueSpec'].includes(entity)) return data;
    if (!before && !Object.hasOwn(data, 'status')) return { ...data, status: 'unchecked', checked_by: '' };
    if (!Object.hasOwn(data, 'status') || data.status === before?.status) return data;
    const off = data.status === 'unchecked';
    return { ...data, checked_by: off ? '' : who, checked_at: off ? null : new Date().toISOString() };
  };
  const shelfOf = (id) => (tables.Part || []).find((p) => p.id === id);
  const fromShelf = (line) => !!line?.part_id && line.from_stock !== false;
  const left = (n) => (n <= 0 ? 'None left on the shelf' : `Only ${n} left on the shelf`);
  // What a save takes off the shelf: refused unless the shelf has it.
  const moveStock = (before, after) => {
    const back = fromShelf(before) ? Number(before.qty) : 0;
    const take = fromShelf(after) ? Number(after.qty) : 0;
    if (take) {
      const part = shelfOf(after.part_id);
      if (!part) return 'That part is no longer in your parts list';
      const shelf = Number(part.quantity_in_stock) || 0;
      if (shelf + (before?.part_id === after.part_id ? back : 0) < take) return left(shelf);
    }
    if (back && shelfOf(before.part_id)) shelfOf(before.part_id).quantity_in_stock = (Number(shelfOf(before.part_id).quantity_in_stock) || 0) + back;
    if (take) shelfOf(after.part_id).quantity_in_stock = (Number(shelfOf(after.part_id).quantity_in_stock) || 0) - take;
    return '';
  };
  const jobRules = (entity, op, data = {}, before = null) => {
    if (entity === 'WorkshopJob') {
      const out = { ...data };
      delete out.done_at; delete out.done_by;
      if (!before) out.vehicle_name = vehicles[`${data.vehicle_kind}:${data.vehicle_id}`] || '';
      const was = before?.status || 'open', now = Object.hasOwn(data, 'status') ? data.status : was;
      if (!before || now !== was) {
        out.status = now;
        if (now === 'done') { out.done_at = new Date().toISOString(); out.done_by = who; } else if (before) { out.done_at = null; out.done_by = ''; }
      }
      return { data: out };
    }
    if (entity !== 'WorkshopJobPart') return { data };
    const job = (tables.WorkshopJob || []).find((j) => j.id === (before?.job_id || data.job_id));
    if (job?.status === 'done') return { error: 'This job is done. Reopen it to change its parts', status: 409 };
    const out = { ...data };
    if (!before && out.part_id) { const part = shelfOf(out.part_id); out.part_name = part?.part_name || ''; out.part_number = part?.oem_number || part?.aftermarket_number || ''; }
    if (!before && out.from_stock === undefined) out.from_stock = true;
    const problem = op === 'delete' ? moveStock(before, null) : moveStock(before, { ...before, ...out });
    return problem ? { error: problem, status: 409 } : { data: out };
  };

  await page.route('**/api/functions/v1/entityAccess', async (route) => {
    const body = route.request().postDataJSON();
    const entity = body?.entity;
    if (!Object.hasOwn(tables, entity)) return route.fallback();
    const rows = tables[entity];
    const op = body.operation;
    if (op === 'list' || op === 'filter') { reads.push({ entity, op }); return route.fulfill({ json: { result: rows } }); }
    if (op === 'get') {
      reads.push({ entity, op, id: body.id });
      const row = rows.find((r) => r.id === body.id);
      return row ? route.fulfill({ json: { result: row } }) : route.fulfill({ status: 404, json: { error: 'Record not found' } });
    }
    const before = body.id ? rows.find((r) => r.id === body.id) || null : null;
    const ruled = jobRules(entity, op, body.data, before);
    if (ruled.error) return route.fulfill({ status: ruled.status, json: { error: ruled.error } });
    body.data = ruled.data;
    writes.push({ entity, op, data: body.data, id: body.id });
    if (op === 'delete' && entity === 'WorkshopJob') {
      // The database removes the job's parts first, so their stock goes back.
      for (const line of (tables.WorkshopJobPart || []).filter((l) => l.job_id === body.id)) moveStock(line, null);
      if (tables.WorkshopJobPart) tables.WorkshopJobPart = tables.WorkshopJobPart.filter((l) => l.job_id !== body.id);
    }
    if (op === 'create') { const row = { id: `${entity}-${++n}`, ...(entity.startsWith('WorkshopJob') ? { created_date: new Date().toISOString() } : {}), ...stamp(entity, body.data) }; rows.push(row); return route.fulfill({ json: { result: row } }); }
    if (op === 'bulkCreate') { const made = body.data.map((d) => ({ id: `${entity}-${++n}`, ...stamp(entity, d) })); rows.push(...made); return route.fulfill({ json: { result: made } }); }
    if (op === 'update') { const row = rows.find((r) => r.id === body.id); Object.assign(row, stamp(entity, body.data, row)); return route.fulfill({ json: { result: row } }); }
    if (op === 'delete') { tables[entity] = rows.filter((r) => r.id !== body.id); return route.fulfill({ json: { result: { ok: true } } }); }
    return route.fulfill({ status: 400, json: { error: 'Unsupported operation' } });
  });
  return { tables, writes, reads };
}
