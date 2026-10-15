import { describe, it, expect, vi, afterEach } from "vitest";
import { NATIVE_RELEASE, validNativeRelease, nativeReleaseHealth } from "../../../base44/shared/nativeRelease.ts";
import { newControl, controlCompletion } from "../../../base44/shared/tabletControl.ts";
import { mock, load, request } from "../../../security-tests/helpers.js";
import { helperHealthPayload } from "../helperHealth";
const release = { id: "kiosk-2", package_name: "com.transittrack.app", version_code: 2, version_name: "1.1",
  bytes: 1024, sha256: "a".repeat(64), url: "https://eager-transit-track-go.base44.app/native-releases/kiosk-2.apk" };
afterEach(() => vi.unstubAllGlobals());
describe("native kiosk release boundary", () => {
  it("ships without an approved APK and refuses arbitrary URLs or helper identity", () => {
    expect(NATIVE_RELEASE).toBeNull();
    expect(validNativeRelease(release)).toBe(true);
    for (const change of [{ package_name: "com.transittrack.helper" }, { version_code: 1 }, { version_code: 2.5 },
      { bytes: 0 }, { bytes: 151*1024*1024 }, { sha256: "bad" }, { url: "https://evil.test/update.apk" },
      { url: release.url + "?token=secret" }, { url: release.url.replace("https:", "http:") }])
      expect(validNativeRelease({ ...release, ...change })).toBe(false);
  });
  it("release checks require admin before reading tablet records", async () => {
    for (const role of [null, "staff", "company", "mechanic", "driver"]) {
      const c = mock(role);
      const r = await load("tabletControl", c).default(request({ operation: "release", device_id: "tablet" }));
      expect(r.status).toBe(403); expect(c.reads).toHaveLength(0); expect(c.writes).toHaveLength(0);
    }
  });
  it("admin can inspect readiness but cannot supply a replacement artifact", async () => {
    const c = mock("admin"), run = b => load("tabletControl", c).default(request({ device_id: "tablet", ...b }));
    expect(await (await run({ operation: "release" })).json()).toEqual({ release: null });
    expect((await run({ operation: "request", action: "app_update", release_id: release.id, release })).status).toBe(409);
    expect(c.writes).toHaveLength(0);
  });
  it("sanitizes installed metadata and never trusts it as release authority", () => {
    expect(nativeReleaseHealth({ native_app_version: "1.1", native_app_code: 2, native_app_package: "com.transittrack.app", native_update_available: true,
      url: "evil", token: "secret" })).toEqual({ native_app_version: "1.1", native_app_code: 2, native_app_package: "com.transittrack.app", native_update_available: true });
    expect(nativeReleaseHealth({ native_app_version: "<bad>", native_app_code: 2.5, native_app_package: "helper", native_update_available: "true" })).toEqual({});
  });
  it("reports actual native package version separately from helper capability", () => {
    vi.stubGlobal("window", { __ttNativeHealth: { available: true, at: Date.now(), appVersion: "1.1", appVersionCode: 2, appPackage: "com.transittrack.app", updateAvailable: true } });
    expect(helperHealthPayload().helper_health).toMatchObject({ native_app_version: "1.1", native_app_code: 2, native_app_package: "com.transittrack.app", native_update_available: true });
    window.__ttNativeHealth.at -= 600000;
    expect(helperHealthPayload()).toEqual({});
  });
  it("distinguishes requested installation from verified completion", () => {
    const c = newControl({ company_id: "a", kiosk_type: "driver" }, "app_update", "admin").command;
    expect(controlCompletion(c, "UPDATE_REQUESTED").state).toBe("requested");
    expect(controlCompletion(c, "UPDATE_INSTALLED").state).toBe("applied");
    expect(controlCompletion(c, "UPDATE_INVALID").state).toBe("blocked");
    expect(controlCompletion(c, "REBOOT_REQUESTED")).toBeNull();
  });
});
