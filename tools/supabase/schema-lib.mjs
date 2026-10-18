// The Supabase tables as the Base44 entity schemas describe them, what the
// applied migrations already hold, and the SQL that closes the gap.
// Used by tools/supabase/gen-schema.mjs and by the test that keeps the two
// in step (src/lib/__tests__/supabaseSchemaInStep.test.js).
//
// Choices, so the Base44 data copies across as it is:
// - ids stay text (Base44's 24-character ids); new rows get the same shape.
// - Base44's own fields (created_date, updated_date, created_by, ...) are kept.
// - "required" and enum lists become CHECKs added NOT VALID: new and changed
//   rows must follow them, rows copied from Base44 are reported, not refused.
// - no foreign keys yet: Base44 data can point at deleted rows.
// - every table has row level security on and no policies: only the server
//   (secret key) reads or writes until the app's own rules are ported.

import fs from "node:fs";
import path from "node:path";

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export const entityDir = path.join(root, "base44/entities");
export const migrationDir = path.join(root, "supabase/migrations");

const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, "");
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toLowerCase();
// Postgres words that can't be a bare table name.
const TABLE_NAME = { User: "app_user" };
export const tableOf = (entity) => TABLE_NAME[entity] || snake(entity);
const RESERVED = new Set(["user", "order", "group", "default", "check", "references", "select", "table", "end", "limit", "offset", "primary", "type", "from", "to", "when", "where", "window", "column", "constraint", "analyse", "analyze", "desc", "asc", "all", "and", "any", "array", "as", "both", "case", "cast", "collate", "create", "current_date", "current_time", "current_user", "distinct", "do", "else", "except", "false", "fetch", "for", "foreign", "grant", "having", "in", "initially", "intersect", "into", "leading", "not", "null", "on", "only", "or", "placing", "returning", "session_user", "some", "symmetric", "then", "trailing", "true", "union", "unique", "using", "variadic", "with"]);
export const ident = (s) => (/^[a-z_][a-z0-9_]*$/.test(s) && !RESERVED.has(s) ? s : `"${s.replace(/"/g, '""')}"`);
const unident = (s) => (s.startsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s);
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
// Left out on purpose: Base44's own account plumbing (app_id, is_service,
// collaborator_role, _app_role, force_password_reset), which Supabase sign-in
// replaces. base44/functions/copyToSupabase skips those too.
const USER_BUILTIN = [["email", "text"], ["full_name", "text"], ["role", "text"], ["disabled", "boolean"], ["disabled_reason", "text"], ["is_verified", "boolean"], ["auth_user_id", "uuid unique"]];
// Fields older rows carry that the entity schema no longer lists.
const LEGACY = { Trip: [["ended_at", "timestamptz"]] };

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

// What each table should hold, from base44/entities.
export function desiredTables(dir = entityDir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonc")).sort();
  return files.map((file) => {
    const schema = JSON.parse(stripComments(fs.readFileSync(path.join(dir, file), "utf8")));
    const entity = schema.name || path.basename(file, ".jsonc");
    const table = tableOf(entity);
    const columns = new Map();
    const add = (name, def) => { if (!columns.has(name)) columns.set(name, def); };
    for (const [name, def] of BUILTIN) add(name, def);
    if (entity === "User") for (const [name, def] of USER_BUILTIN) add(name, def);
    const checks = new Map();
    const indexes = new Map();
    const index = (cols) => {
      const name = `${table}_${cols.join("_")}_idx`.slice(0, 63);
      if (!indexes.has(name)) indexes.set(name, cols.length === 1 && cols[0] === "created_date" ? "created_date desc" : cols.map(ident).join(", "));
    };
    for (const [name, d] of Object.entries(schema.properties || {})) {
      if (columns.has(name)) continue;
      const type = columnType(d);
      add(name, type + defaultOf(d, type));
      if (Array.isArray(d.enum) && d.enum.length && type === "text") {
        checks.set(`${table}_${name}_allowed`.slice(0, 63), `${ident(name)} is null or ${ident(name)} in (${d.enum.map(lit).join(", ")})`);
      }
      if (/_id$/.test(name) && type === "text") index([name]);
      if (name === "email" || /_email$/.test(name)) index([name]);
    }
    for (const [name, def] of LEGACY[entity] || []) add(name, def);
    for (const name of schema.required || []) {
      if (columns.has(name)) checks.set(`${table}_${name}_required`.slice(0, 63), `${ident(name)} is not null`);
    }
    if (entity === "User") index(["email"]);
    index(["created_date"]);
    const description = schema.description ? schema.description.replace(/\s+/g, " ").slice(0, 200) : "";
    return { entity, table, description, columns, checks, indexes };
  });
}

// What the migrations in supabase/migrations have already made, read from
// their SQL: public tables, their columns, our CHECKs and index names.
export function appliedSchema(dir = migrationDir) {
  const tables = new Map();
  const checks = new Map();
  const indexes = new Set();
  let helpers = false;
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];
  const NAME = String.raw`("(?:[^"]|"")+"|[a-z_][a-z0-9_]*)`;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    if (/create or replace function public\.new_id\(\)/.test(sql)) helpers = true;
    for (const m of sql.matchAll(new RegExp(String.raw`create table if not exists public\.${NAME} \(\n([\s\S]*?)\n\);`, "g"))) {
      const cols = tables.get(unident(m[1])) || new Map();
      for (const line of m[2].split("\n")) {
        const c = line.trim().replace(/,$/, "").match(new RegExp(String.raw`^${NAME} (.+)$`));
        if (c) cols.set(unident(c[1]), c[2]);
      }
      tables.set(unident(m[1]), cols);
    }
    for (const m of sql.matchAll(new RegExp(String.raw`alter table public\.${NAME} add column if not exists ${NAME} ([^;]+);`, "g"))) {
      const cols = tables.get(unident(m[1])) || new Map();
      cols.set(unident(m[2]), m[3].trim());
      tables.set(unident(m[1]), cols);
    }
    for (const m of sql.matchAll(new RegExp(String.raw`alter table public\.${NAME} drop constraint if exists ${NAME};`, "g"))) checks.delete(unident(m[2]));
    for (const m of sql.matchAll(new RegExp(String.raw`alter table public\.${NAME} add constraint ${NAME} check \((.*)\) not valid;`, "g"))) checks.set(unident(m[2]), m[3]);
    for (const m of sql.matchAll(new RegExp(String.raw`create index if not exists ${NAME} on public\.`, "g"))) indexes.add(unident(m[1]));
  }
  return { tables, checks, indexes, helpers };
}

// The SQL that brings Supabase up to the entity schemas. Every statement can
// run twice without harm (the repo's GitHub link may apply a file that was
// already run by hand). Columns are only ever added; a changed type is
// reported in `warnings` for a person to decide.
export function schemaChanges(desired = desiredTables(), applied = appliedSchema()) {
  const out = [];
  const summary = { newTables: [], newColumns: [], checks: [], warnings: [] };
  if (!applied.helpers) {
    out.push(`-- New ids look like Base44's: 24 hex characters.
create or replace function public.new_id() returns text
language sql volatile set search_path = '' as $$ select substr(replace(gen_random_uuid()::text, '-', ''), 1, 24) $$;

-- updated_date follows every change.
create or replace function public.touch_updated_date() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_date := now(); return new; end $$;`);
  }
  const addCheck = (table, name, expr) => out.push(`do $$ begin
  alter table public.${ident(table)} add constraint ${ident(name)} check (${expr}) not valid;
exception when duplicate_object then null; end $$;`);
  for (const t of desired) {
    const have = applied.tables.get(t.table);
    const block = [];
    if (!have) {
      summary.newTables.push(t.entity);
      block.push(`-- ${t.entity}${t.description ? ` -- ${t.description}` : ""}
create table if not exists public.${ident(t.table)} (
${[...t.columns].map(([c, def]) => `  ${ident(c)} ${def}`).join(",\n")}
);
alter table public.${ident(t.table)} enable row level security;
create or replace trigger ${t.table}_touch before update on public.${ident(t.table)} for each row execute function public.touch_updated_date();`);
    } else {
      for (const [c, def] of t.columns) {
        if (!have.has(c)) {
          summary.newColumns.push(`${t.entity}.${c}`);
          block.push(`alter table public.${ident(t.table)} add column if not exists ${ident(c)} ${def.replace(/ primary key| unique/g, "")};`);
        } else if (have.get(c).split(" ")[0] !== def.split(" ")[0]) {
          summary.warnings.push(`${t.entity}.${c} is ${have.get(c).split(" ")[0]} in Supabase but ${def.split(" ")[0]} in the entity schema`);
        }
      }
    }
    // CHECKs: add new ones, replace changed ones (an enum gained a value),
    // drop ours that the schema no longer asks for.
    const ours = new RegExp(`^${t.table}_.+_(allowed|required)$`);
    for (const [name, expr] of t.checks) {
      const old = applied.checks.get(name);
      if (old === expr) continue;
      summary.checks.push(`${old === undefined ? "add" : "update"} ${name}`);
      if (old !== undefined) block.push(`alter table public.${ident(t.table)} drop constraint if exists ${ident(name)};`);
      block.push(`alter table public.${ident(t.table)} add constraint ${ident(name)} check (${expr}) not valid;`);
    }
    if (have) {
      for (const name of applied.checks.keys()) {
        if (ours.test(name) && !t.checks.has(name)) {
          summary.checks.push(`drop ${name}`);
          block.push(`alter table public.${ident(t.table)} drop constraint if exists ${ident(name)};`);
        }
      }
    }
    for (const [name, cols] of t.indexes) {
      if (!applied.indexes.has(name)) block.push(`create index if not exists ${ident(name)} on public.${ident(t.table)} (${cols});`);
    }
    if (block.length) out.push(block.join("\n"));
  }
  // A plain "add constraint" fails if the file runs twice; wrap them.
  const sql = out.join("\n\n").replace(/alter table public\.(\S+) add constraint (\S+) check \((.*)\) not valid;/g, (_, table, name, expr) =>
    `do $$ begin\n  alter table public.${table} add constraint ${name} check (${expr}) not valid;\nexception when duplicate_object then null; end $$;`);
  void addCheck;
  return { sql, summary, empty: !summary.newTables.length && !summary.newColumns.length && !summary.checks.length && !out.some((b) => /create index/.test(b)) };
}

// Entity -> table maps for the app and the server functions.
export function writeTableMaps(desired = desiredTables()) {
  const map = Object.fromEntries(desired.map((t) => [t.entity, t.table]));
  fs.writeFileSync(path.join(root, "supabase/entity-tables.json"), JSON.stringify(map, null, 2) + "\n");
  const body = Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([e, t]) => `  ${e}: "${t}",`).join("\n");
  fs.writeFileSync(path.join(root, "base44/shared/supabaseTables.ts"), `// Base44 entity -> Supabase table, for the move to Supabase.\n// Generated by tools/supabase/gen-schema.mjs from base44/entities.\nexport const SUPABASE_TABLES: Record<string, string> = {\n${body}\n};\n`);
  return map;
}
