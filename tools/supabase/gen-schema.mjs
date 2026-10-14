// Builds the Supabase (Postgres) tables from the Base44 entity schemas in
// base44/entities, so the two never drift while TransitTrack moves over.
//
//   node tools/supabase/gen-schema.mjs
//
// Writes supabase/migrations/20261014000000_tables.sql and
// supabase/entity-tables.json (entity name -> table name, for the data layer).
//
// That migration is already applied to the Supabase project (the repo is
// linked, so files in supabase/migrations are applied when they reach GitHub).
// A later schema change goes in a NEW, dated migration file, never by
// re-running this over the applied one.
//
// Choices, so the Base44 data copies across as it is:
// - ids stay text (Base44's 24-character ids); new rows get the same shape.
// - Base44's own fields (created_date, updated_date, created_by, ...) are kept.
// - "required" and enum lists become CHECKs added NOT VALID: new and changed
//   rows must follow them, rows copied from Base44 are reported, not refused.
// - no foreign keys yet: Base44 data can point at deleted rows. Added once the
//   copy is checked.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const entityDir = path.join(root, "base44/entities");
const outSql = path.join(root, "supabase/migrations/20261014000000_tables.sql");
const outMap = path.join(root, "supabase/entity-tables.json");

const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, "");
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toLowerCase();
// Postgres words that can't be a bare table name.
const TABLE_NAME = { User: "app_user" };
const tableOf = (entity) => TABLE_NAME[entity] || snake(entity);
const ident = (s) => (/^[a-z_][a-z0-9_]*$/.test(s) && !RESERVED.has(s) ? s : `"${s.replace(/"/g, '""')}"`);
const RESERVED = new Set(["user", "order", "group", "default", "check", "references", "select", "table", "end", "limit", "offset", "primary", "type", "from", "to", "when", "where", "window", "column", "constraint", "analyse", "analyze", "desc", "asc", "all", "and", "any", "array", "as", "both", "case", "cast", "collate", "create", "current_date", "current_time", "current_user", "distinct", "do", "else", "except", "false", "fetch", "for", "foreign", "grant", "having", "in", "initially", "intersect", "into", "leading", "not", "null", "on", "only", "or", "placing", "returning", "session_user", "some", "symmetric", "then", "trailing", "true", "union", "unique", "user", "using", "variadic", "with"]);
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

// Fields every Base44 record has, whatever its schema says.
const BUILTIN = [
  ["id", "text primary key default public.new_id()"],
  ["created_date", "timestamptz not null default now()"],
  ["updated_date", "timestamptz not null default now()"],
  ["created_by", "text"],
  ["created_by_id", "text"],
  ["is_sample", "boolean default false"],
];
// Base44's built-in User fields (its schema only lists the app's own).
const USER_BUILTIN = [["email", "text"], ["full_name", "text"], ["role", "text"], ["disabled", "boolean"], ["auth_user_id", "uuid unique"]];

function columnType(d) {
  const t = Array.isArray(d.type) ? d.type.find((x) => x !== "null") : d.type;
  if (t === "string") return d.format === "date-time" ? "timestamptz" : d.format === "date" ? "date" : "text";
  if (t === "number") return "double precision";
  if (t === "integer") return "bigint";
  if (t === "boolean") return "boolean";
  return "jsonb"; // object, array
}
function defaultOf(d, type) {
  if (!("default" in d) || d.default === null) return "";
  const v = d.default;
  if (type === "jsonb") return ` default ${lit(JSON.stringify(v))}::jsonb`;
  if (type === "boolean") return ` default ${v ? "true" : "false"}`;
  if (type === "double precision" || type === "bigint") return Number.isFinite(Number(v)) ? ` default ${Number(v)}` : "";
  if (type === "timestamptz" || type === "date") return "";
  return ` default ${lit(v)}`;
}

const files = fs.readdirSync(entityDir).filter((f) => f.endsWith(".jsonc")).sort();
const map = {};
const out = [];
out.push(`-- TransitTrack tables, generated from base44/entities by tools/supabase/gen-schema.mjs.
-- Do not edit by hand: change the entity schema and run the generator again.

-- New ids look like Base44's: 24 hex characters.
create or replace function public.new_id() returns text
language sql volatile as $$ select substr(replace(gen_random_uuid()::text, '-', ''), 1, 24) $$;

-- updated_date follows every change.
create or replace function public.touch_updated_date() returns trigger
language plpgsql as $$ begin new.updated_date := now(); return new; end $$;
`);

let fieldCount = 0;
for (const file of files) {
  const schema = JSON.parse(stripComments(fs.readFileSync(path.join(entityDir, file), "utf8")));
  const entity = schema.name || path.basename(file, ".jsonc");
  const table = tableOf(entity);
  map[entity] = table;
  const props = schema.properties || {};
  const cols = [];
  const seen = new Set();
  const add = (name, def) => { if (seen.has(name)) return; seen.add(name); cols.push(`  ${ident(name)} ${def}`); };
  for (const [name, def] of BUILTIN) add(name, def);
  if (entity === "User") for (const [name, def] of USER_BUILTIN) add(name, def);
  const checks = [];
  const indexes = [];
  for (const [name, d] of Object.entries(props)) {
    if (seen.has(name)) continue;
    const type = columnType(d);
    add(name, type + defaultOf(d, type));
    fieldCount++;
    if (Array.isArray(d.enum) && d.enum.length && type === "text") {
      checks.push([`${table}_${name}_allowed`, `${ident(name)} is null or ${ident(name)} in (${d.enum.map(lit).join(", ")})`]);
    }
    if (/_id$/.test(name) && type === "text") indexes.push([name]);
    if (name === "email" || /_email$/.test(name)) indexes.push([name]);
  }
  for (const name of schema.required || []) {
    if (seen.has(name)) checks.push([`${table}_${name}_required`, `${ident(name)} is not null`]);
  }
  if (entity === "User") indexes.push(["email"]);
  const desc = schema.description ? ` -- ${schema.description.replace(/\s+/g, " ").slice(0, 200)}` : "";
  out.push(`\n-- ${entity}${desc}\ncreate table if not exists public.${ident(table)} (\n${cols.join(",\n")}\n);`);
  out.push(`create or replace trigger ${table}_touch before update on public.${ident(table)} for each row execute function public.touch_updated_date();`);
  for (const [name, expr] of checks) {
    out.push(`alter table public.${ident(table)} add constraint ${ident(name.slice(0, 63))} check (${expr}) not valid;`);
  }
  const done = new Set();
  for (const colsOf of [...indexes, ["created_date"]]) {
    const key = colsOf.join(",");
    if (done.has(key)) continue;
    done.add(key);
    const idx = `${table}_${colsOf.join("_")}_idx`.slice(0, 63);
    const order = colsOf.length === 1 && colsOf[0] === "created_date" ? "created_date desc" : colsOf.map(ident).join(", ");
    out.push(`create index if not exists ${ident(idx)} on public.${ident(table)} (${order});`);
  }
}

// The busy lookups, beyond one index per id column.
out.push(`
-- Busy lookups: GPS history by bus and time, today's check-ins per bus,
-- a passenger's memberships, push tokens by owner.
create index if not exists location_ping_vehicle_time_idx on public.location_ping (vehicle_id, recorded_at desc);
create index if not exists staff_check_in_vehicle_time_idx on public.staff_check_in (vehicle_id, created_date desc);
create index if not exists company_membership_company_scope_idx on public.company_membership (company_id, scope, active);
create index if not exists push_token_token_idx on public.push_token (token);
`);

fs.mkdirSync(path.dirname(outSql), { recursive: true });
fs.writeFileSync(outSql, out.join("\n") + "\n");
fs.writeFileSync(outMap, JSON.stringify(map, null, 2) + "\n");
console.log(`${files.length} tables, ${fieldCount} fields -> ${path.relative(root, outSql)}`);
