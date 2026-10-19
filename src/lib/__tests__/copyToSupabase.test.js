import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Admin -> Settings -> Copy data to Supabase: the server copies Base44's
// tables into Supabase with the owner's secret key. Admins only; replies hold
// counts, failed ids and field names, never the rows themselves.

const SECRETS = { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_synthetic-test-key-never-real" };

// A stand-in for Supabase's REST API with two tables.
function fakeSupabase() {
  const tables = { vehicle: [], company: [], app_user: [], staff_check_in: [], incident: [], storage_file_copy: [] };
  const columns = {
    vehicle: ["id", "created_date", "updated_date", "name", "company_id", "capacity"],
    company: ["id", "created_date", "updated_date", "name", "logo_url"],
    app_user: ["id", "created_date", "updated_date", "email", "role", "full_name", "is_verified", "disabled", "auth_user_id", "photo_url"],
    staff_check_in: ["id", "created_date", "updated_date", "staff_picture_url"],
    incident: ["id", "created_date", "updated_date", "photo_uris"],
  };
  const calls = [];
  // Supabase Storage objects, and the files Base44 (and anyone else) serve.
  const objects = {};
  const web = {};
  // Supabase Auth: accounts by email; the database links them to app_user.
  const accounts = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ host: u.host, url: u.pathname + u.search, method: init.method || "GET", headers: init.headers || {} });
    if (u.host !== "proj.supabase.co") {
      const page = web[u.href];
      if (!page) return new Response("not found", { status: 404 });
      if (page.location) return new Response(null, { status: 302, headers: { location: page.location } });
      return new Response(page.body, { status: 200, headers: { "content-type": page.type || "application/octet-stream" } });
    }
    if (u.pathname.startsWith("/storage/v1/object/") && init.method === "POST") {
      const key = decodeURIComponent(u.pathname.slice("/storage/v1/object/".length));
      objects[key] = { type: init.headers["Content-Type"], bytes: init.body.length };
      return new Response(JSON.stringify({ Key: key }), { status: 200 });
    }
    if (init.method === "PATCH") {
      const id = u.searchParams.get("id").replace(/^eq\./, "");
      const row = (tables[u.pathname.split("/").at(-1)] || []).find((r) => r.id === id);
      if (row) Object.assign(row, JSON.parse(init.body));
      return new Response(null, { status: 204 });
    }
    if ((init.method || "GET") === "GET" && u.pathname === "/rest/v1/storage_file_copy") return new Response(JSON.stringify(tables.storage_file_copy), { status: 200 });
    if (u.pathname === "/auth/v1/admin/users" && init.method === "POST") {
      const body = JSON.parse(init.body);
      if (body.email.startsWith("broken")) return new Response(JSON.stringify({ msg: "Database error creating new user" }), { status: 500 });
      if (accounts.some((a) => a.email === body.email)) return new Response(JSON.stringify({ code: "email_exists", msg: "A user with this email address has already been registered" }), { status: 422 });
      const account = { id: `auth-${accounts.length + 1}`, ...body };
      accounts.push(account);
      if (body.email_confirm) for (const row of tables.app_user) if (String(row.email).toLowerCase() === body.email && !row.auth_user_id) row.auth_user_id = account.id;
      return new Response(JSON.stringify(account), { status: 200 });
    }
    if ((init.method || "GET") === "GET" && u.searchParams.get("auth_user_id") === "not.is.null") {
      const n = (tables[u.pathname.split("/").at(-1)] || []).filter((r) => r.auth_user_id).length;
      return new Response("[]", { status: 200, headers: { "content-range": `0-0/${n}` } });
    }
    if (u.pathname === "/rest/v1/") {
      return new Response(JSON.stringify({ definitions: Object.fromEntries(Object.entries(columns).map(([t, c]) => [t, { properties: Object.fromEntries(c.map((k) => [k, {}])) }])) }), { status: 200 });
    }
    const table = u.pathname.split("/").at(-1);
    if (!tables[table]) return new Response(JSON.stringify({ message: "relation does not exist" }), { status: 404 });
    if ((init.method || "GET") === "GET") return new Response("[]", { status: 200, headers: { "content-range": `0-0/${tables[table].length}` } });
    const rows = JSON.parse(init.body);
    if (rows.some((r) => typeof r.capacity === "string")) return new Response(JSON.stringify({ message: 'invalid input syntax for type double precision: "lots"' }), { status: 400 });
    // Like PostgREST's merge-duplicates: only the columns sent are updated.
    const keys = (u.searchParams.get("on_conflict") || "id").split(",");
    for (const r of rows) { const i = tables[table].findIndex((x) => keys.every((k) => x[k] === r[k])); if (i >= 0) tables[table][i] = { ...tables[table][i], ...r }; else tables[table].push(r); }
    return new Response(null, { status: 201 });
  };
  return { tables, calls, accounts, objects, web, fetch };
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

  it("leaves Base44's own account fields behind without reporting them", async () => {
    const { sdk, supa, send } = setup();
    // The test users stay (the signed-in admin is one of them); one more with
    // Base44's account fields and a stray field joins them.
    const known = new Set(["id", "created_date", "updated_date", "email", "role"]);
    for (const u of sdk.tables.User) for (const k of Object.keys(u)) if (!known.has(k)) delete u[k];
    sdk.tables.User.push({ id: "u-extra", created_date: "2026-09-01T10:00:00", updated_date: "2026-09-01T10:00:00", email: "a@example.com", role: "user", app_id: "x", is_service: false, collaborator_role: "editor", _app_role: "user", force_password_reset: false, leftover_test_field: 1 });
    const { body } = await send({ action: "copy", entity: "User" });
    expect(body).toMatchObject({ read: sdk.tables.User.length, copied: sdk.tables.User.length, failed: [] });
    // Only a field nobody planned for is reported.
    expect(body.dropped_fields).toEqual({ leftover_test_field: 1 });
    expect(Object.keys(supa.tables.app_user.find((u) => u.id === "u-extra")).sort()).toEqual(["created_date", "email", "id", "role", "updated_date"]);
  });

  describe("sign-in accounts (step 4)", () => {
    const people = (sdk) => {
      // The signed-in admin stays one of the people.
      const admin = sdk.tables.User.find((u) => u.role === "admin");
      sdk.tables.User = [
        { id: admin.id, created_date: "2026-09-01T10:00:00", updated_date: "2026-09-01T10:00:00", email: admin.email, full_name: "Boss", role: "admin", is_verified: true },
        { id: "p-staff", created_date: "2026-09-02T10:00:00", updated_date: "2026-09-02T10:00:00", email: "Staff@Example.com", full_name: "Sam", role: "staff", is_verified: true },
        { id: "p-unverified", created_date: "2026-09-03T10:00:00", updated_date: "2026-09-03T10:00:00", email: "new@example.com", role: "user", is_verified: false },
        { id: "p-off", created_date: "2026-09-04T10:00:00", updated_date: "2026-09-04T10:00:00", email: "gone@example.com", role: "user", is_verified: true, disabled: true },
        { id: "p-broken", created_date: "2026-09-05T10:00:00", updated_date: "2026-09-05T10:00:00", email: "broken@example.com", role: "user", is_verified: true },
        { id: "p-noemail", created_date: "2026-09-06T10:00:00", updated_date: "2026-09-06T10:00:00", email: "", role: "user", is_verified: true },
      ];
      return admin;
    };

    it("is for administrators only", async () => {
      for (const role of ["staff", "company", "mechanic", null]) {
        const { supa, send } = setup(role);
        expect((await send({ action: "accounts" })).status).toBe(403);
        expect(supa.accounts).toHaveLength(0);
      }
    });

    it("copies the people first, then sets up confirmed accounts for verified emails only", async () => {
      const { sdk, supa, send } = setup();
      people(sdk);
      const { status, body } = await send({ action: "accounts" });
      expect(status).toBe(200);
      expect(body).toMatchObject({ people: 6, created: 3, existing: 0, unverified: 1, no_email: 1, linked: 3 });
      expect(body.failed).toEqual([{ id: "p-broken", error: "Database error creating new user" }]);
      // Every person is in Supabase with their Base44 id before any account.
      expect(supa.tables.app_user.map((r) => r.id).sort()).toEqual(sdk.tables.User.map((u) => u.id).sort());
      const firstAccount = supa.calls.findIndex((c) => c.url === "/auth/v1/admin/users");
      expect(supa.calls.findIndex((c) => c.url.startsWith("/rest/v1/app_user?on_conflict=id"))).toBeLessThan(firstAccount);
      // Confirmed, lower-case email, name kept, no password, nothing about roles.
      const staff = supa.accounts.find((a) => a.email === "staff@example.com");
      expect(staff).toMatchObject({ email_confirm: true, user_metadata: { full_name: "Sam" } });
      for (const a of supa.accounts) { expect(a.password).toBeUndefined(); expect(a.app_metadata).toBeUndefined(); expect(JSON.stringify(a)).not.toMatch(/admin|staff"/); }
      // Unverified emails get no account; switched-off people are banned.
      expect(supa.accounts.some((a) => a.email === "new@example.com")).toBe(false);
      expect(supa.accounts.find((a) => a.email === "gone@example.com").ban_duration).toBe("876000h");
      // The reply never carries emails.
      expect(JSON.stringify(body)).not.toMatch(/@/);
    });

    it("can be pressed again: existing accounts are counted, not doubled", async () => {
      const { sdk, supa, send } = setup();
      people(sdk);
      await send({ action: "accounts" });
      const { body } = await send({ action: "accounts" });
      expect(body).toMatchObject({ created: 0, existing: 3, linked: 3 });
      expect(supa.accounts).toHaveLength(3);
    });

    it("copying from Base44 never changes who is linked", async () => {
      const { sdk, supa, send } = setup();
      const admin = people(sdk);
      await send({ action: "accounts" });
      const before = supa.tables.app_user.find((r) => r.id === admin.id).auth_user_id;
      // Even a Base44 record carrying the field can't re-point the link.
      sdk.tables.User.find((u) => u.id === admin.id).auth_user_id = "someone-else";
      await send({ action: "copy", entity: "User" });
      expect(supa.tables.app_user.find((r) => r.id === admin.id).auth_user_id).toBe(before);
    });
  });

  describe("files (step 5)", () => {
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
    const LOGO = "https://base44.app/api/apps/app1/files/mp/public/aa11/logo.png";
    const FACE = "https://base44.app/api/apps/app1/files/mp/public/bb22/Jane%20Doe.jpeg";
    const PRIVATE_ID = "private/app1/cc33/incident.jpg";
    const files = () => {
      const s = setup();
      s.sdk.tables.Company = [{ id: "a", created_date: "2026-09-01T10:00:00", updated_date: "2026-09-01T10:00:00", name: "A", logo_url: LOGO }];
      s.sdk.tables.StaffCheckIn = [
        { id: "ci1", created_date: "2026-09-01T10:00:00", updated_date: "2026-09-01T10:00:00", staff_picture_url: FACE },
        { id: "ci2", created_date: "2026-09-02T10:00:00", updated_date: "2026-09-02T10:00:00", staff_picture_url: "data:image/png;base64,AAAA" },
      ];
      s.sdk.tables.Incident = [{ id: "inc1", created_date: "2026-09-01T10:00:00", updated_date: "2026-09-01T10:00:00", photo_uris: [PRIVATE_ID, "https://evil.example/x.jpg", "http://169.254.169.254/latest"] }];
      s.sdk.asServiceRole.integrations.Core.CreateFileSignedUrl = async ({ file_uri }) => ({ signed_url: "https://signed.example/" + file_uri });
      s.supa.web[LOGO] = { body: PNG, type: "image/png" };
      s.supa.web[FACE] = { body: JPEG, type: "application/octet-stream" };
      s.supa.web["https://signed.example/" + PRIVATE_ID] = { body: JPEG, type: "image/jpeg" };
      s.supa.web["https://evil.example/x.jpg"] = { body: JPEG, type: "image/jpeg" };
      return s;
    };
    const copyAll = async (send, entity) => { for (let skip = 0; ;) { const { body } = await send({ action: "copy", entity, skip }); if (body.done) return; skip = body.next_skip; } };

    it("is for administrators only", async () => {
      for (const role of ["staff", "company", "mechanic", null]) {
        const { supa, send } = setup(role);
        expect((await send({ action: "files", entity: "Company" })).status).toBe(403);
        expect(supa.calls).toHaveLength(0);
      }
    });

    it("copies each file into the right area and points the copied rows at it", async () => {
      const { supa, send } = files();
      for (const e of ["Company", "StaffCheckIn", "Incident"]) await copyAll(send, e);
      const company = (await send({ action: "files", entity: "Company" })).body;
      const checkIns = (await send({ action: "files", entity: "StaffCheckIn" })).body;
      const incidents = (await send({ action: "files", entity: "Incident" })).body;
      expect(company).toMatchObject({ files: 1, copied: 1, already: 0, failed: [] });
      expect(checkIns).toMatchObject({ files: 1, copied: 1, failed: [] }); // the inline data: picture stays as it is
      expect(incidents).toMatchObject({ files: 1, copied: 1, failed: [] }); // other sites are not files to copy

      // A logo is public; a boarding-camera face and an incident photo are private.
      const keys = Object.keys(supa.objects).sort();
      expect(keys).toHaveLength(3);
      expect(keys[0]).toMatch(/^private\/incident\/inc1\/photo_uris-[0-9a-f]{16}\.jpg$/);
      expect(keys[1]).toMatch(/^private\/staff_check_in\/ci1\/staff_picture_url-[0-9a-f]{16}\.jpg$/);
      expect(keys[2]).toMatch(/^public\/company\/a\/logo_url-[0-9a-f]{16}\.png$/);
      // Type comes from the file itself; nobody's name ends up in the path.
      expect(supa.objects[keys[1]].type).toBe("image/jpeg");
      expect(keys.join()).not.toMatch(/Jane|Doe/);

      // The Supabase rows now point at the copies.
      expect(supa.tables.company.find((r) => r.id === "a").logo_url).toBe(`https://proj.supabase.co/storage/v1/object/public/${keys[2]}`);
      expect(supa.tables.staff_check_in.find((r) => r.id === "ci1").staff_picture_url).toBe(`storage://${keys[1]}`);
      expect(supa.tables.staff_check_in.find((r) => r.id === "ci2").staff_picture_url).toMatch(/^data:/);
      expect(supa.tables.incident[0].photo_uris).toEqual([`storage://${keys[0]}`, "https://evil.example/x.jpg", "http://169.254.169.254/latest"]);

      // Only Base44's file hosts (and Base44's own signed link) were fetched.
      const fetched = [...new Set(supa.calls.map((c) => c.host))].filter((h) => h !== "proj.supabase.co").sort();
      expect(fetched).toEqual(["base44.app", "signed.example"]);
      // Replies carry counts, never links.
      expect(JSON.stringify([company, checkIns, incidents])).not.toMatch(/https?:|storage:/);
    });

    it("copying the tables again keeps the new links, and running files again skips what's done", async () => {
      const { supa, send } = files();
      await copyAll(send, "Company");
      await send({ action: "files", entity: "Company" });
      const moved = supa.tables.company.find((r) => r.id === "a").logo_url;
      await copyAll(send, "Company");
      expect(supa.tables.company.find((r) => r.id === "a").logo_url).toBe(moved);
      const again = (await send({ action: "files", entity: "Company" })).body;
      expect(again).toMatchObject({ files: 1, copied: 0, already: 1, failed: [] });
      expect(Object.keys(supa.objects)).toHaveLength(1);
    });

    it("a file used in a public field and a private one gets a copy in each area", async () => {
      for (const order of [["User", "StaffCheckIn"], ["StaffCheckIn", "User"]]) {
        const { sdk, supa, send } = files();
        // Jane's profile photo was also used as her check-in picture.
        sdk.tables.User.push({ id: "jane", created_date: "2026-09-01T10:00:00", updated_date: "2026-09-01T10:00:00", email: "jane@example.com", role: "staff", photo_url: FACE });
        for (const e of ["User", "StaffCheckIn"]) await copyAll(send, e);
        for (const e of order) expect((await send({ action: "files", entity: e })).body).toMatchObject({ copied: 1, failed: [] });
        const keys = Object.keys(supa.objects).sort();
        expect(keys).toHaveLength(2);
        expect(keys[0]).toMatch(/^private\/staff_check_in\/ci1\//);
        expect(keys[1]).toMatch(/^public\/app_user\/jane\//);
        expect(supa.tables.staff_check_in.find((r) => r.id === "ci1").staff_picture_url).toBe(`storage://${keys[0]}`);
        expect(supa.tables.app_user.find((r) => r.id === "jane").photo_url).toBe(`https://proj.supabase.co/storage/v1/object/public/${keys[1]}`);
        // Copying the tables again keeps each field on its own area's copy.
        for (const e of ["User", "StaffCheckIn"]) await copyAll(send, e);
        expect(supa.tables.staff_check_in.find((r) => r.id === "ci1").staff_picture_url).toBe(`storage://${keys[0]}`);
        expect(supa.tables.app_user.find((r) => r.id === "jane").photo_url).toBe(`https://proj.supabase.co/storage/v1/object/public/${keys[1]}`);
        expect(supa.tables.storage_file_copy).toHaveLength(2);
      }
    });

    it("refuses anything that isn't really an image, and http redirects", async () => {
      const { supa, send } = files();
      supa.web[LOGO] = { body: "<html><script>alert(1)</script></html>", type: "image/png" };
      supa.web[FACE] = { location: "http://plain.example/face.jpg" };
      await copyAll(send, "Company");
      const company = (await send({ action: "files", entity: "Company" })).body;
      const checkIns = (await send({ action: "files", entity: "StaffCheckIn" })).body;
      expect(company.failed).toEqual([{ entity: "Company", id: "a", column: "logo_url", error: "Not a file type this area takes (unknown)" }]);
      expect(checkIns.failed).toEqual([{ entity: "StaffCheckIn", id: "ci1", column: "staff_picture_url", error: "Refused a redirect that is not https" }]);
      expect(supa.objects).toEqual({});
      expect(supa.tables.company.find((r) => r.id === "a").logo_url).toBe(LOGO);
      expect(supa.calls.some((c) => c.host === "plain.example")).toBe(false);
    });

    it("only takes tables that have files", async () => {
      const { send } = files();
      expect((await send({ action: "files", entity: "Route" })).status).toBe(400);
      expect((await send({ action: "tables" })).body.files).toContain("StaffCheckIn");
    });
  });

  it("refuses tables it doesn't know", async () => {
    const { supa, send } = setup();
    expect((await send({ action: "copy", entity: "constructor" })).status).toBe(400);
    expect((await send({ action: "copy", entity: "__proto__" })).status).toBe(400);
    expect(supa.calls).toHaveLength(0);
  });
});
