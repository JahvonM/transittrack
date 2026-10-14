// Checks the one-time Base44 copy functions on a throwaway in-memory Postgres
// (PGlite), with every applied migration, before they go to Supabase.
//   node tools/supabase/test-import.mjs <path to pglite package dir>
import fs from "node:fs";
import path from "node:path";

const pglitePath = process.argv[2];
const { PGlite } = await import(path.join(pglitePath, "dist/index.js"));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const dir = path.join(root, "supabase/migrations");
const db = new PGlite();
await db.exec("create role anon; create role authenticated;");
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
const extra = process.argv[3];
if (extra) await db.exec(fs.readFileSync(extra, "utf8"));

let failures = 0;
const check = (what, ok, detail = "") => { console.log((ok ? "ok   " : "FAIL ") + what + (detail ? " - " + detail : "")); if (!ok) failures++; };
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];

const tok = "k".repeat(64);
check("refuses with no key stored", (await one("select public.import_check($1) ok", [tok])).ok === false);
await db.query("insert into migration.import_token(hash) values (encode(sha256(convert_to($1,'UTF8')),'hex'))", [tok]);
check("accepts the stored key", (await one("select public.import_check($1) ok", [tok])).ok === true);
check("refuses another key", (await one("select public.import_check($1) ok", ["x".repeat(64)])).ok === false);
check("refuses a short key", (await one("select public.import_check($1) ok", [""])).ok === false);

const rows = [
  { id: "6a9f6f7eb6140c8f23e2e4e5", created_date: "2026-09-01T10:00:00.123000", updated_date: "2026-09-02T10:00:00.000000", name: "WHITE BAD BUS", type: "bus", company_id: "c1", status: "flying", trail: [{ lat: 1, lng: 2, t: "x" }], capacity: "30", tracking_active: true, mystery_field: "x" },
  { id: "v2", created_date: "2026-09-01T10:00:00", updated_date: "2026-09-01T10:00:00", type: "bus", company_id: "c1", capacity: "abc" },
];
const r = (await one("select public.import_rows($1,'vehicle',$2::jsonb) r", [tok, JSON.stringify(rows)])).r;
check("copies a good row, even one Base44 let break today's rules", r.copied === 1, JSON.stringify(r));
check("reports a row that can't be stored", r.failed.length === 1 && r.failed[0].id === "v2");
check("counts fields with no column", r.dropped_fields.mystery_field === 1);
const v = await one("select status, capacity, updated_date, trail from public.vehicle where id = $1", [rows[0].id]);
check("keeps values and types", v.status === "flying" && v.capacity === 30 && Array.isArray(v.trail));
check("reads Base44 times as UTC", new Date(v.updated_date).toISOString() === "2026-09-02T10:00:00.000Z", String(v.updated_date));
rows[0].name = "WHITE BUS"; rows[0].updated_date = "2026-09-03T10:00:00";
await db.query("select public.import_rows($1,'vehicle',$2::jsonb)", [tok, JSON.stringify([rows[0]])]);
const again = await one("select name, updated_date from public.vehicle where id = $1", [rows[0].id]);
check("copying again updates, keeping Base44's updated_date", again.name === "WHITE BUS" && new Date(again.updated_date).toISOString() === "2026-09-03T10:00:00.000Z");
await db.query("update public.vehicle set speed = 1 where id = $1", [rows[0].id]);
const touched = await one("select updated_date from public.vehicle where id = $1", [rows[0].id]);
check("ordinary updates still move updated_date", new Date(touched.updated_date) > new Date("2026-09-04"));
const c = (await one("select public.import_counts($1) c", [tok])).c;
check("counts every table", Object.keys(c).length === 51 && c.vehicle === 1);
try { await db.query("select public.import_rows($1,'migration.import_token','[]'::jsonb)", [tok]); check("refuses other tables", false); }
catch (e) { check("refuses other tables", /unknown table/.test(e.message)); }
try { await db.query("select public.import_rows($1,'vehicle','[]'::jsonb)", ["x".repeat(64)]); check("refuses rows without the key", false); }
catch (e) { check("refuses rows without the key", /not allowed/.test(e.message)); }
const u = [{ id: "u1", created_date: "2026-09-01T10:00:00", updated_date: "2026-09-01T10:00:00", email: "a@b.c", full_name: "A", role: "staff", pickup_lat: 12.04, pickup_moved: { by: "x" } }];
const ur = (await one("select public.import_rows($1,'app_user',$2::jsonb) r", [tok, JSON.stringify(u)])).r;
check("copies users", ur.copied === 1, JSON.stringify(ur));
const grants = await one("select has_function_privilege('authenticated','public.import_rows(text,text,jsonb)','execute') a, has_function_privilege('anon','public.import_rows(text,text,jsonb)','execute') b");
check("only the anonymous key can call it (the copy key guards it)", grants.a === false && grants.b === true);
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
