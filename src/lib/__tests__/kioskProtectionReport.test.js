import { describe, it, expect } from "vitest";
import { cleanHardwareHealth } from "../../../base44/shared/tabletHardwareHealth.ts";
import { protectionFromHealth } from "../kioskProtection";

// What a tablet reports about its lock reaches Admin, cleaned, and is shown
// in the same plain words as on the tablet.
describe("kiosk protection report", () => {
  it("keeps the app's lock result codes and start-up setting, nothing else", () => {
    const out = cleanHardwareHealth({ kiosk_error: "LOCK_RESTORE_FAILED", kiosk_last_code: "DEVICE_OWNER_REQUIRED", default_home: true, kiosk_error_extra: "x" });
    expect(out).toMatchObject({ kiosk_error: "LOCK_RESTORE_FAILED", kiosk_last_code: "DEVICE_OWNER_REQUIRED", default_home: true });
    expect(cleanHardwareHealth({ kiosk_error: "<script>", kiosk_last_code: "lower case" })).not.toHaveProperty("kiosk_error");
    expect(cleanHardwareHealth({ kiosk_last_code: "lower case" })).not.toHaveProperty("kiosk_last_code");
  });
  it("Admin shows the tablet's real state", () => {
    expect(protectionFromHealth(null).tone).toBe("unsupported");
    expect(protectionFromHealth({ management_available: true, management_owner: true, kiosk_enabled: true, kiosk_locked: true }).tone).toBe("ok");
    expect(protectionFromHealth({ management_available: true, management_owner: false, default_home: true }).tone).toBe("limited");
    const failed = protectionFromHealth({ management_available: true, management_owner: true, kiosk_enabled: true, kiosk_locked: false, kiosk_error: "LOCK_RESTORE_FAILED" });
    expect(failed).toMatchObject({ tone: "failed" });
  });
});
