import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";

// Step 6: the Base44 functions run on Supabase Edge Functions through
// supabase/functions/_shared/base44-compat.ts. These tests pin down how it
// turns Base44 calls into Supabase requests.

const root = new URL("../../../", import.meta.url);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compat-"));
const toMjs = (file) => ts.transpileModule(fs.readFileSync(new URL(file, root), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from '\.\/([A-Za-z0-9]+)\.ts'/g, "from './$1.mjs'");
fs.writeFileSync(path.join(dir, "supabaseTables.mjs"), toMjs("supabase/functions/_shared/supabaseTables.ts"));
fs.writeFileSync(path.join(dir, "compat.mjs"), toMjs("supabase/functions/_shared/base44-compat.ts"));
const compat = await import(path.join(dir, "compat.mjs"));

const URL_ = "https://proj.supabase.co";
const KEY = "sb_secret_synthetic-test-key-never-real";
const COLUMNS = {
  fault: { id: "text", created_date: "timestamp with time zone", updated_date: "timestamp with time zone", status: "text", company_id: "text", resolved: "boolean", photo_uris: "jsonb", cost: "double precision", consumed_at: "timestamp with time zone" },
  app_user: { id: "text", created_date: "timestamp with time zone", email: "text", role: "text", full_name: "text", auth_user_id: "text", disabled: "boolean", phone: "text" },
};

function fake({ rows = () => [], env = {} } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u, method: init.method || "GET", headers: init.headers || {}, body: init.body });
    if (u.pathname === "/rest/v1/") {
      return Response.json({ definitions: Object.fromEntries(Object.entries(COLUMNS).map(([t, c]) => [t, { properties: Object.fromEntries(Object.entries(c).map(([k, f]) => [k, { format: f }])) }])) });
    }
    if (u.pathname === "/auth/v1/user") {
      const token = (init.headers?.Authorization || "").replace("Bearer ", "");
      if (token === "good" || token === "off") return Response.json({ id: "auth-" + token });
      return Response.json({ msg: "bad jwt" }, { status: 401 });
    }
    if (u.pathname.startsWith("/rest/v1/")) {
      const out = rows(u, init);
      if (out instanceof Response) return out;
      return new Response(JSON.stringify(out), { status: 200 });
    }
    return new Response("no", { status: 404 });
  };
  compat.__setRuntimeForTests({ fetch, env: { get: (n) => ({ SUPABASE_URL: URL_, SUPABASE_SECRET_KEYS: JSON.stringify({ default: KEY }), ...env })[n] } });
  return { calls, client: (headers = {}) => compat.createClientFromRequest(new Request("https://x/f", { method: "POST", headers })) };
}
const tableCalls = (calls) => calls.filter((c) => c.url.pathname.startsWith("/rest/v1/") && c.url.pathname !== "/rest/v1/");

describe("Base44 calls on Supabase", () => {
  beforeEach(() => fake());

  it("turns a filter into one PostgREST query with the same sort, limit and skip", async () => {
    const { calls, client } = fake();
    await client().asServiceRole.entities.Fault.filter({ company_id: "a", status: { $in: ["open", "waiting"] } }, "-updated_date", 5, 10);
    const [c] = tableCalls(calls);
    expect(c.url.pathname).toBe("/rest/v1/fault");
    expect(c.url.searchParams.get("and")).toBe('(company_id.eq."a",status.in.("open","waiting"))');
    expect(c.url.searchParams.get("order")).toBe("updated_date.desc.nullslast,id.asc");
    expect(c.url.searchParams.get("limit")).toBe("5");
    expect(c.url.searchParams.get("offset")).toBe("10");
    // The new secret key goes only in apikey.
    expect(c.headers.apikey).toBe(KEY);
    expect(c.headers.Authorization).toBeUndefined();
  });

  it("keeps Mongo meanings: $ne and $nin also match empty fields, a date is never ''", async () => {
    const { calls, client } = fake();
    const db = client().asServiceRole.entities;
    await db.Fault.filter({ status: { $ne: "resolved" } });
    await db.Fault.filter({ status: { $nin: ["a", "b"] } });
    await db.Fault.filter({ $or: [{ consumed_at: { $exists: false } }, { consumed_at: "" }, { consumed_at: null }] });
    await db.Fault.filter({ resolved: false, cost: { $gte: 10, $lt: 20 } });
    await db.Fault.filter({ status: { $regex: "^Open$", $options: "i" } });
    const q = tableCalls(calls).map((c) => c.url.searchParams.get("and"));
    expect(q[0]).toBe('(or(status.not.eq."resolved",status.is.null))');
    expect(q[1]).toBe('(or(status.not.in.("a","b"),status.is.null))');
    expect(q[2]).toBe("(or(and(consumed_at.is.null),and(id.is.null),and(consumed_at.is.null)))");
    expect(q[3]).toBe('(resolved.is.false,cost.gte."10",cost.lt."20")');
    expect(q[4]).toBe('(status.imatch."^Open$")');
  });

  it("matches one value inside a list field, and escapes quotes", async () => {
    const { calls, client } = fake();
    await client().asServiceRole.entities.Fault.filter({ photo_uris: "x.jpg", status: 'say "hi", ok' });
    expect(tableCalls(calls)[0].url.searchParams.get("and")).toBe('(or(photo_uris.cs."[\\"x.jpg\\"]",photo_uris.eq."\\"x.jpg\\""),status.eq."say \\"hi\\", ok")');
  });

  it("a field the table doesn't have is empty everywhere", async () => {
    const { calls, client } = fake();
    const db = client().asServiceRole.entities;
    await db.Fault.filter({ no_such: "x" });
    await db.Fault.filter({ no_such: { $ne: "x" } });
    const q = tableCalls(calls).map((c) => c.url.searchParams.get("and"));
    expect(q).toEqual(["(id.is.null)", "(id.not.is.null)"]);
  });

  it("refuses odd field names instead of passing them to the database", async () => {
    const { client } = fake();
    await expect(client().asServiceRole.entities.Fault.filter({ "status),or(id": "x" })).rejects.toMatchObject({ status: 400 });
    await expect(client().asServiceRole.entities.Fault.filter({ status: { $where: "1" } })).rejects.toMatchObject({ status: 400 });
  });

  it("reads past Supabase's 1000-row page, and lists newest first by default", async () => {
    const { calls, client } = fake({ rows: (u) => Array.from({ length: Math.min(Number(u.searchParams.get("limit")), 2300 - Number(u.searchParams.get("offset"))) }, (_, i) => ({ id: "r" + (Number(u.searchParams.get("offset")) + i) })) });
    const rows = await client().asServiceRole.entities.Fault.list(undefined, 5000);
    expect(rows).toHaveLength(2300);
    const pages = tableCalls(calls).map((c) => [c.url.searchParams.get("offset"), c.url.searchParams.get("limit")]);
    expect(pages).toEqual([["0", "1000"], ["1000", "1000"], ["2000", "1000"]]);
    expect(tableCalls(calls)[0].url.searchParams.get("order")).toBe("created_date.desc.nullslast,id.asc");
  });

  it("filter(query, { limit, fields }) gives one page with items, like the newer SDK", async () => {
    const { calls, client } = fake({ rows: () => [{ id: "a" }, { id: "b" }] });
    const page = await client().asServiceRole.entities.Fault.filter({ status: "open" }, { limit: 1, fields: ["status", "nope"] });
    expect(page).toEqual({ items: [{ id: "a" }], next_cursor: "1" });
    expect(tableCalls(calls)[0].url.searchParams.get("select")).toBe("id,status");
  });

  it("records look like Base44's: no empty fields, UTC times", async () => {
    fake({ rows: () => [{ id: "a", status: null, updated_date: "2026-10-18T17:06:57.696+00:00", photo_uris: ["x"] }] });
    const [row] = await compat.createClientFromRequest(new Request("https://x")).asServiceRole.entities.Fault.list();
    expect(row).toEqual({ id: "a", updated_date: "2026-10-18T17:06:57.696Z", photo_uris: ["x"] });
  });

  it("a missing record is a 404 the functions can recognise", async () => {
    const { client } = fake({ rows: () => [] });
    const err = await client().asServiceRole.entities.Fault.get("nope").catch((e) => e);
    expect(err.status).toBe(404);
    expect(err.response.status).toBe(404);
    await expect(client().asServiceRole.entities.Fault.update("nope", { status: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("writes only real fields, and saves blank dates and Base44-style times correctly", async () => {
    const { calls, client } = fake({ rows: (u, init) => [{ id: "new", ...JSON.parse(init.body || "{}") }] });
    const row = await client().asServiceRole.entities.Fault.create({ status: "open", consumed_at: "", updated_date: "2026-09-01T10:00:00", invented: 1, cost: undefined });
    const body = JSON.parse(tableCalls(calls)[0].body);
    expect(body).toEqual({ status: "open", consumed_at: null, updated_date: "2026-09-01T10:00:00Z" });
    expect(tableCalls(calls)[0].headers.Prefer).toBe("return=representation");
    expect(row).toEqual({ id: "new", status: "open", updated_date: "2026-09-01T10:00:00Z" });
  });

  it("a database error never shows its details to the caller", async () => {
    const { client } = fake({ rows: () => Response.json({ code: "42P01", message: "relation secret_table does not exist" }, { status: 400 }) });
    const err = await client().asServiceRole.entities.Fault.list().catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.message).not.toMatch(/secret_table/);
  });
});

describe("the signed-in person", () => {
  it("nobody signed in, an app key, or a bad session is a 401", async () => {
    const { client } = fake();
    for (const headers of [{}, { Authorization: "Bearer sb_publishable_abc" }, { Authorization: "Bearer bad" }]) {
      const err = await client(headers).auth.me().catch((e) => e);
      expect(err.status).toBe(401);
      expect(err.response.status).toBe(401);
    }
  });

  it("a Supabase session becomes the app_user it is linked to; a disabled person is refused", async () => {
    const { calls, client } = fake({ rows: (u) => u.searchParams.get("auth_user_id") === "eq.auth-good" ? [{ id: "u1", email: "a@b.c", role: "admin", auth_user_id: "auth-good", phone: null }] : [{ id: "u2", disabled: true }] });
    const me = await client({ Authorization: "Bearer good" }).auth.me();
    expect(me).toEqual({ id: "u1", email: "a@b.c", role: "admin", auth_user_id: "auth-good" });
    const authCall = calls.find((c) => c.url.pathname === "/auth/v1/user");
    expect(authCall.headers.Authorization).toBe("Bearer good");
    expect((await client({ Authorization: "Bearer off" }).auth.me().catch((e) => e)).status).toBe(401);
  });
});

describe("secrets, files and serving", () => {
  it("the rate-limit store is this same project unless set otherwise", () => {
    fake();
    expect(compat.secrets.get("TT_ATOMIC_STORE_URL")).toBe(URL_);
    expect(compat.secrets.get("TT_ATOMIC_SERVICE_ROLE_KEY")).toBe(KEY);
    fake({ env: { TT_ATOMIC_STORE_URL: "https://other.supabase.co" } });
    expect(compat.secrets.get("TT_ATOMIC_STORE_URL")).toBe("https://other.supabase.co");
    expect(compat.secrets.get("FIREBASE_SERVICE_ACCOUNT")).toBeUndefined();
  });

  it("signs links only for files in Supabase storage", async () => {
    const calls = [];
    compat.__setRuntimeForTests({
      fetch: async (url, init) => { calls.push(url); return Response.json({ signedURL: "/object/sign/private/a/b.jpg?token=t" }); },
      env: { get: (n) => ({ SUPABASE_URL: URL_, SUPABASE_SECRET_KEYS: JSON.stringify({ default: KEY }) })[n] },
    });
    const core = compat.createClientFromRequest(new Request("https://x")).asServiceRole.integrations.Core;
    expect(await core.CreateFileSignedUrl({ file_uri: "storage://private/a/b.jpg", expires_in: 60 })).toEqual({ signed_url: `${URL_}/storage/v1/object/sign/private/a/b.jpg?token=t` });
    expect(calls[0]).toBe(`${URL_}/storage/v1/object/sign/private/a/b.jpg`);
    await expect(core.CreateFileSignedUrl({ file_uri: "https://evil.example/x" })).rejects.toMatchObject({ status: 404 });
    await expect(core.SendEmail({ to: "a@b.c", subject: "s", body: "b" })).rejects.toMatchObject({ status: 503 });
  });

  it("answers the app's own sites only, and turns errors into tidy replies", async () => {
    fake();
    const ok = compat.withCors(async () => Response.json({ ok: true }));
    const pre = await ok(new Request("https://x/f", { method: "OPTIONS", headers: { Origin: "https://app.mcsweenstransport.com" } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe("https://app.mcsweenstransport.com");
    const other = await ok(new Request("https://x/f", { method: "POST", headers: { Origin: "https://evil.example" } }));
    expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(await other.json()).toEqual({ ok: true });

    const notFound = await compat.withCors(async () => { throw compat.httpError(404, "Trip not found"); })(new Request("https://x/f"));
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: "Trip not found" });
    const crash = await compat.withCors(async () => { throw new Error("db password is hunter2"); })(new Request("https://x/f"));
    expect(crash.status).toBe(500);
    expect(JSON.stringify(await crash.json())).not.toMatch(/hunter2/);
  });
});

describe("supabase/functions", () => {
  it("is in step with base44/functions (run node tools/supabase/build-functions.mjs)", () => {
    expect(() => execFileSync("node", [new URL("tools/supabase/build-functions.mjs", root).pathname, "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
