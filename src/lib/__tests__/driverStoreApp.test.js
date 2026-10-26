import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: vi.fn(), getPlatform: vi.fn(), isPluginAvailable: vi.fn() }, registerPlugin: () => ({}) }));
import { Capacitor } from "@capacitor/core";
import { isDriverStoreInstall, driverStorePathAllowed, isKioskInstall } from "../kioskApp";
import { backgroundGpsAvailable } from "../driverBackground";

// McSween Driver: the store app on a driver's own phone (Android "store"
// flavor, iPhone driver-app/ios). Only the driver screens, GPS from the phone.
const plugins = (...names) => Capacitor.isPluginAvailable.mockImplementation((n) => names.includes(n));

describe("McSween Driver (store app)", () => {
  it("is told apart from the kiosk by its plugins, on Android and iPhone", () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    for (const platform of ["android", "ios"]) {
      Capacitor.getPlatform.mockReturnValue(platform);
      plugins("DriverBackground");
      expect(isDriverStoreInstall()).toBe(true);
      expect(backgroundGpsAvailable()).toBe(true);
    }
    Capacitor.getPlatform.mockReturnValue("android");
    plugins("DriverBackground", "TabletHealth", "UsbGps");
    expect(isKioskInstall()).toBe(true);
    expect(isDriverStoreInstall()).toBe(false);
    // The passenger phone app and the website are neither.
    plugins();
    expect(isDriverStoreInstall()).toBe(false);
    Capacitor.isNativePlatform.mockReturnValue(false);
    plugins("DriverBackground");
    expect(isDriverStoreInstall()).toBe(false);
  });

  it("only opens the driver screens and the legal pages", () => {
    for (const ok of ["/driver", "/driver/", "/driver/track", "/driver/settings", "/privacy", "/terms"]) expect(driverStorePathAllowed(ok), ok).toBe(true);
    for (const no of ["/", "/admin", "/kiosk", "/tablet", "/driver/a/b", "/drivers", "/login", "/driver-phone"]) expect(driverStorePathAllowed(no), no).toBe(false);
  });
});

describe("iPhone background GPS (driver-app/ios)", () => {
  const swift = fs.readFileSync("driver-app/ios/App/App/DriverBackgroundPlugin.swift", "utf8");
  const kotlin = fs.readFileSync("android/app/src/main/java/com/transittrack/app/DriverTrackingHttp.kt", "utf8");
  const js = fs.readFileSync("src/lib/driverBackground.js", "utf8");
  const plist = fs.readFileSync("driver-app/ios/App/App/Info.plist", "utf8");

  it("talks to the same server as Android", () => {
    const url = (src) => src.match(/URL\((?:string: )?"([^"]+)"\)/)[1];
    expect(url(swift)).toBe(url(kotlin));
    expect(swift.match(/appId = "([^"]+)"/)[1]).toBe(kotlin.match(/"X-App-Id","([^"]+)"/)[1]);
  });

  it("answers every call the shared JavaScript makes", () => {
    expect(swift).toContain('jsName = "DriverBackground"');
    const calls = [...new Set([...js.matchAll(/Native\.(\w+)\(/g)].map((m) => m[1]))];
    expect(calls.length).toBeGreaterThan(5);
    for (const call of calls) expect(swift, call).toContain(`CAPPluginMethod(name: "${call}"`);
  });

  it("uses While Using location with the background mode, never Always", () => {
    expect(plist).toContain("NSLocationWhenInUseUsageDescription");
    expect(plist).toMatch(/UIBackgroundModes<\/key>\s*<array>\s*<string>location<\/string>/);
    expect(plist).not.toMatch(/NSLocationAlways/);
    expect(swift).not.toMatch(/requestAlwaysAuthorization/);
    expect(swift).toContain("showsBackgroundLocationIndicator = true");
  });

  it("stops when the server says the PIN, bus or pairing changed", () => {
    expect(swift).toMatch(/denied: \[401, 403, 404, 409\]\.contains\(code\)/);
    expect(swift).toMatch(/expires - verified <= 20 \* 3600/);
  });
});

describe("McSween Driver on phones and tablets", () => {
  const plist = fs.readFileSync("driver-app/ios/App/App/Info.plist", "utf8");
  const pbx = fs.readFileSync("driver-app/ios/App/App.xcodeproj/project.pbxproj", "utf8");
  const activity = fs.readFileSync("android/app/src/main/java/com/transittrack/app/MainActivity.java", "utf8");

  it("runs on iPhone and iPad", () => {
    expect(pbx.match(/TARGETED_DEVICE_FAMILY = "1,2";/g)).toHaveLength(2);
  });

  it("keeps phones upright and lets tablets turn", () => {
    const iphone = plist.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/)[1];
    const ipad = plist.match(/<key>UISupportedInterfaceOrientations~ipad<\/key>\s*<array>([\s\S]*?)<\/array>/)[1];
    expect(iphone).toContain("Portrait");
    expect(iphone).not.toContain("Landscape");
    for (const o of ["Portrait", "PortraitUpsideDown", "LandscapeLeft", "LandscapeRight"]) expect(ipad).toContain(`UIInterfaceOrientation${o}<`);
    expect(activity).toMatch(/!KIOSK && getResources\(\)\.getConfiguration\(\)\.smallestScreenWidthDp < 600\)\s*setRequestedOrientation\(android\.content\.pm\.ActivityInfo\.SCREEN_ORIENTATION_PORTRAIT\)/);
  });
});
