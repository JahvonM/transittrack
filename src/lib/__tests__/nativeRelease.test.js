import { describe, it, expect, vi, afterEach } from "vitest";
import { NATIVE_RELEASE, validNativeRelease, nativeReleaseHealth } from "../../../base44/shared/nativeRelease.ts";
import { newControl, controlCompletion } from "../../../base44/shared/tabletControl.ts";
import { mock, load, request } from "../../../security-tests/helpers.js";
import { helperHealthPayload } from "../helperHealth";
const release = { id: "kiosk-2", package_name: "com.transittrack.app", version_code: 2, version_name: "1.1",
  bytes: 1024, sha256: "a".repeat(64), url: "https://app.mcsweenstransport.com/native-releases/kiosk-2.apk" };
afterEach(() => vi.unstubAllGlobals());
describe("native kiosk release boundary", () => {
  it("ships without an approved APK and refuses arbitrary URLs or helper identity", () => {
    expect(NATIVE_RELEASE).toBeNull();
    expect(validNativeRelease(release)).toBe(true);
    for (const change of [{ package_name: "com.transittrack.helper" }, { version_code: 1 }, { version_code: 2.5 },
      { bytes: 0 }, { bytes: 151*1024*1024 }, { sha256: "bad" }, { url: "https://evil.test/update.apk" },
      { url: "https://eager-transit-track-go.base44.app/native-releases/kiosk-2.apk" },
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

import fs from "node:fs";
import ts from "typescript";
import { webcrypto } from "node:crypto";
import { inlineShared, digest } from "../../../security-tests/helpers.js";
// Replace only the empty release catalog in an isolated copy, never live config.
function releasedHandler(c) {
  let source = inlineShared(fs.readFileSync(new URL("../../../base44/functions/tabletControl/entry.ts", import.meta.url), "utf8"));
  source = source.replace("const NATIVE_RELEASE: NativeRelease | null = null;", "const NATIVE_RELEASE = " + JSON.stringify(release) + ";").replace(/^import .*;\s*$/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; new Function("exports", "createClientFromRequest", "crypto", js)(exports, () => c, webcrypto);
  return b => exports.default(request({ device_id: "tablet", ...b }));
}
function releasedFixture() {
  const c = mock("admin"), token = "b".repeat(64), d = c.tables.KioskDevice[0];
  d.helper_health = { reported_at: new Date().toISOString(), native_update_available: true, management_owner: true, native_app_package: release.package_name, native_app_code: 1 };
  c.tables.DeviceCredential = [{ device_id: d.id, company_id: d.company_id, vehicle_id: d.vehicle_id, kiosk_type: d.kiosk_type,
    issued_at: new Date().toISOString(), expires_at: "2099-01-01", token_hash: digest(token), pairing_code_hash: digest(d.pairing_code) }];
  Object.assign(c.tables.Vehicle[0], { tracking_active: false, speed: 0 });
  c.tables.DriverShift = [];
  return { c, token, d, run: releasedHandler(c) };
}
describe("configured release lifecycle with isolated catalog", () => {
  it("pins server release, rechecks activity and requester, then accepts final completion once", async () => {
    const { c, token, d, run } = releasedFixture();
    const issued = await run({ operation: "request", action: "app_update", release_id: release.id, url: "https://evil.test" });
    expect(issued.status).toBe(200);
    const id = (await issued.json()).status.id;
    const claim = () => run({ operation: "claim", command_id: id, device_token: token });
    expect(await (await claim()).json()).toMatchObject({ action: "app_update", release });
    c.tables.Vehicle[0].tracking_active = true;
    expect(await (await claim()).json()).toMatchObject({ blocked_code: "TABLET_BUSY" });
    c.tables.Vehicle[0].tracking_active = false; c.tables.User[0].role = "company";
    expect((await claim()).status).toBe(403);
    c.tables.User[0].role = "admin";
    const report = code => run({ operation: "result", command_id: id, device_token: token, code });
    expect((await report("UPDATE_REQUESTED")).status).toBe(200);
    expect(d.control_status.state).toBe("requested");
    expect((await report("UPDATE_INSTALLED")).status).toBe(200);
    expect(d.control_status.state).toBe("applied");
    await report("UPDATE_FAILED");
    expect(d.control_status.state).toBe("applied");
  });
  it("requires recent compatible native health and rejects changed release identity", async () => {
    for (const change of [{ management_owner: false }, { native_update_available: false }, { native_app_code: 2 },
      { reported_at: "2020-01-01" }, { native_app_package: "helper" }]) {
      const { d, run, c } = releasedFixture(); Object.assign(d.helper_health, change);
      expect((await run({ operation: "request", action: "app_update", release_id: release.id })).status).toBe(409);
      expect(c.writes).toHaveLength(0);
    }
    const { run, d, token } = releasedFixture();
    const r = await run({ operation: "request", action: "app_update", release_id: release.id });
    const id = (await r.json()).status.id; d.control_command.release_id = "withdrawn";
    expect((await run({ operation: "claim", command_id: id, device_token: token })).status).toBe(410);
  });
});
