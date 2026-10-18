import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Admin -> Settings -> Copy data to Supabase: the server copies Base44's
// tables into Supabase with the owner's secret key. Admins only; replies hold
// counts, failed ids and field names, never the rows themselves.

const SECRETS = { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_synthetic-test-key-never-real" };

// A stand-in for Supabase's REST API with two tables.
function fakeSupabase() {
  const tables = { vehicle: [], company: [] };
  const columns = { vehicle: ["id", "created_date", "updated_date", "name", "company_id", "capacity"], company: ["id", "created_date", "updated_date", "name"] };
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ host: u.host, url: u.pathname + u.search, method: init.method || "GET", headers: init.headers || {} });
    if (u.pathname === "/rest/v1/") {
      return new Response(JSON.stringify({ definitions: Object.fromEntries(Object.entries(columns).map(([t, c]) => [t, { properties: Object.fromEntries(c.map((k) => [k, {}])) }])) }), { status: 200 });
    }
    const table = u.pathname.split("/").at(-1);
    if (!tables[table]) return new Response(JSON.stringify({ message: "relation does not exist" }), { status: 404 });
    if ((init.method || "GET") === "GET") return new Response("[]", { status: 200, headers: { "content-range": `0-0/${tables[table].length}` } });
    const rows = JSON.parse(init.body);
    if (rows.some((r) => typeof r.capacity === "string")) return new Response(JSON.stringify({ message: 'invalid input syntax for type double precision: "lots"' }), { status: 400 });
    for (const r of rows) { const i = tables[table].findIndex((x) => x.id === r.id); if (i >= 0) tables[table][i] = r; else tables[table].push(r); }
    return new Response(null, { status: 201 });
  };
  return { tables, calls, fetch };
}

function setup(role = "admin", secrets = SECRETS) {
  const sdk = mock(role);
  sdk.testSecrets = secrets;
  const supa = fakeSupabase();
  sdk.atomicFetch = supa.fetch;
  sdk.tables.Vehicle = [
    { id: "bus-a", created_date: "2026-09-01T10:00:00.123000", updated_date: "2026-09-02T10:00:00", name: "Bus A", company_id: "a", capacity: 30, driver_pin: "1234", old_field: "x" },
    { id: "bus-b", created_date: "2026-09-03T10:00:00", updated_date: "2026-09-03T10:00:00", name: "Bus B", company_id: "b", capacity: "lots" },
  ];
  const api = load("copyToSupabase", sdk);
  const send = async (body) => { const res = await api.default(request(body)); return { status: res.status, body: await res.json() }; };
  return { sdk, supa, send };
}

describe("copy data to Supabase", () => {
  it("is for administrators only", async () => {
    for (const role of ["staff", "company", "mechanic", null]) {
      const { supa, send } = setup(role);
      expect((await send({ action: "copy", entity: "Vehicle" })).status).toBe(403);
      expect(supa.calls).toHaveLength(0);
    }
  });

  it("copies a table with the same ids, times as UTC, only known columns", async () => {
    const { supa, send } = setup();
    const { status, body } = await send({ action: "copy", entity: "Vehicle" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ entity: "Vehicle", read: 2, copied: 1, done: true, next_skip: 2 });
    // The bad row is found and named; the good one still goes in.
    expect(body.failed).toEqual([{ id: "bus-b", error: expect.stringMatching(/double precision/) }]);
    expect(supa.tables.vehicle).toEqual([{ id: "bus-a", created_date: "2026-09-01T10:00:00.123000Z", updated_date: "2026-09-02T10:00:00Z", name: "Bus A", company_id: "a", capacity: 30 }]);
    // Fields with no column are counted, not sent.
    expect(body.dropped_fields).toEqual({ driver_pin: 1, old_field: 1 });
    // Nothing from the rows comes back in the reply.
    expect(JSON.stringify(body)).not.toMatch(/Bus A|1234/);
    // Upserts on id, with the secret key and no Bearer for new-style keys.
    const post = supa.calls.find((c) => c.method === "POST");
    expect(post.url).toMatch(/^\/rest\/v1\/vehicle\?on_conflict=id&columns=/);
    expect(post.headers.apikey).toBe(SECRETS.SUPABASE_SECRET_KEY);
    expect(post.headers.Authorization).toBeUndefined();
  });

  it("copying again updates rows instead of duplicating them", async () => {
    const { sdk, supa, send } = setup();
    await send({ action: "copy", entity: "Vehicle" });
    sdk.tables.Vehicle[0].name = "Bus A renamed";
    await send({ action: "copy", entity: "Vehicle" });
    expect(supa.tables.vehicle).toHaveLength(1);
    expect(supa.tables.vehicle[0].name).toBe("Bus A renamed");
  });

  it("counts what Supabase holds", async () => {
    const { send } = setup();
    await send({ action: "copy", entity: "Vehicle" });
    const { body } = await send({ action: "counts" });
    expect(body.counts.Vehicle).toBe(1);
    expect(body.counts.Company).toBe(0);
    // A table Supabase couldn't count shows as unknown, not zero.
    expect(body.counts.Trip).toBeNull();
  });

  it("says what to set up when the secrets are missing or the public key was used", async () => {
    expect((await setup("admin", {}).send({ action: "copy", entity: "Vehicle" })).body.error).toMatch(/SUPABASE_URL/);
    const publicKey = await setup("admin", { ...SECRETS, SUPABASE_SECRET_KEY: "sb_publishable_abcdefghijklmnopqrstuv" }).send({ action: "copy", entity: "Vehicle" });
    expect(publicKey.status).toBe(503);
    expect(publicKey.body.error).toMatch(/public key/);
    expect((await setup("admin", { ...SECRETS, SUPABASE_URL: "https://evil.example.com" }).send({ action: "counts" })).status).toBe(503);
  });

  it("accepts the project address the way it is usually pasted, and only ever calls supabase.co", async () => {
    const ref = "abcdefghijklmnopqrst";
    for (const pasted of [`https://${ref}.supabase.co`, `https://${ref}.supabase.co/`, `"https://${ref}.supabase.co"`, `${ref}.supabase.co`, `https://${ref}.supabase.co/rest/v1/`, `https://supabase.com/dashboard/project/${ref}/settings/api`, ref]) {
      const { supa, send } = setup("admin", { ...SECRETS, SUPABASE_URL: pasted });
      const { status } = await send({ action: "counts" });
      expect(status, pasted).toBe(200);
      expect([...new Set(supa.calls.map((c) => c.host))], pasted).toEqual([`${ref}.supabase.co`]);
    }
    for (const pasted of ["http://proj.supabase.co", "https://proj.supabase.co.evil.com", "https://evil.com/?x=proj.supabase.co", "https://user:pw@proj.supabase.co", "https://proj.supabase.co:8443", "sb_secret_pasted-in-the-wrong-box"]) {
      const { supa, send } = setup("admin", { ...SECRETS, SUPABASE_URL: pasted });
      const { status, body } = await send({ action: "counts" });
      expect(status, pasted).toBe(503);
      expect(body.error, pasted).toMatch(/should look like/);
      // The pasted value is never shown back.
      expect(body.error).not.toContain(pasted);
      expect(supa.calls, pasted).toHaveLength(0);
    }
  });

  it("refuses tables it doesn't know", async () => {
    const { supa, send } = setup();
    expect((await send({ action: "copy", entity: "constructor" })).status).toBe(400);
    expect((await send({ action: "copy", entity: "__proto__" })).status).toBe(400);
    expect(supa.calls).toHaveLength(0);
  });
});
