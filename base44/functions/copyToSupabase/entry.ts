import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { SUPABASE_TABLES } from '../../shared/supabaseTables.ts';
import { FILE_COLUMNS, base44FileKind, fileValues, applyFileMap, copyOneFile, loadFileMap, fileKey } from '../../shared/supabaseFiles.ts';

// Step 3 of the move to Supabase (Admin -> Settings -> Copy data to Supabase):
// copies every table from Base44 into the new database a page at a time,
// keeping the same ids. Running it again updates rows already copied.
// Administrators only. The Supabase address and secret key are app secrets the
// owner enters in Base44 (SUPABASE_URL, SUPABASE_SECRET_KEY); they never reach
// the browser, and Supabase stays locked to everyone else. Replies carry only
// counts, the ids of rows that failed with the reason, and field names.

const PAGE = 200;
// Shown with every error, so a message on screen says which copy of this
// code answered (an app window left open can call an older one).
const VERSION = 'copy v8';
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const statusOf = (error: unknown) => {
  const e = error as { status?: number; response?: { status?: number } } | null;
  return Number(e?.status ?? e?.response?.status ?? 0);
};

// Base44 sometimes refuses or drops a request for a moment (once it answered
// "access this app through the support panel" for one table, mid-copy). Try
// again before giving up, and then say which Base44 answer it was.
async function base44Read<T>(read: () => Promise<T>, what: string): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await pause(400 * 3 ** (attempt - 1));
    try { return await read(); } catch (error) { last = error; }
  }
  fail(502, `Base44 didn't hand over ${what} just now: ${String((last as Error)?.message || last).slice(0, 160)}`);
}

// App secrets reach backend functions through base44:runtime and as
// environment variables; read whichever answers.
function readSecret(name: string): string {
  let value: unknown;
  try { value = typeof secrets?.get === 'function' ? secrets.get(name) : undefined; } catch { value = undefined; }
  if (typeof value !== 'string' || !value.trim()) {
    try { value = Deno.env.get(name); } catch { value = undefined; }
  }
  // Pasted values sometimes keep the quotes they were copied with.
  return typeof value === 'string' ? value.trim().replace(/^(['"`])(.*)\1$/s, '$2').trim() : '';
}

// Accepts the project address the way people paste it: with or without
// https://, with a trailing slash or /rest/v1, or the dashboard link for the
// project. Anything that isn't a supabase.co project is refused, so the
// secret key is only ever sent to Supabase.
function supabaseOrigin(raw: string): string | null {
  const value = raw.trim();
  const dashboard = value.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{20})(?:[/?#]|$)/i);
  if (dashboard) return `https://${dashboard[1].toLowerCase()}.supabase.co`;
  if (/^[a-z0-9]{20}$/i.test(value)) return `https://${value.toLowerCase()}.supabase.co`;
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : 'https://' + value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) return null;
  return url.origin;
}

function supabaseConfig() {
  const rawUrl = readSecret('SUPABASE_URL');
  const key = readSecret('SUPABASE_SECRET_KEY');
  // Which settings this server can see (never their values), for the logs.
  console.log(VERSION, JSON.stringify({ runtimeSecrets: typeof secrets?.get === 'function', urlSet: !!rawUrl, keySet: !!key }));
  if (!rawUrl) fail(503, 'Supabase is not set up yet: this server can\'t see SUPABASE_URL in the app secrets.');
  const origin = supabaseOrigin(rawUrl);
  if (!origin) fail(503, 'SUPABASE_URL should look like https://<project>.supabase.co');
  if (!key || /\s/.test(key)) fail(503, 'Supabase is not set up yet: this server can\'t see SUPABASE_SECRET_KEY in the app secrets.');
  if (key.startsWith('sb_publishable_') || jwtRole(key) === 'anon') fail(503, 'SUPABASE_SECRET_KEY is the public key. Use the secret key from Supabase -> Project Settings -> API Keys.');
  // New Supabase secret keys are not JWTs: apikey only.
  const headers: Record<string, string> = { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }) };
  return { origin, headers };
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
// Base44's own account plumbing on User records. Supabase sign-in replaces
// it, so it is left behind on purpose and not reported as missing.
const BASE44_ONLY: Record<string, Set<string>> = { User: new Set(['app_id', 'is_service', 'collaborator_role', '_app_role', 'force_password_reset']) };
// Columns only Supabase writes: who a person's sign-in account is.
const SUPABASE_ONLY: Record<string, Set<string>> = { User: new Set(['auth_user_id']) };
function cleanRow(entity: string, row: Record<string, unknown>, cols: Set<string>, dropped: Record<string, number>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (BASE44_ONLY[entity]?.has(key) || SUPABASE_ONLY[entity]?.has(key)) continue;
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

// Step 4: a Supabase sign-in account for each person in Base44, by email.
// Only emails Base44 had verified are set up (as confirmed, with no password
// and no email sent); the database then links each account to its person
// (supabase/migrations/*_link_sign_in_accounts.sql). Someone unverified signs
// up again and is linked once they confirm their email. Replies hold counts
// and Base44 ids, never emails.
async function setUpSignInAccounts(base44: ReturnType<typeof createClientFromRequest>, sb: ReturnType<typeof supabaseConfig>) {
  const people: Record<string, unknown>[] = [];
  for (let skip = 0; ; skip += PAGE) {
    const page = await base44Read(() => base44.asServiceRole.entities.User.filter({}, 'created_date', PAGE, skip), 'the people');
    people.push(...page);
    if (page.length < PAGE) break;
  }
  // Everyone is copied first, so each account links to the person with the
  // same Base44 id instead of the database making a new person for it.
  const cols = (await tableColumns(sb)).app_user;
  if (!cols?.size) fail(502, 'Supabase has no app_user table yet');
  if (people.length) {
    const copy = await upsert(sb, 'app_user', people.map((p) => cleanRow('User', p, cols, {})));
    if (!copy.ok) fail(502, 'Could not copy the people to Supabase first: ' + await supabaseError(copy));
    await copy.body?.cancel().catch(() => {});
  }
  let created = 0, existing = 0, unverified = 0, noEmail = 0;
  const failed: { id: string; error: string }[] = [];
  for (const person of people) {
    const email = String(person.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { noEmail++; continue; }
    if (person.is_verified !== true) { unverified++; continue; }
    const name = String(person.full_name ?? '').trim().slice(0, 200);
    const res = await fetch(`${sb.origin}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { ...sb.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        email_confirm: true,
        ...(name ? { user_metadata: { full_name: name } } : {}),
        // Someone switched off in Base44 can't sign in to Supabase either.
        ...(person.disabled === true ? { ban_duration: '876000h' } : {}),
      }),
    });
    if (res.ok) { created++; await res.body?.cancel().catch(() => {}); continue; }
    const text = await res.text().catch(() => '');
    if (res.status === 422 && /email_exists|already been registered/i.test(text)) { existing++; continue; }
    let error = text.slice(0, 200) || 'HTTP ' + res.status;
    try { const j = JSON.parse(text); error = String(j.msg || j.message || j.error_description || j.error || error).slice(0, 200); } catch { /* not JSON */ }
    failed.push({ id: String(person.id ?? ''), error });
  }
  const linked = await countRows(sb, 'app_user', '&auth_user_id=not.is.null');
  return { people: people.length, created, existing, unverified, no_email: noEmail, failed, linked };
}

// Step 5: copies the files one table's rows point to (a page at a time, like
// the table copy), then points the Supabase rows at the copies. Safe to run
// again: files already copied are skipped. Replies hold counts and, for files
// that failed, the table, row id, field and reason; never the files or links.
async function copyFiles(base44: ReturnType<typeof createClientFromRequest>, sb: ReturnType<typeof supabaseConfig>, body: Record<string, unknown>) {
  const entity = body.entity;
  if (typeof entity !== 'string' || !Object.hasOwn(FILE_COLUMNS, entity)) fail(400, 'Unknown table');
  const table = SUPABASE_TABLES[entity];
  const skip = Number.isInteger(body.skip) && (body.skip as number) >= 0 ? body.skip as number : 0;
  const rows = await base44Read(() => base44.asServiceRole.entities[entity].filter({}, 'created_date', PAGE, skip), entity);
  const map = await loadFileMap(sb).catch(() => fail(502, 'Could not read which files are copied'));
  const signedUrl = async (uri: string) => (await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 120 }))?.signed_url || '';
  let files = 0, copied = 0, already = 0;
  const failed: { entity: string; id: string; column: string; error: string }[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    const id = String(row.id ?? '');
    const changed: Record<string, unknown> = {};
    for (const [column, bucket] of Object.entries(FILE_COLUMNS[entity])) {
      let touched = false;
      for (const value of fileValues(row[column])) {
        const kind = base44FileKind(value);
        if (!kind) continue;
        files++;
        if (map.has(fileKey(bucket, value as string))) { already++; touched = true; continue; }
        try {
          map.set(fileKey(bucket, value as string), await copyOneFile(sb, { table, id, column, bucket }, value as string, kind, signedUrl));
          copied++; touched = true;
        } catch (error) {
          failed.push({ entity, id, column, error: String((error as Error)?.message || error).slice(0, 200) });
        }
      }
      if (touched) changed[column] = applyFileMap(entity, { [column]: row[column] }, map, sb.origin)[column];
    }
    // The copied row points at the new files (a row not copied yet gets them
    // when the tables are copied).
    if (Object.keys(changed).length) {
      const res = await fetch(`${sb.origin}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...sb.headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(changed),
      });
      if (!res.ok) failed.push({ entity, id, column: Object.keys(changed).join(','), error: 'Copied, but the row was not updated: ' + await supabaseError(res) });
      else await res.body?.cancel().catch(() => {});
    }
  }
  return { entity, read: rows.length, files, copied, already, failed, next_skip: skip + rows.length, done: rows.length < PAGE };
}

async function countRows(sb: ReturnType<typeof supabaseConfig>, table: string, filter = '') {
  const res = await fetch(`${sb.origin}/rest/v1/${table}?select=id&limit=1${filter}`, { headers: { ...sb.headers, Prefer: 'count=exact' } });
  if (!res.ok) return null;
  const total = Number((res.headers.get('content-range') || '').split('/')[1]);
  return Number.isFinite(total) ? total : null;
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    // Who is asking. Not signed in, or not an administrator: refused. Base44
    // failing to answer is said as such, not as "administrators only".
    let user: { role?: string } | null = null;
    let meError: unknown = null;
    for (let attempt = 0; attempt < 2 && !user; attempt++) {
      if (attempt) await pause(400);
      try { user = await base44.auth.me(); meError = null; } catch (error) {
        meError = error;
        if ([401, 403].includes(statusOf(error))) break;
      }
    }
    if (!user && meError && ![401, 403].includes(statusOf(meError))) {
      fail(503, 'Base44 could not confirm who you are just now. Please press the button again.');
    }
    if (!user || user.role !== 'admin') fail(403, 'Administrators only');
    const body = await req.json().catch(() => ({}));
    if (body.action === 'tables') return Response.json({ entities: Object.keys(SUPABASE_TABLES), files: Object.keys(FILE_COLUMNS) });

    const sb = supabaseConfig();
    if (body.action === 'counts') {
      const counts: Record<string, number | null> = {};
      for (const [entity, table] of Object.entries(SUPABASE_TABLES)) counts[entity] = await countRows(sb, table);
      return Response.json({ counts });
    }
    if (body.action === 'accounts') return Response.json({ version: VERSION, ...(await setUpSignInAccounts(base44, sb)) });
    if (body.action === 'files') return Response.json({ version: VERSION, ...(await copyFiles(base44, sb, body)) });
    if (body.action !== 'copy') fail(400, 'Unknown action');
    const entity = body.entity;
    if (typeof entity !== 'string' || !Object.hasOwn(SUPABASE_TABLES, entity)) fail(400, 'Unknown table');
    const table = SUPABASE_TABLES[entity];
    const skip = Number.isInteger(body.skip) && body.skip >= 0 ? body.skip : 0;

    const cols = (await tableColumns(sb))[table];
    if (!cols?.size) fail(502, `Supabase has no ${table} table yet`);
    const rows = await base44Read(() => base44.asServiceRole.entities[entity].filter({}, 'created_date', PAGE, skip), entity);
    const dropped: Record<string, number> = {};
    // Files already copied keep pointing at their Supabase copy.
    const fileMap = FILE_COLUMNS[entity] ? await loadFileMap(sb).catch(() => fail(502, 'Could not read which files are copied')) : null;
    const clean = rows.map((r: Record<string, unknown>) => {
      const row = cleanRow(entity, r, cols, dropped);
      return fileMap ? applyFileMap(entity, row, fileMap, sb.origin) : row;
    });
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
    return Response.json({ version: VERSION, entity, read: rows.length, copied, failed, dropped_fields: dropped, next_skip: skip + rows.length, done: rows.length < PAGE });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (!status) console.log(VERSION, 'failed:', String((error as Error)?.message || error).slice(0, 300));
    return Response.json({ error: `${status ? (error as Error).message : 'Copy failed'} (${VERSION})` }, { status: status || 500 });
  }
}
