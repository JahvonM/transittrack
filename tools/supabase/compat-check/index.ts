// One-off check that base44-compat.ts filters mean the same on the real
// database as Base44's Mongo-style filters: each query's result is compared
// with the same filter applied in code to the whole table. Takes no input and
// answers only pass/fail and counts, never records. Deploy by hand, run once,
// then replace with a stub.
import { createClientFromRequest, serve } from '../_shared/base44-compat.ts';

type Row = Record<string, unknown>;
const has = (r: Row, k: string) => r[k] !== undefined && r[k] !== null;

function match(r: Row, q: Row): boolean {
  return Object.entries(q).every(([k, v]) => {
    if (k === '$or') return (v as Row[]).some((x) => match(r, x));
    if (k === '$and') return (v as Row[]).every((x) => match(r, x));
    const val = r[k];
    const eq = (a: unknown, b: unknown) => Array.isArray(a) ? a.some((x) => x === b) || JSON.stringify(a) === JSON.stringify(b) : (a ?? null) === (b ?? null);
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).some((x) => x.startsWith('$'))) {
      return Object.entries(v as Row).every(([op, x]) => {
        if (op === '$in') return (x as unknown[]).some((y) => eq(val, y));
        if (op === '$nin') return !(x as unknown[]).some((y) => eq(val, y));
        if (op === '$ne') return !eq(val, x);
        if (op === '$exists') return has(r, k) === !!x;
        if (op === '$gt') return has(r, k) && String(val) > String(x);
        if (op === '$gte') return has(r, k) && String(val) >= String(x);
        if (op === '$lt') return has(r, k) && String(val) < String(x);
        if (op === '$lte') return has(r, k) && String(val) <= String(x);
        if (op === '$regex') return has(r, k) && new RegExp(String(x), String((v as Row).$options || '')).test(String(val));
        return op === '$options';
      });
    }
    return eq(val, v);
  });
}

serve(async (req) => {
  const db = createClientFromRequest(req).asServiceRole.entities;
  const results: Row[] = [];
  const check = async (entity: string, query: Row, sort?: string, limit?: number) => {
    try {
      const all = await db[entity].list('-created_date', 20000);
      const got = await db[entity].filter(query, sort, limit ?? 20000);
      const want = all.filter((r) => match(r, query));
      const gotIds = got.map((r) => r.id).sort().join();
      const wantIds = want.slice(0, limit ?? 20000).map((r) => r.id).sort().join();
      results.push({ entity, ok: limit ? got.length === Math.min(limit, want.length) && got.every((r) => match(r, query)) : gotIds === wantIds, got: got.length, want: want.length, of: all.length });
    } catch (e) {
      results.push({ entity, ok: false, error: String((e as Error).message).slice(0, 120) });
    }
  };
  const pings = await db.LocationPing.list('-created_date', 1);
  const day = String(pings[0]?.created_date || '2026-10-01').slice(0, 10);
  const incidents = await db.Incident.list('-created_date', 50);
  const photo = incidents.flatMap((i) => (Array.isArray(i.photo_uris) ? i.photo_uris : []))[0];
  const users = await db.User.list('-created_date', 1);
  const email = String(users[0]?.email || 'x@y.z');

  await check('Fault', { status: { $ne: 'resolved' } });
  await check('Trip', { status: { $nin: ['completed', 'cancelled'] } });
  await check('StaffCheckIn', { staff_picture_url: { $exists: true } });
  await check('StaffCheckIn', { staff_picture_url: { $exists: false } });
  await check('Incident', { photo_uris: photo ?? 'none' });
  await check('PassengerOneTimeCredential', { $or: [{ consumed_at: { $exists: false } }, { consumed_at: '' }, { consumed_at: null }] });
  await check('LocationPing', { created_date: { $gte: day + 'T00:00:00Z', $lt: day + 'T23:59:59Z' } });
  await check('LocationPing', {}, '-created_date', 1500);
  await check('User', { email: { $regex: '^' + email.toUpperCase().replace(/[.+]/g, '\\$&') + '$', $options: 'i' } });
  await check('User', { role: { $in: ['admin', 'staff'] }, no_such_field: { $ne: 'x' } });
  await check('User', { disabled: true });
  await check('VerificationGrant', { $and: [{ created_date: { $gt: '2026-01-01' } }, { $or: [{ revoked: true }, { revoked: { $exists: false } }] }] });
  return Response.json({ ok: results.every((r) => r.ok), results });
});
