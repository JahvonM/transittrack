// Runs the app's Base44 functions on Supabase Edge Functions unchanged.
//
// The functions in base44/functions use a small part of the Base44 SDK:
// auth.me(), asServiceRole.entities.<Entity>.filter/list/get/create/update/
// delete/bulkCreate, a few Core integrations, and secrets from base44:runtime.
// This file gives them the same calls backed by Supabase: Supabase Auth for
// the signed-in person (linked to app_user), PostgREST with the secret key for
// the tables, Storage for files. tools/supabase/build-functions.mjs copies each
// function here and points its imports at this file.
//
// Behaviour kept from Base44 where the code depends on it:
// - errors carry .status and .response.status (404 for a missing record, 401
//   when nobody is signed in);
// - Mongo-style filters ($in, $nin, $ne, $gt/$gte/$lt/$lte, $exists, $regex,
//   $or, $and), where $ne/$nin also match empty fields, and a single value
//   matches inside a list field;
// - filter(query, sort, limit, skip, fields) returns an array;
//   filter(query, { limit, sort, fields }) returns one page { items, next_cursor };
// - empty fields are left out of records, like Base44 does.
//
// Files: private files are stored as storage://private/<path>. Every JSON reply
// a function sends has those turned into signed links the app can show (cached
// a day), and a signed link sent back in a save turns into the stored reference
// again, so a temporary link is never saved. Uploads go to the private area; a
// file saved into a public field (logos, ads, bus and part photos, profile
// photos: FILE_COLUMNS in supabaseFiles.ts) is copied to the public area then.

import { SUPABASE_TABLES } from './supabaseTables.ts';
import { FILE_COLUMNS } from './supabaseFiles.ts';

type Env = { get(name: string): string | undefined };
// Records are loosely typed, as they are in the Base44 functions that use them.
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
type HttpError = Error & { status: number; response: { status: number; data: unknown } };

const runtime: { fetch: typeof fetch; env: Env } = {
  fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
  env: { get: (name: string) => (globalThis as { Deno?: { env: Env } }).Deno?.env.get(name) },
};

// Tests swap in a fake network and settings.
export function __setRuntimeForTests(next: Partial<typeof runtime>) {
  Object.assign(runtime, next);
  columnCache = null;
  signedLinks.clear();
}

export function httpError(status: number, message: string, data?: unknown): HttpError {
  return Object.assign(new Error(message), { status, response: { status, data: data ?? { message } } });
}

// ---------- settings ----------

function supabaseUrl() {
  const raw = runtime.env.get('SUPABASE_URL')?.trim();
  if (!raw) throw httpError(500, 'Server not configured');
  return raw.replace(/\/+$/, '');
}

function secretKey(): string | undefined {
  try {
    const keys = JSON.parse(runtime.env.get('SUPABASE_SECRET_KEYS') || '{}');
    if (typeof keys?.default === 'string' && keys.default) return keys.default;
  } catch { /* fall back to the older key */ }
  return runtime.env.get('SUPABASE_SERVICE_ROLE_KEY') || undefined;
}

function serverHeaders(extra: Record<string, string> = {}) {
  const key = secretKey();
  if (!key) throw httpError(500, 'Server not configured');
  // New secret keys go only in apikey; the older service-role key is a JWT.
  return { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), ...extra };
}

// Secrets the functions read (import { secrets } from 'base44:runtime').
// The rate-limit and saved-work store lives in this same project on Supabase.
export const secrets = {
  get(name: string): string | undefined {
    const value = runtime.env.get(name);
    if (value !== undefined && value !== '') return value;
    if (name === 'TT_ATOMIC_STORE_URL') return runtime.env.get('SUPABASE_URL');
    if (name === 'TT_ATOMIC_SERVICE_ROLE_KEY') return secretKey();
    return value;
  },
};

// ---------- table columns (types decide how filters and writes work) ----------

type Columns = Record<string, Record<string, string>>;
let columnCache: Promise<Columns> | null = null;

function columns(): Promise<Columns> {
  columnCache ||= (async () => {
    const res = await runtime.fetch(`${supabaseUrl()}/rest/v1/`, { headers: serverHeaders({ Accept: 'application/openapi+json' }) });
    if (!res.ok) { columnCache = null; throw httpError(503, 'Database unavailable'); }
    const spec = await res.json();
    const out: Columns = {};
    for (const [table, def] of Object.entries(spec.definitions || {})) {
      out[table] = {};
      for (const [col, p] of Object.entries((def as { properties?: Record<string, { format?: string; type?: string }> }).properties || {})) {
        out[table][col] = p.format || p.type || 'text';
      }
    }
    return out;
  })();
  return columnCache;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isText = (t?: string) => !t || t === 'text' || t.startsWith('character') || t === 'string';
const isJson = (t?: string) => t === 'jsonb' || t === 'json';

// ---------- Mongo-style filter -> PostgREST logic tree ----------

const NEVER = 'id.is.null'; // every table's id is required, so this matches nothing
const ALWAYS = 'id.not.is.null';

// "not" for one condition: a group takes a not. prefix, a field takes .not.
function negate(cond: string) {
  if (cond === NEVER) return ALWAYS;
  if (cond === ALWAYS) return NEVER;
  if (/^(or|and)\(/.test(cond)) return `not.${cond}`;
  return cond.replace(/^([A-Za-z_][A-Za-z0-9_]*)\./, '$1.not.');
}
const quote = (v: unknown) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

function scalar(v: unknown) {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function compare(col: string, type: string | undefined, op: string, v: unknown): string {
  v = scalar(v);
  if (v === '' && !isText(type) && !isJson(type)) return NEVER; // a date or number is never ''
  return `${col}.${op}.${quote(v)}`;
}

function equals(col: string, type: string | undefined, v: unknown): string {
  v = scalar(v);
  if (v === null || v === undefined) return `${col}.is.null`;
  if (isJson(type)) {
    // A single value matches when the list contains it (Mongo semantics).
    if (Array.isArray(v) || typeof v === 'object') return `${col}.eq.${quote(JSON.stringify(v))}`;
    return `or(${col}.cs.${quote(JSON.stringify([v]))},${col}.eq.${quote(JSON.stringify(v))})`;
  }
  if (typeof v === 'boolean') return `${col}.is.${v}`;
  return compare(col, type, 'eq', v);
}

function inList(col: string, type: string | undefined, values: unknown[]): string {
  const parts: string[] = [];
  const plain = values.map(scalar).filter((x) => x !== null && x !== undefined);
  if (values.some((x) => x === null || x === undefined)) parts.push(`${col}.is.null`);
  if (isJson(type)) for (const x of plain) parts.push(equals(col, type, x));
  else {
    const usable = plain.filter((x) => !(x === '' && !isText(type)));
    if (usable.length) parts.push(`${col}.in.(${usable.map(quote).join(',')})`);
  }
  if (!parts.length) return NEVER;
  return parts.length === 1 ? parts[0] : `or(${parts.join(',')})`;
}

function fieldConditions(col: string, type: string | undefined, value: unknown): string[] {
  const isOps = value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) &&
    Object.keys(value as object).some((k) => k.startsWith('$'));
  if (!isOps) return [equals(col, type, value)];
  const ops = value as Record<string, unknown>;
  const out: string[] = [];
  for (const [op, v] of Object.entries(ops)) {
    switch (op) {
      case '$in':
        if (!Array.isArray(v)) throw httpError(400, 'Bad filter');
        out.push(inList(col, type, v));
        break;
      case '$nin': {
        // Not in the list; an empty field counts as not in it unless the list has null.
        if (!Array.isArray(v)) throw httpError(400, 'Bad filter');
        const listsNull = v.some((x) => x === null || x === undefined);
        const values = v.filter((x) => x !== null && x !== undefined);
        const notIn = values.length ? negate(inList(col, type, values)) : ALWAYS;
        out.push(listsNull ? (notIn === ALWAYS ? `${col}.not.is.null` : `and(${notIn},${col}.not.is.null)`) : (notIn === ALWAYS ? ALWAYS : `or(${notIn},${col}.is.null)`));
        break;
      }
      case '$ne': {
        const x = scalar(v);
        // Not equal; an empty field counts as not equal (Mongo).
        if (x === null || x === undefined) out.push(`${col}.not.is.null`);
        else if (x === '' && !isText(type) && !isJson(type)) out.push(ALWAYS);
        else out.push(`or(${negate(equals(col, type, x))},${col}.is.null)`);
        break;
      }
      case '$gt': out.push(compare(col, type, 'gt', v)); break;
      case '$gte': out.push(compare(col, type, 'gte', v)); break;
      case '$lt': out.push(compare(col, type, 'lt', v)); break;
      case '$lte': out.push(compare(col, type, 'lte', v)); break;
      case '$exists': out.push(v ? `${col}.not.is.null` : `${col}.is.null`); break;
      case '$regex': {
        const flags = String(ops.$options || '');
        const source = v instanceof RegExp ? v.source : String(v);
        const insensitive = flags.includes('i') || (v instanceof RegExp && v.flags.includes('i'));
        out.push(`${col}.${insensitive ? 'imatch' : 'match'}.${quote(source)}`);
        break;
      }
      case '$options': break;
      default: throw httpError(400, `Unsupported filter ${op}`);
    }
  }
  return out;
}

function matchesEmpty(value: unknown): boolean {
  const ops = value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) &&
    Object.keys(value as object).some((k) => k.startsWith('$')) ? value as Record<string, unknown> : null;
  if (!ops) return value === null;
  return Object.entries(ops).every(([op, v]) => {
    if (op === '$ne') return v !== null && v !== undefined;
    if (op === '$nin') return Array.isArray(v) && !v.some((x) => x === null || x === undefined);
    if (op === '$in') return Array.isArray(v) && v.some((x) => x === null || x === undefined);
    if (op === '$exists') return !v;
    return op === '$options';
  });
}

function conditions(query: Row, table: string, cols: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined) continue;
    if (key === '$or' || key === '$and') {
      if (!Array.isArray(value) || !value.length) throw httpError(400, 'Bad filter');
      const groups = value.map((q) => {
        const c = conditions(q as Row, table, cols);
        return c.length ? `and(${c.join(',')})` : ALWAYS;
      });
      out.push(`${key === '$or' ? 'or' : 'and'}(${groups.join(',')})`);
      continue;
    }
    if (!NAME.test(key)) throw httpError(400, `Unsupported filter field ${key}`);
    // A field the table doesn't have is empty on every record.
    if (!(key in cols)) { out.push(matchesEmpty(value) ? ALWAYS : NEVER); continue; }
    out.push(...fieldConditions(key, cols[key], value));
  }
  return out;
}

// ---------- records ----------

const UTC_SUFFIX = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?)\+00:00$/;

function toRecord(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === 'string' && UTC_SUFFIX.test(v) ? v.replace(UTC_SUFFIX, '$1Z') : v;
  }
  return out;
}

const NAIVE_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?$/;

async function forWrite(entity: string, table: string, data: Row, cols: Record<string, string>): Promise<Row> {
  const out: Row = {};
  const dropped: string[] = [];
  for (const [k, raw] of Object.entries(data || {})) {
    if (raw === undefined) continue;
    if (!(k in cols)) { dropped.push(k); continue; }
    let v: unknown = raw instanceof Date ? raw.toISOString() : raw;
    const type = cols[k];
    if (v === '' && !isText(type) && !isJson(type)) v = null;
    // Base44 times without a zone are UTC.
    if (typeof v === 'string' && type.startsWith('timestamp') && NAIVE_TIME.test(v)) v += 'Z';
    // A signed link the app got from us is saved as the file itself.
    const area = FILE_COLUMNS[entity]?.[k] === 'public' ? 'public' : 'private';
    if (typeof v === 'string') v = await storedFile(v, area);
    else if (Array.isArray(v)) v = await Promise.all(v.map((x) => typeof x === 'string' ? storedFile(x, area) : x));
    out[k] = v;
  }
  if (dropped.length) console.warn(`[supabase] ${table}: not saved, no such field: ${dropped.join(', ')}`);
  return out;
}

// ---------- private files: signed links out, stored references in ----------

const SIGN_SECONDS = 24 * 3600;
const PRIVATE_REF = /^storage:\/\/private\/([A-Za-z0-9._\/-]{1,512})$/;
const signedLinks = new Map<string, { url: string; until: number }>();

function signedPrivatePath(value: string): string | null {
  const base = runtime.env.get('SUPABASE_URL')?.trim().replace(/\/+$/, '');
  if (!base || !value.startsWith(`${base}/storage/v1/object/sign/private/`)) return null;
  const rest = value.slice(`${base}/storage/v1/object/sign/private/`.length).split('?')[0];
  try {
    const path = rest.split('/').map(decodeURIComponent).join('/');
    return PRIVATE_REF.test(`storage://private/${path}`) ? path : null;
  } catch { return null; }
}

/** What to save for a value: our signed private link becomes storage://private/<path>, or,
 *  for a public field, a copy in the public area and its public link. Anything else as is. */
async function storedFile(value: string, area: 'public' | 'private'): Promise<string> {
  const path = signedPrivatePath(value);
  if (!path) return value;
  if (area === 'private') return `storage://private/${path}`;
  const res = await runtime.fetch(`${supabaseUrl()}/storage/v1/object/copy`, {
    method: 'POST',
    headers: serverHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ bucketId: 'private', sourceKey: path, destinationBucket: 'public', destinationKey: path }),
  });
  const ok = res.ok || res.status === 409; // 409: already copied
  await res.body?.cancel().catch(() => {});
  if (!ok) { console.warn(`[supabase] could not make a file public (${res.status}); kept private`); return `storage://private/${path}`; }
  return `${supabaseUrl()}/storage/v1/object/public/public/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const now = Date.now();
  const need: string[] = [];
  for (const p of new Set(paths)) {
    const hit = signedLinks.get(p);
    if (hit && hit.until > now) out.set(p, hit.url); else need.push(p);
  }
  for (let i = 0; i < need.length; i += 100) {
    const res = await runtime.fetch(`${supabaseUrl()}/storage/v1/object/sign/private`, {
      method: 'POST',
      headers: serverHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: SIGN_SECONDS, paths: need.slice(i, i + 100) }),
    });
    if (!res.ok) { await res.body?.cancel().catch(() => {}); continue; }
    for (const r of await res.json()) {
      if (!r?.signedURL || !r.path) continue;
      const url = `${supabaseUrl()}/storage/v1${r.signedURL}`;
      out.set(r.path, url);
      // Reused until an hour before it ends, so lists polled again keep the same link.
      signedLinks.set(r.path, { url, until: now + (SIGN_SECONDS - 3600) * 1000 });
    }
  }
  if (signedLinks.size > 5000) signedLinks.clear();
  return out;
}

/** Turns every storage://private/<path> string inside a JSON value into a signed link. */
export async function signPrivateRefs(value: unknown): Promise<unknown> {
  const paths: string[] = [];
  const collect = (v: unknown) => {
    if (typeof v === 'string') { const m = PRIVATE_REF.exec(v); if (m) paths.push(m[1]); }
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  collect(value);
  if (!paths.length) return value;
  const links = await signPaths(paths);
  const swap = (v: unknown): unknown => {
    if (typeof v === 'string') { const m = PRIVATE_REF.exec(v); return m && links.has(m[1]) ? links.get(m[1]) : v; }
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
    return v;
  };
  return swap(value);
}

async function rest(path: string, init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}) {
  const res = await runtime.fetch(`${supabaseUrl()}/rest/v1/${path}`, { ...init, headers: serverHeaders({ 'Content-Type': 'application/json', ...(init.headers || {}) }) });
  if (res.ok) {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  const body = await res.text().catch(() => '');
  let detail: { code?: string; message?: string } = {};
  try { detail = JSON.parse(body); } catch { /* not JSON */ }
  console.error(`[supabase] ${init.method || 'GET'} ${path.split('?')[0]}: ${res.status} ${detail.code || ''} ${(detail.message || body).slice(0, 300)}`);
  if (res.status === 409 || detail.code === '23505') throw httpError(409, 'That record already exists');
  if (res.status === 429) throw httpError(429, 'Too many requests');
  if (res.status === 404) throw httpError(404, 'Not found');
  throw httpError(res.status >= 400 && res.status < 500 ? 400 : 503, 'Database request failed');
}

const PAGE = 1000; // Supabase returns at most this many rows per request

function entityApi(entity: string) {
  const table = SUPABASE_TABLES[entity];
  const ensure = async () => {
    if (!table) throw httpError(404, `Unknown entity ${entity}`);
    const cols = (await columns())[table];
    if (!cols) throw httpError(503, `Table ${table} is missing`);
    return cols;
  };

  const read = async (query: Row, sort: unknown, limit: unknown, skip: unknown, fields: unknown) => {
    const cols = await ensure();
    const params = new URLSearchParams();
    const conds = conditions(query, table, cols);
    if (conds.length) params.set('and', `(${conds.join(',')})`);
    // Base44 lists newest first unless told otherwise.
    const order = typeof sort === 'string' && sort ? sort : '-created_date';
    const desc = order.startsWith('-');
    const col = order.replace(/^[-+]/, '');
    if (!NAME.test(col)) throw httpError(400, 'Bad sort');
    if (col in cols) params.set('order', `${col}.${desc ? 'desc.nullslast' : 'asc.nullsfirst'},id.asc`);
    if (fields) {
      const list = (Array.isArray(fields) ? fields : String(fields).split(',')).map((f) => String(f).trim()).filter(Boolean);
      if (list.some((f) => !NAME.test(f))) throw httpError(400, 'Bad fields');
      params.set('select', [...new Set(['id', ...list.filter((f) => f in cols)])].join(','));
    }
    const want = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : PAGE;
    let offset = Number.isFinite(Number(skip)) && Number(skip) > 0 ? Math.floor(Number(skip)) : 0;
    const rows: Row[] = [];
    while (rows.length < want) {
      const n = Math.min(PAGE, want - rows.length);
      params.set('limit', String(n));
      params.set('offset', String(offset));
      const page = await rest(`${table}?${params}`);
      rows.push(...page);
      if (page.length < n) break;
      offset += page.length;
    }
    return rows.map(toRecord);
  };

  const readCall = async (query: Row, args: unknown[]) => {
    const [sort, limit, skip, fields] = args;
    if (sort && typeof sort === 'object') {
      const o = sort as { sort?: string; limit?: number; fields?: string[] | string; cursor?: string | null };
      const skipFrom = o.cursor ? Number(o.cursor) || 0 : 0;
      const size = o.limit || 100;
      const items = await read(query, o.sort, size + 1, skipFrom, o.fields);
      const more = items.length > size;
      return { items: items.slice(0, size), next_cursor: more ? String(skipFrom + size) : null };
    }
    return read(query, sort, limit, skip, fields);
  };

  const byId = (id: unknown) => {
    if (typeof id !== 'string' || !id) throw httpError(404, 'Not found');
    return `id=eq.${encodeURIComponent(id)}`;
  };

  const api = {
    // An array, or one page { items, next_cursor } when given an options object.
    // deno-lint-ignore no-explicit-any
    list: (...args: unknown[]): Promise<any> => readCall({}, args),
    // deno-lint-ignore no-explicit-any
    filter: (query: Row = {}, ...args: unknown[]): Promise<any> => readCall(query || {}, args),
    async get(id: string) {
      await ensure();
      const rows = await rest(`${table}?${byId(id)}&limit=1`);
      if (!rows?.length) throw httpError(404, `${entity} not found`);
      return toRecord(rows[0]);
    },
    async create(data: Row) {
      const cols = await ensure();
      const rows = await rest(table, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(await forWrite(entity, table, data, cols)) });
      return toRecord(rows[0]);
    },
    async bulkCreate(list: Row[]) {
      const cols = await ensure();
      if (!Array.isArray(list) || !list.length) return [];
      const body = await Promise.all(list.map((d) => forWrite(entity, table, d, cols)));
      // PostgREST needs the same keys on every row of one insert.
      const keys = [...new Set(body.flatMap((r) => Object.keys(r)))];
      const rows = await rest(`${table}?columns=${keys.join(',')}`, { method: 'POST', headers: { Prefer: 'return=representation,missing=default' }, body: JSON.stringify(body) });
      return rows.map(toRecord);
    },
    async update(id: string, data: Row) {
      const cols = await ensure();
      const changes = await forWrite(entity, table, data, cols);
      if (!Object.keys(changes).length) return api.get(id);
      const rows = await rest(`${table}?${byId(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(changes) });
      if (!rows?.length) throw httpError(404, `${entity} not found`);
      return toRecord(rows[0]);
    },
    async delete(id: string) {
      await ensure();
      const rows = await rest(`${table}?${byId(id)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      if (!rows?.length) throw httpError(404, `${entity} not found`);
      return toRecord(rows[0]);
    },
  };
  return api;
}

const entities = new Proxy({} as Record<string, ReturnType<typeof entityApi>>, {
  get(_target, name) {
    if (typeof name !== 'string' || name === 'then' || name.startsWith('_')) return undefined;
    return entityApi(name);
  },
});

// ---------- files, email, assistant ----------

function storagePath(name: string) {
  const ext = (/\.([A-Za-z0-9]{1,8})$/.exec(name || '')?.[1] || 'bin').toLowerCase();
  const month = new Date().toISOString().slice(0, 7);
  return `uploads/${month}/${crypto.randomUUID()}.${ext}`;
}

async function upload(bucket: 'public' | 'private', file: Blob & { name?: string }) {
  if (!file || typeof (file as Blob).arrayBuffer !== 'function') throw httpError(400, 'No file');
  const path = storagePath(file.name || '');
  const res = await runtime.fetch(`${supabaseUrl()}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: serverHeaders({ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }),
    body: file,
  });
  if (!res.ok) {
    console.error(`[supabase] upload ${bucket}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    throw httpError(res.status === 413 ? 413 : 400, 'That file could not be saved');
  }
  await res.body?.cancel().catch(() => {});
  return path;
}

async function sendEmail(input: { to?: string; subject?: string; body?: string; from_name?: string }) {
  const key = runtime.env.get('RESEND_API_KEY');
  if (!key) throw httpError(503, 'Email is not set up yet');
  const from = runtime.env.get('EMAIL_FROM') || 'no-reply@mcsweenstransport.com';
  const res = await runtime.fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${input.from_name || 'McSween Transport'} <${from}>`, to: input.to, subject: input.subject || '', html: input.body || '' }),
  });
  if (!res.ok) {
    console.error(`[email] ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    throw httpError(502, 'The email could not be sent');
  }
  return await res.json().catch(() => ({}));
}

async function invokeLLM(input: { prompt?: string; response_json_schema?: unknown }) {
  const key = runtime.env.get('ANTHROPIC_API_KEY');
  if (!key) throw httpError(503, 'The assistant is not set up yet');
  const wantsJson = !!input.response_json_schema;
  const prompt = String(input.prompt || '') + (wantsJson
    ? `\n\nReply with only a JSON value matching this JSON schema, no other text:\n${JSON.stringify(input.response_json_schema)}`
    : '');
  const res = await runtime.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: runtime.env.get('ANTHROPIC_MODEL') || 'claude-haiku-5-5', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) {
    console.error(`[assistant] ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    throw httpError(502, 'The assistant is not available right now');
  }
  const out = await res.json();
  const text = (out.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
  if (!wantsJson) return text;
  const json = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? text;
  try { return JSON.parse(json.trim()); } catch { throw httpError(502, 'The assistant gave an unreadable answer'); }
}

const integrations = {
  Core: {
    SendEmail: sendEmail,
    InvokeLLM: invokeLLM,
    // Lands in the private area; the signed link shows it now, and saving it into
    // a public field copies it to the public area (see storedFile).
    async UploadPublicFile({ file }: { file: Blob & { name?: string } }) {
      const path = await upload('private', file);
      const links = await signPaths([path]);
      if (!links.has(path)) throw httpError(503, 'That file could not be saved');
      return { file_url: links.get(path) };
    },
    async UploadPrivateFile({ file }: { file: Blob & { name?: string } }) {
      return { file_uri: `storage://private/${await upload('private', file)}` };
    },
    async CreateFileSignedUrl({ file_uri, expires_in }: { file_uri: string; expires_in?: number }) {
      const m = /^storage:\/\/(private|public|downloads)\/(.+)$/.exec(String(file_uri || ''));
      if (!m) throw httpError(404, 'File not found');
      const path = m[2].split('/').map(encodeURIComponent).join('/');
      const res = await runtime.fetch(`${supabaseUrl()}/storage/v1/object/sign/${m[1]}/${path}`, {
        method: 'POST',
        headers: serverHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expiresIn: Math.max(10, Math.min(Number(expires_in) || 300, 7 * 24 * 3600)) }),
      });
      if (!res.ok) { await res.body?.cancel().catch(() => {}); throw httpError(404, 'File not found'); }
      const { signedURL } = await res.json();
      return { signed_url: `${supabaseUrl()}/storage/v1${signedURL}` };
    },
  },
};

// ---------- the signed-in person ----------

function bearer(req: Request) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') || '');
  const token = m?.[1]?.trim();
  // An app key is not a person's session.
  if (!token || token.startsWith('sb_publishable_') || token.startsWith('sb_secret_')) return null;
  return token;
}

// The scheduled jobs (pg_cron, supabase/migrations/20261020111953_*) call these
// functions with a token only the database holds, the way Base44's workflows
// ran them as the app's owner. For these functions only, a good token is the
// scheduler, an admin; anywhere else, or with a wrong token, it's nobody.
const SCHEDULED_FUNCTIONS = new Set(['weeklyReport', 'maintenanceAlerts', 'inspectionAlerts', 'learnTravelTimes']);
const SCHEDULER: Row = { id: 'scheduler', email: 'scheduler@mcsweenstransport.com', full_name: 'McSween Transport scheduler', role: 'admin' };
let servedFunction = '';

async function fromScheduler(req: Request) {
  const token = req.headers.get('x-tt-scheduler') || '';
  if (!SCHEDULED_FUNCTIONS.has(servedFunction) || !/^[a-f0-9]{64}$/.test(token)) return false;
  const res = await runtime.fetch(`${supabaseUrl()}/rest/v1/rpc/tt_scheduler_token_ok`, {
    method: 'POST',
    headers: serverHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_token: token }),
  });
  if (!res.ok) { await res.body?.cancel().catch(() => {}); return false; }
  return (await res.json().catch(() => false)) === true;
}

export function createClientFromRequest(req: Request) {
  let me: Promise<Row> | null = null;
  const serviceRole = { entities, integrations };
  return {
    auth: {
      me() {
        me ||= (async () => {
          if (req.headers.has('x-tt-scheduler')) {
            if (await fromScheduler(req)) return { ...SCHEDULER };
            throw httpError(401, 'Not signed in');
          }
          const token = bearer(req);
          if (!token) throw httpError(401, 'Not signed in');
          const res = await runtime.fetch(`${supabaseUrl()}/auth/v1/user`, { headers: { ...serverHeaders(), Authorization: `Bearer ${token}` } });
          if (!res.ok) { await res.body?.cancel().catch(() => {}); throw httpError(401, 'Not signed in'); }
          const account = await res.json();
          if (!account?.id) throw httpError(401, 'Not signed in');
          const rows = await rest(`app_user?auth_user_id=eq.${encodeURIComponent(account.id)}&limit=1`);
          const person = rows?.[0];
          if (!person || person.disabled === true) throw httpError(401, 'Not signed in');
          return toRecord(person);
        })();
        return me.then((p) => structuredClone(p));
      },
    },
    entities,
    integrations,
    asServiceRole: serviceRole,
  };
}

// ---------- serving ----------

const DEFAULT_ORIGINS = [
  'https://app.mcsweenstransport.com',
  'https://mcsweenstransport.com',
  'https://eager-transit-track-go.base44.app',
  // The Supabase build on Cloudflare while it is tested side by side.
  'https://new.mcsweenstransport.com',
  'https://mcsween-transport.pages.dev',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
  'http://localhost:5173',
];
// Cloudflare's preview copies of the site: https://<build>.mcsween-transport.pages.dev
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]{1,63}\.mcsween-transport\.pages\.dev$/;

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (runtime.env.get('ALLOWED_ORIGINS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = allowed.length ? allowed : DEFAULT_ORIGINS;
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origin && (list.includes(origin) || (!allowed.length && PREVIEW_ORIGIN.test(origin)))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

export function withCors(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req.headers.get('Origin'));
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res: Response;
    try {
      res = await handler(req);
    } catch (error) {
      const e = error as { status?: number; response?: { status?: number }; message?: string };
      const status = e?.status ?? e?.response?.status;
      const known = typeof status === 'number' && status >= 400 && status < 500;
      if (!known) console.error('[function] unhandled error:', error);
      res = Response.json({ error: known ? String(e.message || 'Request failed') : 'Something went wrong. Please try again.' }, { status: known ? status : 500 });
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    let body: BodyInit | null = res.body;
    if (res.status < 300 && (headers.get('content-type') || '').includes('application/json')) {
      const text = await res.text();
      body = text;
      if (text.includes('storage://private/')) {
        try { body = JSON.stringify(await signPrivateRefs(JSON.parse(text))); headers.delete('content-length'); }
        catch (error) { console.error('[function] could not sign file links:', error); }
      }
    }
    return new Response(body, { status: res.status, statusText: res.statusText, headers });
  };
}

export function serve(handler: (req: Request) => Response | Promise<Response>, name = '') {
  servedFunction = name;
  (globalThis as unknown as { Deno: { serve: (h: (req: Request) => Promise<Response>) => unknown } }).Deno.serve(withCors(handler));
}
