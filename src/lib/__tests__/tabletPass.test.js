import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { load, mock, request } from "../../../security-tests/helpers.js";
import { passNote, passSummary } from "@/lib/tabletPass";

// Tablet passes last 90 days and are renewed only with a new pairing code
// (by design). Admin → Kiosk tablets shows how each paired tablet's pass
// stands, 30 days ahead, and which tablets were cut off by a move.

const sha = (v) => createHash("sha256").update(v).digest("hex");
const NOW = Date.parse("2026-11-08T12:00:00Z");
const inDays = (n) => new Date(Date.now() + n * 86400_000).toISOString();

function admin() {
  const sdk = mock("admin");
  sdk.tables.User[0].role = "admin";
  sdk.tables.Vehicle.push({ id: "bus-a2", company_id: "a", name: "Bus A2" });
  const tablet = (id, extra = {}) => ({ id, created_date: "2026-10-26T00:00:00Z", status: "active", paired: true, kiosk_type: "driver", company_id: "a", vehicle_id: "bus-a", pairing_code: "", label: id, ...extra });
  sdk.tables.KioskDevice = [
    tablet("fine"), tablet("soon"), tablet("expired"), tablet("moved", { vehicle_id: "bus-a2" }), tablet("old"),
    tablet("waiting", { paired: false, pairing_code: "ABCDEFGH2345" }),
  ];
  const cred = (device_id, expires_at, extra = {}) => ({ id: "c-" + device_id, device_id, token_hash: sha("t" + device_id), company_id: "a", vehicle_id: "bus-a", kiosk_type: "driver", pairing_code_hash: sha(""), issued_at: new Date().toISOString(), expires_at, ...extra });
  sdk.tables.DeviceCredential = [cred("fine", inDays(80)), cred("soon", inDays(12)), cred("expired", inDays(-1)), cred("moved", inDays(60))];
  const api = load("entityAccess", sdk);
  const call = async (body) => { const res = await api.default(request(body)); return { status: res.status, body: await res.json() }; };
  return { sdk, call };
}

describe("tablet pass status in Admin", () => {
  it("says how each paired tablet's pass stands, without the pass itself", async () => {
    const { call } = admin();
    const res = await call({ entity: "KioskDevice", operation: "list" });
    expect(res.status).toBe(200);
    const by = Object.fromEntries(res.body.result.map((d) => [d.id, d.pass]));
    expect(by.fine.state).toBe("ok");
    expect(by.soon.state).toBe("expiring");
    expect(by.expired.state).toBe("expired");
    expect(by.moved.state).toBe("moved");
    expect(by.old).toEqual({ state: "none" });
    expect(by.waiting).toBeNull();
    expect(Date.parse(by.soon.expires_at)).toBeGreaterThan(Date.now());
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("token_hash");
    expect(text).not.toContain(createHash("sha256").update("tfine").digest("hex"));
  });

  it("is in the admin's first load too, and never reaches a company manager", async () => {
    const { sdk, call } = admin();
    const boot = await call({ entity: "AdminBootstrap", operation: "list", datasets: ["kiosks"] });
    expect(boot.body.result.datasets.kiosks.find((d) => d.id === "moved").pass.state).toBe("moved");
    sdk.tables.User[0].role = "company";
    const company = await call({ entity: "KioskDevice", operation: "list" });
    for (const d of company.body.result || []) expect(d.pass).toBeUndefined();
  });

  it("says nothing, rather than raising an alarm, when the passes can't be read", async () => {
    const { sdk, call } = admin();
    const real = sdk.asServiceRole.entities;
    sdk.asServiceRole.entities = new Proxy({}, { get: (_, name) => (name === "DeviceCredential" ? { filter: async () => { throw new Error("busy"); } } : real[name]) });
    const res = await call({ entity: "KioskDevice", operation: "list" });
    expect(res.status).toBe(200);
    expect(res.body.result.every((d) => d.pass == null)).toBe(true);
  });
});

describe("what Admin shows for a pass", () => {
  const at = (days) => new Date(NOW + days * 86400_000).toISOString();
  it("tells the office what to do", () => {
    expect(passNote({ state: "moved" }, NOW)).toMatchObject({ tone: "danger", needsCode: true, label: "Needs a new pairing code" });
    expect(passNote({ state: "expired", expires_at: at(-2) }, NOW)).toMatchObject({ tone: "danger", needsCode: true, label: "Pass expired" });
    expect(passNote({ state: "expiring", expires_at: at(12) }, NOW)).toMatchObject({ tone: "warning", soon: true, label: "Pass ends 20 Nov 2026" });
    expect(passNote({ state: "expiring", expires_at: at(12) }, NOW).text).toMatch(/^In 12 days\./);
    expect(passNote({ state: "ok", expires_at: at(79) }, NOW)).toEqual({ tone: "neutral", label: null, text: "Pass until 26 Jan 2027" });
    expect(passNote({ state: "none" }, NOW).label).toBe("Old pairing");
    expect(passNote(null, NOW)).toBeNull();
  });

  it("counts tablets that need a code now and soon", () => {
    expect(passSummary([
      { pass: { state: "moved" } }, { pass: { state: "expired", expires_at: at(-1) } },
      { pass: { state: "expiring", expires_at: at(3) } }, { pass: { state: "ok", expires_at: at(60) } }, { pass: null },
    ], NOW)).toEqual({ needCode: 2, soon: 1 });
  });
});
