import { describe, it, expect } from "vitest";
import { mock, load, request, digest } from "../../../security-tests/helpers.js";
import { newControl, currentControl, controlCompletion } from "../../../base44/shared/tabletControl.ts";
const actions = ["kiosk_prepare", "kiosk_enable", "kiosk_disable", "kiosk_maintenance"];
const token = "a".repeat(64);
const device = { id: "tablet-control", company_id: "a", vehicle_id: "bus-a", kiosk_type: "driver", paired: true, status: "active", pairing_code: "TESTPAIR" };
function fixture(role = "admin") {
  const c = mock(role);
  c.tables.KioskDevice = [{ ...device, helper_health: { reported_at: new Date().toISOString(), kiosk_available: true, management_owner: true } }];
  c.tables.DeviceCredential = [{ id: "cred", device_id: device.id, company_id: "a", vehicle_id: "bus-a", kiosk_type: "driver", token_hash: digest(token), pairing_code_hash: digest("TESTPAIR"), issued_at: new Date().toISOString(), expires_at: "2099-01-01T00:00:00Z" }];
  return c;
}
const run = (c, input) => load("tabletControl", c).default(request({ device_id: device.id, ...input }));
describe("managed Android kiosk controls", () => {
  it.each(actions)("requires an administrator for %s before device reads", async action => {
    for (const role of [null, "staff", "driver", "company", "mechanic"]) {
      const c = fixture(role);
      expect((await run(c, { operation: "request", action })).status).toBe(403);
      expect(c.reads).toHaveLength(0); expect(c.writes).toHaveLength(0);
    }
  });
  it.each(actions)("requires a recent compatible device-owner report for %s", async action => {
    for (const change of [{ kiosk_available: false }, { management_owner: false }, { reported_at: "2000-01-01" }]) {
      const c = fixture(); Object.assign(c.tables.KioskDevice[0].helper_health, change);
      expect((await run(c, { operation: "request", action })).status).toBe(409);
      expect(c.writes).toHaveLength(0);
    }
  });
  it.each(actions)("binds %s to a short-lived command and verifies native device credentials", async action => {
    const c = fixture();
    const issued = await run(c, { operation: "request", action, pin: "12345678" });
    expect(issued.status).toBe(200); const id = (await issued.json()).status.id;
    expect(JSON.stringify(c.tables.KioskDevice)).not.toContain("12345678");
    expect((await run(c, { operation: "claim", command_id: id, device_token: "b".repeat(64) })).status).toBe(401);
    const claim = await run(c, { operation: "claim", command_id: id, device_token: token, action: "shell" });
    expect(claim.status).toBe(200); const proof = await claim.json();
    expect(proof.action).toBe(action); expect(proof.ttl_ms).toBeGreaterThan(0); expect(proof.ttl_ms).toBeLessThanOrEqual(120000);
    c.tables.KioskDevice[0].vehicle_id = "reassigned";
    expect((await run(c, { operation: "claim", command_id: id, device_token: token })).status).toBe(401);
  });
  it("accepts action-compatible receipts and refuses cross-action success", () => {
    const enable = newControl(device, "kiosk_enable", "admin").command;
    expect(controlCompletion(enable, "KIOSK_ENABLED").state).toBe("applied");
    expect(controlCompletion(enable, "KIOSK_RECOVERY_REQUIRED").state).toBe("blocked");
    expect(controlCompletion(enable, "KIOSK_DISABLED")).toBeNull();
    expect(controlCompletion(enable, "ALREADY_LOCKED").state).toBe("blocked");
    expect(currentControl({ ...device, control_command: enable }, Date.parse(enable.expires_at))).toBeNull();
  });
  it.each(["kioskHeartbeat", "driverSession"])("%s accepts boolean status and excludes recovery secrets", endpoint => {
    const clean = load(endpoint, mock(null), ["cleanHelperHealth"]).cleanHelperHealth;
    const result = clean({ available: true, kiosk_available: true, kiosk_enabled: true, kiosk_recovery_ready: true, kiosk_maintenance: false, kiosk_startup: true, kiosk_locked: true, pin_hash: "private", pin_salt: "secret", recovery_pin: "12345678" });
    expect(result.kiosk_enabled).toBe(true); expect(result.kiosk_recovery_ready).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/private|secret|12345678/);
    expect(clean({ available: true, kiosk_enabled: "true" }).kiosk_enabled).toBeUndefined();
  });
});
