import { describe, it, expect } from "vitest";
import fs from "node:fs";

// McSween Driver (Google Play) is built from the same Android project as the
// kiosk, from src/main plus src/store. None of the kiosk's powers may reach it.
const main = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const store = fs.readFileSync("android/app/src/store/AndroidManifest.xml", "utf8");
const kiosk = fs.readFileSync("android/app/src/kiosk/AndroidManifest.xml", "utf8");
const gradle = fs.readFileSync("android/app/build.gradle", "utf8");
const activity = fs.readFileSync("android/app/src/main/java/com/transittrack/app/MainActivity.java", "utf8");

const KIOSK_ONLY = [
  "BIND_DEVICE_ADMIN", "BIND_ACCESSIBILITY_SERVICE", "android.intent.category.HOME", "USB_DEVICE_ATTACHED",
  "REQUEST_INSTALL_PACKAGES", "WRITE_SECURE_SETTINGS", "WRITE_SETTINGS", "CHANGE_WIFI_STATE",
  "FOREGROUND_SERVICE_SYSTEM_EXEMPTED", "FOREGROUND_SERVICE_MEDIA_PROJECTION", "FOREGROUND_SERVICE_CAMERA",
  "KioskBootReceiver", "KioskWatchdogService", "KioskMaintenanceActivity", "RearDashcam", "SupportProjectionService",
  "NativeUpdateReceiver", "TabletHotspotStartupService", "<queries>",
];

describe("store app (McSween Driver)", () => {
  it("shares no kiosk-only part through the main manifest", () => {
    for (const part of KIOSK_ONLY) expect(main, part).not.toContain(part);
    for (const part of KIOSK_ONLY.slice(0, 4)) expect(kiosk, part).toContain(part);
  });

  it("never asks for all-the-time location; GPS runs as a visible service", () => {
    expect(main + store).not.toContain("ACCESS_BACKGROUND_LOCATION");
    expect(main).toMatch(/DriverLocationService" android:exported="false" android:foregroundServiceType="location"/);
  });

  it("drops the passenger Bluetooth permissions", () => {
    for (const p of ["BLUETOOTH_SCAN", "BLUETOOTH_CONNECT", "BLUETOOTH_ADVERTISE"]) expect(store).toMatch(new RegExp(`${p}" tools:node="remove"`));
  });

  it("is its own app and turns the kiosk code off", () => {
    expect(gradle).toMatch(/store \{[\s\S]*?applicationId "com\.mcsweenstransport\.driver"[\s\S]*?"KIOSK", "false"/);
    expect(gradle).toMatch(/kiosk \{[\s\S]*?"KIOSK", "true"/);
    // The kiosk keeps its id, so tablets update in place.
    expect(gradle).toMatch(/defaultConfig \{[\s\S]*?applicationId "com\.transittrack\.app"/);
    expect(activity).toMatch(/if \(!KIOSK\) return;\s*KioskMode\.reconcile/);
    expect(activity).toMatch(/if \(KIOSK\) \{[\s\S]*?BusHotspot\.ensure/);
  });

  it("keeps no signing secret in the repo", () => {
    expect(gradle).toMatch(/System\.getenv\("STORE_KEYSTORE_PASSWORD"\)/);
    expect(gradle).not.toMatch(/storePassword ["']/);
  });
});
