import { describe, it, expect } from "vitest";
import { load, mock, request, digest } from "../../../security-tests/helpers.js";

// Renewing a tablet pass (Admin → Kiosk tablets → Renew pass): an admin may
// extend a pass in its last 30 days, for a tablet still where it was paired
// and online this week. Everything else still needs a new pairing code.

const DAY = 86400_000;
const call = (sdk, body) => load("manageAccessCodes", sdk, []).default(request(body));
const renew = (sdk, id = "tablet") => call(sdk, { action: "renew_pass", device_id: id });

function setup(role = "admin", { left = 10 * DAY, seen = Date.now() - 60_000, pass = {} } = {}) {
  const sdk = mock(role);
  sdk.tables.KioskDevice[0].last_seen = new Date(seen).toISOString();
  sdk.tables.DeviceCredential = [{
    id: "pass", device_id: "tablet", token_hash: "f".repeat(64), company_id: "a", vehicle_id: "bus-a", kiosk_type: "bus_boarding",
    pairing_code_hash: digest("PAIR12345678"), issued_at: new Date(Date.now() - 80 * DAY).toISOString(),
    expires_at: new Date(Date.now() + left).toISOString(), ...pass,
  }];
  return sdk;
}

describe("renewing a tablet pass", () => {
  it("gives an admin 90 more days from today and records who did it", async () => {
    const sdk = setup();
    const res = await renew(sdk);
    expect(res.status).toBe(200);
    const { expires_at } = await res.json();
    const ends = Date.parse(expires_at) - Date.now();
    expect(ends).toBeGreaterThan(90 * DAY - 60_000);
    expect(ends).toBeLessThanOrEqual(90 * DAY);
    const pass = sdk.tables.DeviceCredential[0];
    expect(pass.expires_at).toBe(expires_at);
    // The tablet keeps its pass: same token, same pairing.
    expect(pass.token_hash).toBe("f".repeat(64));
    expect(pass.pairing_code_hash).toBe(digest("PAIR12345678"));
    const audit = sdk.tables.AuditLog?.[0];
    expect(audit).toMatchObject({ actor_email: "caller@test.invalid", entity: "KioskDevice", record_id: "tablet", summary: "Renewed tablet pass until " + expires_at.slice(0, 10) });
    expect(JSON.stringify(sdk.tables.AuditLog)).not.toContain("f".repeat(64));
  });

  it.each(["company", "staff", null])("refuses a %s account and changes nothing", async (role) => {
    const sdk = setup(role);
    expect((await renew(sdk)).status).toBeGreaterThanOrEqual(400);
    expect(sdk.writes).toEqual([]);
  });

  it.each([
    ["an ended pass", { left: -DAY }, /already ended/],
    ["more than 30 days left", { left: 45 * DAY }, /last 30 days/],
    ["a tablet moved to another bus", { pass: { vehicle_id: "bus-b" } }, /changed after it was paired/],
    ["a tablet given a new pairing code since", { pass: { pairing_code_hash: digest("OTHER1234567") } }, /changed after it was paired/],
    ["a tablet not online this week", { seen: Date.now() - 8 * DAY }, /online this week/],
  ])("refuses %s and changes nothing", async (_name, opts, message) => {
    const sdk = setup("admin", opts);
    const res = await renew(sdk);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(message);
    expect(sdk.writes).toEqual([]);
  });

  it("refuses a tablet with no pass, an unpaired tablet and a revoked one", async () => {
    let sdk = setup();
    sdk.tables.DeviceCredential = [];
    expect((await renew(sdk)).status).toBe(409);
    sdk = setup();
    sdk.tables.KioskDevice[0].paired = false;
    expect((await renew(sdk)).status).toBe(409);
    sdk = setup();
    sdk.tables.KioskDevice[0].status = "revoked";
    expect((await renew(sdk)).status).toBe(409);
    expect(sdk.writes).toEqual([]);
  });

  it("says when the tablet doesn't exist", async () => {
    const sdk = setup();
    expect((await renew(sdk, "missing")).status).toBe(404);
    expect(sdk.writes).toEqual([]);
  });
});
