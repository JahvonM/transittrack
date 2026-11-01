import { describe, it, expect } from "vitest";
import { kioskCodeText, protectionState } from "../kioskProtection";

// What the tablet says about its own lock: only what Android reports.
const control = (over = {}) => ({ available: true, deviceOwner: true, locked: false, kioskAvailable: true, kioskEnabled: false, kioskRecoveryReady: true, kioskMaintenance: false, kioskLocked: false, kioskError: "", ...over });

describe("kiosk protection in plain words", () => {
  it("active only when kiosk mode is on and Android has the screen locked", () => {
    expect(protectionState(null, control({ kioskEnabled: true, kioskLocked: true })).tone).toBe("ok");
    const failed = protectionState(null, control({ kioskEnabled: true, kioskLocked: false, kioskError: "LOCK_RESTORE_FAILED" }));
    expect(failed.tone).toBe("failed");
    expect(failed.text).toMatch(/couldn't be put back/);
  });
  it("says what setup is missing", () => {
    expect(protectionState(null, control({ deviceOwner: false })).text).toMatch(/USB setup tool/);
    expect(protectionState(null, control({ kioskRecoveryReady: false })).text).toMatch(/exit code/);
    expect(protectionState(null, control()).text).toMatch(/Kiosk lock is off/);
  });
  it("calls pinning or a Home-app start limited, not protected", () => {
    expect(protectionState(null, control({ deviceOwner: false, locked: true })).tone).toBe("limited");
    expect(protectionState({ defaultHome: true }, control({ deviceOwner: false })).tone).toBe("limited");
    expect(protectionState(null, control({ kioskMaintenance: true, kioskEnabled: true })).tone).toBe("limited");
  });
  it("doesn't guess when the McSween app isn't running the screen", () => {
    const s = protectionState(null, null);
    expect(s.tone).toBe("unsupported");
    expect(s.text).toMatch(/Not reported/);
  });
  it("turns the app's codes into instructions", () => {
    expect(kioskCodeText("DEVICE_OWNER_REQUIRED")).toMatch(/USB setup tool/);
    expect(kioskCodeText("UNSUPPORTED")).toMatch(/Android 8/);
    expect(kioskCodeText("SOMETHING_NEW")).toBe("code SOMETHING_NEW");
  });
});
