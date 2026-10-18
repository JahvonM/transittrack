import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { SUPABASE_TABLES } from '../../shared/supabaseTables.ts';

// Step 3 of the move to Supabase (Admin -> Settings -> Copy data to Supabase):
// copies every table from Base44 into the new database a page at a time,
// keeping the same ids. Running it again updates rows already copied.
// Administrators only. The Supabase address and secret key are app secrets the
// owner enters in Base44 (SUPABASE_URL, SUPABASE_SECRET_KEY); they never reach
// the browser, and Supabase stays locked to everyone else. Replies carry only
// counts, the ids of rows that failed with the reason, and field names.

const PAGE = 200;
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }

function supabaseConfig() {
  let url: URL;
  try { url = new URL(String(secrets.get('SUPABASE_URL') || '').trim()); }
  catch { fail(503, 'Supabase is not set up yet: add SUPABASE_URL to the app secrets.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) fail(503, 'SUPABASE_URL should look like https://<project>.supabase.co');
  const key = String(secrets.get('SUPABASE_SECRET_KEY') || '').trim();
  if (!key || /\s/.test(key)) fail(503, 'Supabase is not set up yet: add SUPABASE_SECRET_KEY to the app secrets.');
  if (key.startsWith('sb_publishable_') || jwtRole(key) === 'anon') fail(503, 'SUPABASE_SECRET_KEY is the public key. Use the secret key from Supabase -> Project Settings -> API Keys.');
  // New Supabase secret keys are not JWTs: apikey only.
  const headers: Record<string, string> = { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }) };
  return { origin: url.origin, headers };
}
function jwtRole(key: string) {
  const part = key.split('.')[1];
  if (!part) return null;
  try { return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).role ?? null; } catch { return null; }
}
async function supabaseError(res: Response) {
  const text = await res.text().catch(() => '');
  try { const j = JSON.parse(text); return String(j.message || j.error || text).slice(0, 200); } catch { return text.slice(0, 200) || 'HTTP ' + res.status; }
}

// The columns each table has, from Supabase's own description of its API.
async function tableColumns(sb: ReturnType<typeof supabaseConfig>) {
  const res = await fetch(sb.origin + '/rest/v1/', { headers: { ...sb.headers, Accept: 'application/openapi+json' } });
  if (!res.ok) fail(502, 'Supabase did not answer: ' + await supabaseError(res));
  const spec = await res.json();
  const out: Record<string, Set<string>> = {};
  for (const [name, def] of Object.entries<any>(spec.definitions || {})) out[name] = new Set(Object.keys(def?.properties || {}));
  return out;
}

// Base44 stores its own times without a zone; they are UTC.
const BARE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
function cleanRow(row: Record<string, unknown>, cols: Set<string>, dropped: Record<string, number>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!cols.has(key)) { dropped[key] = (dropped[key] || 0) + 1; continue; }
    out[key] = (key === 'created_date' || key === 'updated_date') && typeof value === 'string' && BARE_TIME.test(value) ? value + 'Z' : value;
  }
  return out;
}

async function upsert(sb: ReturnType<typeof supabaseConfig>, table: string, rows: Record<string, unknown>[]) {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return fetch(`${sb.origin}/rest/v1/${table}?on_conflict=id&columns=${columns.map(encodeURIComponent).join(',')}`, {
    method: 'POST',
    headers: { ...sb.headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal,missing=default' },
    body: JSON.stringify(rows),
  });
}

async function countRows(sb: ReturnType<typeof supabaseConfig>, table: string) {
  const res = await fetch(`${sb.origin}/rest/v1/${table}?select=id&limit=1`, { headers: { ...sb.headers, Prefer: 'count=exact' } });
  if (!res.ok) return null;
  const total = Number((res.headers.get('content-range') || '').split('/')[1]);
  return Number.isFinite(total) ? total : null;
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') fail(403, 'Administrators only');
    const body = await req.json().catch(() => ({}));
    if (body.action === 'tables') return Response.json({ entities: Object.keys(SUPABASE_TABLES) });

    const sb = supabaseConfig();
    if (body.action === 'counts') {
      const counts: Record<string, number | null> = {};
      for (const [entity, table] of Object.entries(SUPABASE_TABLES)) counts[entity] = await countRows(sb, table);
      return Response.json({ counts });
    }
    if (body.action !== 'copy') fail(400, 'Unknown action');
    const entity = body.entity;
    if (typeof entity !== 'string' || !Object.hasOwn(SUPABASE_TABLES, entity)) fail(400, 'Unknown table');
    const table = SUPABASE_TABLES[entity];
    const skip = Number.isInteger(body.skip) && body.skip >= 0 ? body.skip : 0;

    const cols = (await tableColumns(sb))[table];
    if (!cols?.size) fail(502, `Supabase has no ${table} table yet`);
    const rows = await base44.asServiceRole.entities[entity].filter({}, 'created_date', PAGE, skip);
    const dropped: Record<string, number> = {};
    const clean = rows.map((r: Record<string, unknown>) => cleanRow(r, cols, dropped));
    let copied = 0;
    const failed: { id: string; error: string }[] = [];
    if (clean.length) {
      const res = await upsert(sb, table, clean);
      if (res.ok) copied = clean.length;
      else {
        // One bad row fails the whole batch: copy them one by one to find it.
        await res.body?.cancel().catch(() => {});
        for (const row of clean) {
          const one = await upsert(sb, table, [row]);
          if (one.ok) { copied++; await one.body?.cancel().catch(() => {}); }
          else failed.push({ id: String(row.id ?? ''), error: await supabaseError(one) });
        }
      }
    }
    return Response.json({ entity, read: rows.length, copied, failed, dropped_fields: dropped, next_skip: skip + rows.length, done: rows.length < PAGE });
  } catch (error) {
    const status = (error as { status?: number }).status;
    return Response.json({ error: status ? (error as Error).message : 'Copy failed' }, { status: status || 500 });
  }
}
