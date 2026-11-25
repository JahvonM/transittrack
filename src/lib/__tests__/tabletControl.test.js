import { describe, it, expect } from "vitest";
import { newControl, currentControl, controlNotice, controlCompletion, strictControlDevice, controlTtl, CONTROL_TTL, UPDATE_TTL } from "../../../base44/shared/tabletControl.ts";
import { mock, load, request, digest } from "../../../security-tests/helpers.js";
import { cleanTabletSession } from "../tabletSession";
const TOKEN = "a".repeat(64);
const device = { id: "tablet-control", company_id: "a", vehicle_id: "bus-a", kiosk_type: "driver", paired: true, status: "active", pairing_code: "TESTPAIR" };
function fixture(role = "admin") {
  const c = mock(role); c.tables.KioskDevice = [{ ...device }];
  c.tables.DeviceCredential = [{ id: "cred", device_id: device.id, company_id: "a", vehicle_id: "bus-a", kiosk_type: "driver",
    token_hash: digest(TOKEN), pairing_code_hash: digest("TESTPAIR"), issued_at: new Date().toISOString(), expires_at: "2099-01-01T00:00:00Z" }];
  c.tables.Vehicle[0] = { ...c.tables.Vehicle[0], tracking_active: false, speed: 0 };
  c.tables.DriverShift = [];
  return c;
}
const run = (c, body) => load("tabletControl", c).default(request({ device_id: device.id, ...body }));
async function issue(c, action = "lock_test") {
  const r = await run(c, { operation: "request", action }); expect(r.status).toBe(200);
  return (await r.json()).status.id;
}
describe("privileged tablet command policy", () => {
  it("bounds command lifetime, expiry, assignment and lock lease", () => {
    const now = Date.now(), built = newControl(device, "lock_test", "caller", now);
    const d = { ...device, control_command: built.command, control_status: built.status };
    expect(built.command.id).toMatch(/^[a-f0-9]{32}$/);
    expect(controlNotice(d, now)).toEqual({ id: built.command.id });
    for (const changed of [{ company_id: "b" }, { vehicle_id: "other" }, { kiosk_type: "bus_boarding" }])
      expect(currentControl({ ...d, ...changed }, now)).toBeNull();
    expect(currentControl(d, now + CONTROL_TTL)).toBeNull();
    expect(currentControl({ ...d, control_command: { ...built.command, requested_at: new Date(now + 10000).toISOString() } }, now)).toBeNull();
    expect(currentControl({ ...d, control_command: { ...built.command, expires_at: "invalid" } }, now)).toBeNull();
    expect(currentControl({ ...d, control_command: { ...built.command, lock_until: new Date(now + 700000).toISOString() } }, now)).toBeNull();
    expect(() => newControl(device, "shell", "caller")).toThrow();
  });
  it("gives an app update 15 minutes only on a tablet whose app knows the longer window", () => {
    const now = Date.now();
    const newer = { ...device, helper_health: { native_app_code: 13 } }, older = { ...device, helper_health: { native_app_code: 12 } };
    expect(controlTtl("app_update", newer)).toBe(UPDATE_TTL);
    expect(controlTtl("app_update", older)).toBe(CONTROL_TTL);
    expect(controlTtl("app_update", { ...device, helper_health: { native_app_code: "13" } })).toBe(CONTROL_TTL);
    expect(controlTtl("reboot", newer)).toBe(CONTROL_TTL);
    const long = newControl(newer, "app_update", "caller", now);
    expect(Date.parse(long.command.expires_at) - now).toBe(UPDATE_TTL);
    const d = { ...newer, control_command: long.command, control_status: long.status };
    expect(currentControl(d, now + 10 * 60_000)).toEqual(long.command);
    expect(currentControl(d, now + UPDATE_TTL)).toBeNull();
    // Only an app update may last 15 minutes.
    const reboot = newControl(newer, "reboot", "caller", now).command;
    expect(currentControl({ ...newer, control_command: { ...reboot, expires_at: long.command.expires_at } }, now)).toBeNull();
    const short = newControl(older, "app_update", "caller", now).command;
    expect(Date.parse(short.expires_at) - now).toBe(CONTROL_TTL);
  });
  it("has no device-ID-only authorization, even for legacy development tablets", async () => {
    const c = fixture();
    expect(await strictControlDevice(c.asServiceRole.entities, device, TOKEN)).toBe(true);
    for (const token of ["", "wrong", "b".repeat(64)]) expect(await strictControlDevice(c.asServiceRole.entities, device, token)).toBe(false);
    for (const changed of [{ paired: false }, { status: "revoked" }, { company_id: "other" }, { vehicle_id: "other" }, { pairing_code: "new" }])
      expect(await strictControlDevice(c.asServiceRole.entities, { ...device, ...changed }, TOKEN)).toBe(false);
    c.tables.DeviceCredential = []; expect(await strictControlDevice(c.asServiceRole.entities, device, TOKEN)).toBe(false);
  });
  it("does not cache a command or notice, and stores fixed action-compatible completion only", () => {
    expect(cleanTabletSession({ control_command: { action: "reboot" }, control_notice: { id: "secret" }, vehicle: { name: "Bus" } })).toEqual({ vehicle: { name: "Bus" } });
    const command = newControl(device, "reboot", "caller").command;
    expect(controlCompletion(command, "REBOOT_REQUESTED").state).toBe("requested");
    expect(controlCompletion(command, "LOCKED")).toBeNull();
    expect(controlCompletion(command, "__proto__")).toBeNull();
  });
});
describe("real tabletControl endpoint against isolated database", () => {
  it("gateway exposes only safe progress and refuses direct status/command edits", async () => {
    const c = fixture(); await issue(c);
    const access = body => load("entityAccess", c).default(request(body));
    const read = await access({ entity: "KioskDevice", operation: "get", id: device.id });
    expect(read.status).toBe(200);
    const data = (await read.json()).result;
    expect(data.control_status.state).toBe("waiting");
    expect(data.control_command).toBeUndefined();
    for (const data of [{ control_command: { action: "reboot" } }, { control_status: { state: "applied" } }]) {
      const r = await access({ entity: "KioskDevice", operation: "update", id: device.id, data });
      expect(r.status).toBeGreaterThanOrEqual(400);
    }
  });
  it("rejects signed-out, passenger, driver, mechanic and company control requests before reads", async () => {
    for (const role of [null, "staff", "driver", "mechanic", "company"]) {
      const c = fixture(role);
      expect((await run(c, { operation: "request", action: "reboot" })).status).toBe(403);
      expect(c.writes).toHaveLength(0); expect(c.reads).toHaveLength(0);
    }
  });
  it("issues admin command, verifies native proof and ignores WebView-provided action/role", async () => {
    const c = fixture(), id = await issue(c);
    const result = await run(c, { operation: "claim", command_id: id, device_token: TOKEN, action: "reboot", role: "admin" });
    expect(result.status).toBe(200);
    const proof = await result.json();
    expect(proof.action).toBe("lock_test"); expect(proof.ttl_ms).toBeLessThanOrEqual(120000);
    expect(proof.lease_ms).toBeLessThanOrEqual(600000);
    expect(JSON.stringify(proof)).not.toContain("TESTPAIR");
    expect((await run(c, { operation: "request", action: "reboot" })).status).toBe(409);
  });
  it("rejects missing/wrong credentials, tampering, changed requester and expired commands", async () => {
    const c = fixture(), id = await issue(c);
    for (const token of [undefined, "b".repeat(64)])
      expect((await run(c, { operation: "claim", command_id: id, device_token: token })).status).toBe(401);
    expect((await run(c, { operation: "claim", command_id: "0".repeat(32), device_token: TOKEN })).status).toBe(409);
    c.tables.User[0].role = "company";
    expect((await run(c, { operation: "claim", command_id: id, device_token: TOKEN })).status).toBe(403);
    c.tables.User[0].role = "admin";
    c.tables.KioskDevice[0].control_command.expires_at = new Date(Date.now() - 1).toISOString();
    expect((await run(c, { operation: "claim", command_id: id, device_token: TOKEN })).status).toBe(410);
  });
  it("requires parked vehicle, tracking off, no open shifts, including older history pages", async () => {
    const fresh = new Date().toISOString();
    for (const over of [{ tracking_active: true, last_location_update: fresh }, { tracking_active: undefined, last_location_update: fresh }, { speed: 3 }, { speed: null }]) {
      const c = fixture(), id = await issue(c, "reboot"); Object.assign(c.tables.Vehicle[0], over);
      expect(await (await run(c, { operation: "claim", command_id: id, device_token: TOKEN })).json()).toMatchObject({ action: "reboot", blocked_code: "TABLET_BUSY" });
    }
    const c = fixture(), id = await issue(c, "reboot");
    c.tables.DriverShift = [...Array.from({ length: 100 }, (_, i) => ({ id: String(i), company_id: "a", vehicle_id: "bus-a", started_at: "2026-10-14", ended_at: "2026-10-15" })),
      { id: "open", company_id: "a", vehicle_id: "bus-a", started_at: new Date(Date.now() - 2 * 3600_000).toISOString() }];
    expect(await (await run(c, { operation: "claim", command_id: id, device_token: TOKEN })).json()).toMatchObject({ action: "reboot", blocked_code: "TABLET_BUSY" });
    c.tables.DriverShift[100].ended_at = fresh;
    expect((await run(c, { operation: "claim", command_id: id, device_token: TOKEN })).status).toBe(200);
  });
  it("ignores a tracking flag the bus stopped backing with positions, and a shift left open for days", async () => {
    // A tablet switched off mid-shift: its flag says tracking, its last position is an hour old.
    let c = fixture(), id = await issue(c, "reboot");
    Object.assign(c.tables.Vehicle[0], { tracking_active: true, last_location_update: new Date(Date.now() - 3600_000).toISOString() });
    let proof = await (await run(c, { operation: "claim", command_id: id, device_token: TOKEN })).json();
    expect(proof.action).toBe("reboot");
    expect(proof.blocked_code).toBeUndefined();
    // Nobody ended this shift, 19 hours ago; one that started 17 hours ago still counts.
    c = fixture(); id = await issue(c, "reboot");
    c.tables.DriverShift = [{ id: "forgotten", company_id: "a", vehicle_id: "bus-a", started_at: new Date(Date.now() - 19 * 3600_000).toISOString() }];
    proof = await (await run(c, { operation: "claim", command_id: id, device_token: TOKEN })).json();
    expect(proof.blocked_code).toBeUndefined();
    c.tables.DriverShift[0].started_at = new Date(Date.now() - 17 * 3600_000).toISOString();
    expect(await (await run(c, { operation: "claim", command_id: id, device_token: TOKEN })).json()).toMatchObject({ blocked_code: "TABLET_BUSY" });
    // A shift with no readable start time still counts.
    c.tables.DriverShift[0].started_at = "";
    expect(await (await run(c, { operation: "claim", command_id: id, device_token: TOKEN })).json()).toMatchObject({ blocked_code: "TABLET_BUSY" });
  });
  it("records only allowlisted results; duplicate receipt cannot rewrite completion", async () => {
    const c = fixture(), id = await issue(c, "reboot");
    const result = code => run(c, { operation: "result", command_id: id, device_token: TOKEN, code, message: "PRIVATE", state: "success" });
    expect((await result("LOCKED")).status).toBe(400);
    expect((await result("__proto__")).status).toBe(400);
    expect((await result("REBOOT_REQUESTED")).status).toBe(200);
    expect(c.tables.KioskDevice[0].control_status.state).toBe("requested");
    expect(JSON.stringify(c.tables.KioskDevice[0].control_status)).not.toContain("PRIVATE");
    expect((await result("ANDROID_ERROR")).status).toBe(200);
    expect(c.tables.KioskDevice[0].control_status.state).toBe("requested");
    expect((await run(c, { operation: "claim", command_id: id, device_token: TOKEN })).status).toBe(410);
  });
});
