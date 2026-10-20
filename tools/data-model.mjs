#!/usr/bin/env node
// Writes docs/DATA-MODEL.md: a plain map of the app's data for anyone (or any
// AI) working on the app. Every table, its fields, how records link to each
// other, and who can see what.
//
// It is built from the code itself, so it can't drift:
//   base44/entities/*.jsonc                 the records and their fields
//   supabase/entity-tables.json             each record's Supabase table
//   base44/functions/entityAccess/entry.ts  who may read or change what
//
//   node tools/data-model.mjs           write docs/DATA-MODEL.md
//   node tools/data-model.mjs --check   fail if docs/DATA-MODEL.md is out of date
//
// A test (src/lib/__tests__/dataModelDoc.test.js) runs the check, so a
// changed entity or access rule without a fresh map fails the tests.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { root, entityDir, tableOf } from "./supabase/schema-lib.mjs";

export const OUT = path.join(root, "docs/DATA-MODEL.md");
const ACCESS_FILE = path.join(root, "base44/functions/entityAccess/entry.ts");
const TABLES_FILE = path.join(root, "supabase/entity-tables.json");

const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, "");
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
const cell = (s) => oneLine(s).replace(/\|/g, "\\|");
const code = (s) => `\`${s}\``;

// Fields every record has (Base44's own), whatever its schema lists.
const BUILTIN = [
  ["id", "text", "The record's id: 24 characters, text (not a number)."],
  ["created_date", "timestamptz", "When the record was made."],
  ["updated_date", "timestamptz", "When it last changed."],
  ["created_by", "text", "Email of whoever made it, when made from the app."],
  ["created_by_id", "text", "User id of whoever made it."],
  ["is_sample", "boolean", "Base44 sample data."],
];
// Base44's built-in sign-in fields on User (its schema lists only the app's own).
const USER_BUILTIN = [
  ["email", "text", "Sign-in email."],
  ["full_name", "text", ""],
  ["role", "text", "admin, company, mechanic, driver, staff or passenger."],
  ["disabled", "boolean", ""],
  ["disabled_reason", "text", ""],
  ["is_verified", "boolean", "Email confirmed."],
  ["auth_user_id", "uuid", "Supabase only: the linked sign-in account (auth.users)."],
];
const META = new Set(["id", "created_date", "updated_date", "created_by", "created_by_id"]);

// *_id fields that don't simply name their table (vehicle_id → Vehicle does).
const LINKS = {
  device_id: "KioskDevice",
  template_id: "InspectionTemplate",
  shift_id: "DriverShift",
  role_id: "AccessRole",
  access_role_id: "AccessRole",
  card_id: "NfcCard",
  member_user_id: "User",
  reporter_id: "User",
  sender_id: "User",
  inspector_id: "User",
  assigned_mechanic_id: "User",
  pickup_route_id: "Route",
  swap_with_driver_id: "Driver",
};
// *_id fields that are not links to another table.
const NOT_LINKS = {
  holder_id: "Id of the card holder; holder_source says which table (Driver, User, Contact or CardHolder).",
  record_id: "Id of the changed record; `entity` says which table.",
  near_stop_id: "Name of the route stop the bus is at (a stop inside Route.stops), not a table id.",
  employee_id: "The company's own staff number.",
  nfc_tag_id: "Card number.",
  client_request_id: "Sent by the device so a retried save isn't made twice.",
  request_actor_id: "Who sent a retried save (with client_request_id).",
  end_request_id: "Makes a retried \"end shift\" safe.",
  pickup_signature_request_id: "Makes a retried signature safe.",
  dropoff_signature_request_id: "Makes a retried signature safe.",
};

function typeOf(d) {
  const t = Array.isArray(d.type) ? d.type.find((x) => x !== "null") : d.type;
  if (t === "string") return d.format === "date-time" ? "timestamptz" : d.format === "date" ? "date" : "text";
  if (t === "number") return "double precision";
  if (t === "integer") return "bigint";
  if (t === "boolean") return "boolean";
  if (t === "array") return "jsonb (list)";
  return "jsonb";
}

export function readEntities(dir = entityDir, tablesFile = TABLES_FILE) {
  const tables = fs.existsSync(tablesFile) ? JSON.parse(fs.readFileSync(tablesFile, "utf8")) : {};
  return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonc")).sort().map((file) => {
    const schema = JSON.parse(stripComments(fs.readFileSync(path.join(dir, file), "utf8")));
    const entity = schema.name || path.basename(file, ".jsonc");
    return {
      entity,
      table: tables[entity] || tableOf(entity),
      description: oneLine(schema.description),
      properties: schema.properties || {},
      required: new Set(schema.required || []),
    };
  });
}

// ---- Access rules, read from entityAccess -------------------------------

// A list literal: 'a', "b", ...SOME_LIST. Anything else is an error, so a
// rewrite of entityAccess makes this script say so instead of guessing.
function parseList(text, known, what) {
  const out = [];
  for (const part of text.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const quoted = t.match(/^(['"])([^'"]+)\1$/);
    const spread = t.match(/^\.\.\.([A-Za-z_]+)$/);
    if (quoted) out.push(quoted[2]);
    else if (spread && known[spread[1]]) out.push(...known[spread[1]]);
    else throw new Error(`data-model: can't read ${what} in entityAccess (${t})`);
  }
  return out;
}

export function readAccessRules(file = ACCESS_FILE) {
  const src = fs.readFileSync(file, "utf8");
  const known = { META: [...META] };
  const need = (re, what) => {
    const m = src.match(re);
    if (!m) throw new Error(`data-model: ${what} not found in entityAccess`);
    return m;
  };
  for (const name of ["JOB_SIGNATURE_FIELDS"]) {
    known[name] = parseList(need(new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`), name)[1], known, name);
  }
  const sets = {};
  for (const name of ["MAINTENANCE", "CREDENTIALS", "COMPANY_ENTITIES", "PASSENGER_READ", "COMPANY_READ", "PROFILE_FIELDS"]) {
    const list = parseList(need(new RegExp(`const ${name}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]\\)`), name)[1], known, name);
    known[name] = list;
    sets[name] = new Set(list);
  }
  // Per-entity field sets: { Driver:new Set([...]), Trip:new Set([...]) }.
  const fieldSets = (name) => {
    const body = need(new RegExp(`const ${name}\\s*=\\s*\\{(.*)\\};`), name)[1];
    const out = {};
    for (const m of body.matchAll(/([A-Za-z]+)\s*:\s*new Set\(\[([^\]]*)\]\)/g)) out[m[1]] = new Set(parseList(m[2], known, name));
    return out;
  };
  const adminOnly = fieldSets("ADMIN_ONLY_FIELDS");
  const serverOnly = fieldSets("SERVER_ONLY_FIELDS");
  const securityFields = fieldSets("SECURITY_FIELDS");

  // The fields entityAccess hands to the browser, per entity.
  const fields = {};
  for (const [entity, list] of Object.entries(JSON.parse(need(/const ENTITY_FIELDS = (\{.*\});\n/, "ENTITY_FIELDS")[1]))) fields[entity] = [...list];
  for (const m of src.matchAll(/for\s*\(\s*const name of \[([^\]]*)\]\)\s*ENTITY_FIELDS\[name\]\.push\(([^)]*)\)/g)) {
    for (const entity of parseList(m[1], known, "ENTITY_FIELDS")) fields[entity].push(...parseList(m[2], known, "ENTITY_FIELDS"));
  }
  for (const m of src.matchAll(/ENTITY_FIELDS\.([A-Za-z]+)\.push\(([^)]*)\)/g)) fields[m[1]].push(...parseList(m[2], known, "ENTITY_FIELDS"));
  for (const m of src.matchAll(/ENTITY_FIELDS\.([A-Za-z]+)\s*=\s*\[([^\]]*)\]/g)) fields[m[1]] = parseList(m[2], known, "ENTITY_FIELDS");

  // Shorter field lists some people get (project() in entityAccess):
  // if (!['admin','company'].includes(role) && name === 'Trip') fields=[...META,...]
  const narrowed = {};
  const project = need(/function project\(ctx,name,row\) \{([\s\S]*?)\n\}/, "project()")[1];
  for (const line of project.split("\n")) {
    const list = line.match(/fields=\[([^\]]*)\]/);
    const entity = line.match(/name === ['"]([A-Za-z]+)['"]/);
    if (!list || !entity) continue;
    const except = line.match(/!\[([^\]]*)\]\.includes\(role\)/);
    narrowed[entity[1]] = {
      fields: parseList(list[1], known, `project() ${entity[1]}`).filter((f) => !META.has(f)),
      except: except ? parseList(except[1], known, "project() roles") : null,
    };
  }
  return { sets, fields, adminOnly, serverOnly, securityFields, narrowed };
}

// ---- Who can see each kind of record (visible() in entityAccess) --------

function readers(entity, rules) {
  const { sets, fields } = rules;
  if (!fields[entity]) {
    return { app: "server only", out: "—", passenger: "—", company: "—", mechanic: "—", admin: "through other functions" };
  }
  const r = { app: "entityAccess", out: "—", passenger: "—", company: "—", mechanic: "—", admin: "all" };
  if (entity === "Advertisement") return { ...r, out: "all", passenger: "all", company: "all", mechanic: "all" };
  if (entity === "User") return { ...r, passenger: "own profile", company: "own profile", mechanic: "own profile" };
  if (entity === "PushToken") return { ...r, passenger: "own", company: "own", mechanic: "own" };
  if (entity === "LostItemReport") r.passenger = "own reports";
  if (sets.MAINTENANCE.has(entity) || entity === "Company") r.mechanic = "all companies";
  if (entity === "GroupMessage") r.mechanic = "mechanic chat";
  if (entity === "Broadcast") r.mechanic = "notices to every company";
  if (sets.COMPANY_READ.has(entity)) r.company = "own company";
  if (sets.PASSENGER_READ.has(entity)) {
    r.passenger = entity === "GroupMessage" ? "own company, staff chat"
      : entity === "Broadcast" ? "own company + notices to every company (pickup changes: own bus only)"
      : "own company";
  }
  if (entity === "Broadcast") r.company = "own company + notices to every company";
  const narrow = rules.narrowed[entity];
  if (narrow?.except) {
    for (const role of ["passenger", "company", "mechanic"]) {
      if (!narrow.except.includes(role) && r[role] !== "—") r[role] += ", fewer fields";
    }
  }
  return r;
}

// ---- The document -------------------------------------------------------

function linkTarget(field, names) {
  if (NOT_LINKS[field]) return null;
  if (LINKS[field]) return LINKS[field];
  const stem = field.replace(/_id$/, "");
  const pascal = stem.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  return names.has(pascal) ? pascal : null;
}

export function renderDataModel({ entities = readEntities(), rules = readAccessRules() } = {}) {
  const names = new Set(entities.map((e) => e.entity));
  const linksFrom = new Map(entities.map((e) => [e.entity, []]));
  const linksTo = new Map();
  for (const e of entities) {
    const to = [];
    for (const field of Object.keys(e.properties)) {
      if (!/_id$/.test(field)) continue;
      const target = linkTarget(field, names);
      if (!target) continue;
      to.push([field, target]);
      linksFrom.get(target).push([e.entity, field]);
    }
    linksTo.set(e.entity, to);
  }

  const out = [];
  const w = (s = "") => out.push(s);
  w("# McSween Transport: database map");
  w();
  w("<!-- Generated by `node tools/data-model.mjs`. Don't edit by hand: change the entity");
  w("     files or entityAccess, then run it again. A test fails while this file is out of date. -->");
  w();
  w("Every kind of record the app keeps, its fields, how records point at each other,");
  w("and who can see them. Built from `base44/entities/*.jsonc`,");
  w("`supabase/entity-tables.json` and `base44/functions/entityAccess/entry.ts`.");
  w();
  w("## How the data is kept");
  w();
  w("- Each kind of record (an **entity**, like `Trip`) is a table. Base44 holds the live data today;");
  w("  the Supabase copy has one table per entity in the `public` schema, with the same field names");
  w("  (table names are snake_case: `Trip` is `trip`, `User` is `app_user`).");
  w("- Ids are text (Base44's 24-character ids), not numbers. A field ending in `_id` usually holds");
  w("  another record's id; the **Links** lines below say which.");
  w("- Every record also has these fields, left out of the tables below:");
  for (const [f, type, note] of BUILTIN) w(`  ${code(f)} (${type}): ${note}`.trimEnd());
  w("- Names are often copied next to ids (`vehicle_name` beside `vehicle_id`) so lists show without");
  w("  extra reads. The id is the truth; the copied name can be out of date.");
  w("- No foreign keys yet: older Base44 data can point at records that were deleted.");
  w("- **The browser never reads a table.** The app asks the server function `entityAccess`");
  w("  (browser side: `src/lib/scopedEntities.js`) or a purpose-built function (`driverPhone`,");
  w("  `kioskCheckIn`, `accessRoles`, ...). On Supabase every table has row level security on and");
  w("  no policies, so only the server can touch the data.");
  w("- Secrets are never sent to the browser: entityAccess removes these fields from every answer,");
  w("  wherever they appear: " + [...rules.sets.CREDENTIALS].map(code).join(", ") + ".");
  w("- Passengers never see other passengers' pickup locations: a passenger's own `User` record is");
  w("  the only one they can read, and the `Trip` fields they get leave out names, phones and pickup points.");
  w();
  w("## Who can see what");
  w();
  w("Roles (`User.role`): **admin**, **company** (a company's manager), **mechanic**, and phone users");
  w("(**staff**, **passenger**, **driver**). Drivers on a bus tablet have no sign-in: the tablet's own");
  w("functions act for them. A person can also have a custom role (`User.access_role_id`, see");
  w("`AccessRole` and `RoleAssignment`); they work through the role workspace (`accessRoles` function),");
  w("and through entityAccess can only read their own profile.");
  w();
  w("\"Own company\" means a company the person is an approved member of (`CompanyMembership`). A record");
  w("belongs to a company through its bus (`vehicle_id`), else its driver (`driver_id`), else its");
  w("`company_id`. Mechanics are not tied to one company.");
  w();
  w("Changing records through entityAccess:");
  w();
  w("- **admin**: any record (except invoices, made only in billing, and app errors, which can only be marked fixed).");
  w("- **company**: records of the kinds it can read, for its own company; it can't make a new `Company`.");
  w("- **mechanic**: maintenance records (" + [...rules.sets.MAINTENANCE].map(code).join(", ") + ") and the mechanic chat;");
  w("  on `Vehicle` only odometer, hours, status and inspection fields. Deleting maintenance records is admin-only.");
  w("- **staff / passenger**: their own profile fields, their own staff-chat messages and lost-item reports.");
  w();
  w("| Entity | Table | From the app | Signed out | Staff / passenger | Company manager | Mechanic | Admin |");
  w("|---|---|---|---|---|---|---|---|");
  for (const e of entities) {
    const r = readers(e.entity, rules);
    w(`| [${e.entity}](#${e.entity.toLowerCase()}) | ${code(e.table)} | ${r.app} | ${r.out} | ${r.passenger} | ${r.company} | ${r.mechanic} | ${r.admin} |`);
  }
  w();
  w("\"Server only\": no screen reads these through entityAccess; only server functions use them");
  w("(sign-in codes, device keys, memberships, verification and support records).");
  w("\"Fewer fields\": see the entity below for the fields those people get.");
  w();
  w("## Records");
  for (const e of entities) {
    const r = rules;
    // What entityAccess ever hands to the browser for this kind of record.
    const only = r.narrowed[e.entity] && !r.narrowed[e.entity].except ? r.narrowed[e.entity].fields : null;
    const browserFields = !r.fields[e.entity] ? null : new Set([...META, ...(only || r.fields[e.entity])]);
    w();
    w(`### ${e.entity}`);
    w();
    const facts = [`Table ${code(e.table)}`];
    if (r.sets.COMPANY_ENTITIES.has(e.entity)) {
      const via = ["vehicle_id", "driver_id", "company_id"].filter((f) => f in e.properties);
      facts.push(`belongs to a company through ${via.map(code).join(", then ")}`);
    }
    facts.push(browserFields ? "read and changed through entityAccess" : "server functions only");
    w(facts.join(" · ") + ".");
    if (e.description) { w(); w(e.description); }
    const to = linksTo.get(e.entity);
    if (to.length) { w(); w("**Links to:** " + to.map(([f, t]) => `[${t}](#${t.toLowerCase()}) (${code(f)})`).join(", ") + "."); }
    const from = linksFrom.get(e.entity);
    if (from.length) { w(); w("**Linked from:** " + from.map(([s, f]) => `[${s}](#${s.toLowerCase()}).${f}`).join(", ") + "."); }
    const narrow = r.narrowed[e.entity];
    if (narrow) {
      w();
      w(narrow.except
        ? `**Everyone except ${narrow.except.join(", ")} gets only:** ${narrow.fields.map(code).join(", ")}.`
        : `**The app only ever gets:** ${narrow.fields.map(code).join(", ")}.`);
    }
    w();
    w("| Field | Type | Notes |");
    w("|---|---|---|");
    // The fields every record has are listed once, at the top.
    const rows = [];
    if (e.entity === "User") for (const [f, type, note] of USER_BUILTIN) rows.push([f, type, note, null]);
    for (const [f, d] of Object.entries(e.properties)) {
      if (rows.some(([x]) => x === f) || BUILTIN.some(([x]) => x === f)) continue;
      rows.push([f, typeOf(d), d.description || "", d]);
    }
    for (const [f, type, note, d] of rows) {
      const notes = [];
      const target = /_id$/.test(f) ? linkTarget(f, names) : null;
      if (target) notes.push(`→ ${target}`);
      if (NOT_LINKS[f]) notes.push(NOT_LINKS[f]);
      if (note) notes.push(note);
      if (d && Array.isArray(d.enum) && d.enum.length) notes.push("One of: " + d.enum.map((v) => code(v)).join(", ") + ".");
      if (d && "default" in d && d.default !== null && d.default !== "") notes.push(`Default ${code(JSON.stringify(d.default))}.`);
      if (e.required.has(f)) notes.push("Required.");
      if (r.sets.CREDENTIALS.has(f)) notes.push("**Secret**: never sent to the browser.");
      else if (browserFields && !browserFields.has(f)) notes.push("Not sent to the browser.");
      if (r.serverOnly[e.entity]?.has(f)) notes.push("Set by the server only.");
      if (r.adminOnly[e.entity]?.has(f)) notes.push("Only an admin can change it.");
      if (r.securityFields[e.entity]?.has(f)) notes.push("Changed only through access-code management.");
      w(`| ${code(f)} | ${type} | ${cell(notes.join(" "))} |`);
    }
  }
  w();
  w("## Other storage (Supabase only)");
  w();
  w("Not app records; the server's own bookkeeping. None of it is reachable from the browser.");
  w();
  w("- `public.storage_file_copy`: which Base44 file was copied to which Supabase storage file (one copy per storage area).");
  w("- `tt_atomic.attempt_reservation`, `tt_atomic.budget_policy`, `tt_atomic.operation_receipt`: rate limits, and");
  w("  receipts so a retried save is only done once.");
  w("- `tablet_support.sessions`, `tablet_support.events`: remote-support sessions with the bus tablets and their audit trail.");
  w("- `tt_ops`: scheduled jobs (pg_cron). `prune_location_pings` keeps 90 days of `LocationPing`; `run_scheduled_function`");
  w("  starts the scheduled server functions.");
  w("- `private.link_app_user`: links a Supabase sign-in (`auth.users`) to its `app_user` once the email is confirmed.");
  w("- Storage areas (buckets): `public` (logos, bus and profile photos, ads: anyone with the link),");
  w("  `private` (check-in pictures, signatures, chat, incident and inspection photos, driver documents:");
  w("  short-lived signed links only), `downloads` (tablet app updates).");
  w();
  return out.join("\n");
}

export function checkDataModel(file = OUT) {
  const want = renderDataModel();
  const have = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  return { upToDate: have === want, want };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  if (process.argv.includes("--check")) {
    const { upToDate } = checkDataModel();
    if (!upToDate) {
      console.error("docs/DATA-MODEL.md is out of date: run node tools/data-model.mjs");
      process.exit(1);
    }
    console.log("docs/DATA-MODEL.md is up to date.");
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, renderDataModel());
    console.log(`Wrote ${path.relative(root, OUT)}`);
  }
}
