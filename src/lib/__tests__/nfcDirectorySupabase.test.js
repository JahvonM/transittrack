import { it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

// Admin → Passenger directory / Card issuing / Plan pickups load the people
// list through nfcCards. On Supabase, empty fields are left out of records
// (Base44 sent them as null), which once made a contact with no company and
// no account crash the whole list ("Server couldn't load admin data").
// This runs the real function through the real Supabase layer.
const root = new URL("../../../", import.meta.url);
const dir = fileURLToPath(new URL("node_modules/.cache/nfc-directory-test/", root));
fs.mkdirSync(dir, { recursive: true });
const toMjs = (file) => ts.transpileModule(fs.readFileSync(new URL(file, root), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from '\.\.?\/(?:_shared\/)?([A-Za-z0-9-]+)\.ts'/g, "from './$1.mjs'");
for (const f of ["supabaseTables", "supabaseFiles", "retry429", "base44-compat"]) fs.writeFileSync(path.join(dir, f + ".mjs"), toMjs(`supabase/functions/_shared/${f}.ts`));
fs.writeFileSync(path.join(dir, "nfcCards.mjs"), toMjs("supabase/functions/nfcCards/entry.ts"));
const compat = await import(pathToFileURL(path.join(dir, "base44-compat.mjs")).href);
const handler = (await import(pathToFileURL(path.join(dir, "nfcCards.mjs")).href)).default;

const COLUMNS = {
  app_user: ["id", "email", "role", "full_name", "auth_user_id", "company_id", "disabled"],
  driver: ["id", "full_name", "email", "company_id", "company_name", "updated_date"],
  contact: ["id", "name", "email", "type", "company_id", "company_name", "vehicle_id", "updated_date"],
  card_holder: ["id", "full_name", "company_id", "updated_date"],
  vehicle: ["id", "name", "company_id", "driver_email", "updated_date"],
  nfc_card: ["id", "holder_source", "holder_id", "company_id", "is_active", "issue_date"],
  kiosk_device: ["id", "kiosk_type", "company_id", "vehicle_id"],
  company: ["id", "name", "updated_date"],
  company_membership: ["id", "user_id", "company_id", "scope", "active", "updated_date"],
  workplace: ["id", "company_id", "name", "lat", "lng", "updated_date"],
  passenger_access_credential: ["id", "user_id", "contact_id", "company_id", "updated_date"],
};
// What the database API sends: empty fields as null.
const TABLES = {
  app_user: [{ id: "admin-1", role: "admin", email: "admin@x.test", auth_user_id: "auth-admin", company_id: null },
    { id: "u-staff", role: "staff", email: "rider@x.test", full_name: "Rider", company_id: null }],
  driver: [{ id: "d1", full_name: "Ann Driver", email: "", company_id: "co-1", company_name: "Co" }],
  contact: [
    // No company and no account with this email: the case that crashed.
    { id: "c-alone", name: "Walk-in", email: null, type: "staff", company_id: null, company_name: "" },
    { id: "c-match", name: "Rider", email: "rider@x.test", type: "staff", company_id: null, company_name: "" },
  ],
  card_holder: [], vehicle: [{ id: "bus-1", name: "Bus 1", company_id: "co-1", driver_email: null }],
  nfc_card: [], kiosk_device: [], company: [{ id: "co-1", name: "Co" }], company_membership: [],
  workplace: [], passenger_access_credential: [],
};

it("loads the people list when a contact has no company and no account", async () => {
  compat.__setRuntimeForTests({
    env: { get: (n) => ({ SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic-test-key-never-real" })[n] },
    fetch: async (url) => {
      const u = new URL(url);
      if (u.pathname === "/rest/v1/") return Response.json({ definitions: Object.fromEntries(Object.entries(COLUMNS).map(([t, cols]) => [t, { properties: Object.fromEntries(cols.map((c) => [c, { format: "text" }])) }])) });
      if (u.pathname === "/auth/v1/user") return Response.json({ id: "auth-admin" });
      const table = u.pathname.replace("/rest/v1/", "");
      if (table === "app_user" && u.searchParams.get("auth_user_id")) return Response.json(TABLES.app_user.slice(0, 1));
      if (Number(u.searchParams.get("offset") || 0) > 0) return Response.json([]);
      return Response.json(TABLES[table] || []);
    },
  });
  const res = await handler(new Request("https://fn.test/nfcCards", { method: "POST", headers: { Authorization: "Bearer user-token" }, body: JSON.stringify({ action: "people" }) }));
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.people.map((p) => p.key)).toEqual(expect.arrayContaining(["contact:c-alone", "contact:c-match", "driver:d1"]));
  expect(body.people.find((p) => p.key === "contact:c-alone")).toMatchObject({ name: "Walk-in", registered: false });
});
