// Checks supabase/migrations/*_keep_copied_updated_date.sql on a throwaway
// local Postgres (PGlite), never on the real project:
//   node tools/supabase/check-updated-date.mjs <node_modules with @electric-sql/pglite>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const modules = process.argv[2] || path.join(root, "node_modules");
const { PGlite } = createRequire(path.join(modules, "x.js"))("@electric-sql/pglite");
const db = new PGlite();
const file = fs.readdirSync(path.join(root, "supabase/migrations")).find((f) => f.endsWith("_keep_copied_updated_date.sql"));
await db.exec(fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8"));
await db.exec(`
  create table t (id text primary key, name text, data jsonb, updated_date timestamptz not null default now());
  create trigger t_touch before update on t for each row execute function public.touch_updated_date();
  insert into t values ('a', 'Bus A', '{"x":1}', '2026-09-01T10:00:00Z');
`);
const when = async () => (await db.query(`select updated_date::text as u from t where id = 'a'`)).rows[0].u;
const results = [];
const check = (name, ok) => { results.push(`${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) process.exitCode = 1; };

// The copy sends the same row again (as an upsert does).
await db.exec(`insert into t values ('a', 'Bus A', '{"x":1}', '2026-09-01T10:00:00Z') on conflict (id) do update set name = excluded.name, data = excluded.data, updated_date = excluded.updated_date`);
check("copying an unchanged row keeps Base44's time", (await when()).startsWith("2026-09-01 10:00:00"));

// The copy sends a changed row with Base44's new time.
await db.exec(`insert into t values ('a', 'Bus A2', '{"x":2}', '2026-09-05T08:00:00Z') on conflict (id) do update set name = excluded.name, data = excluded.data, updated_date = excluded.updated_date`);
check("copying a changed row takes Base44's new time", (await when()).startsWith("2026-09-05 08:00:00"));

// The app changes something without saying when.
await db.exec(`update t set name = 'Bus A3' where id = 'a'`);
check("an ordinary change stamps the time now", new Date(await when()).getTime() > Date.now() - 60000);

// Running the migration again is harmless.
await db.exec(fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8"));
check("safe to run twice", true);
console.log(results.join("\n"));
