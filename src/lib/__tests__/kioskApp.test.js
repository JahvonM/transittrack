import { describe, it, expect, vi } from "vitest";
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: vi.fn(), getPlatform: vi.fn(), isPluginAvailable: vi.fn() } }));
import { Capacitor } from "@capacitor/core";
import { isKioskInstall, kioskPathAllowed, savedTabletPath, rememberTabletMode, tabletModeForPath } from "../kioskApp";
const storage = (data = {}) => ({ getItem: k => data[k] || null, setItem: (k, v) => { data[k] = v; }, data });
describe("kiosk launch policy", () => {
  it("uses native helper availability, never URL or stored mode, to identify kiosk builds", () => {
    Capacitor.isNativePlatform.mockReturnValue(false);
    expect(isKioskInstall()).toBe(false);
    Capacitor.isNativePlatform.mockReturnValue(true); Capacitor.getPlatform.mockReturnValue("android");
    Capacitor.isPluginAvailable.mockReturnValue(false);
    expect(isKioskInstall()).toBe(false);
    Capacitor.isPluginAvailable.mockImplementation(n => ["TabletHealth", "UsbGps"].includes(n));
    expect(isKioskInstall()).toBe(true);
    Capacitor.getPlatform.mockReturnValue("ios");
    expect(isKioskInstall()).toBe(false);
  });
  it("resumes either existing pairing without changing any credentials or queue", () => {
    for (const [key, path] of [["tt_driver_device_id", "/driver"], ["tt_kiosk_device_id", "/kiosk"]]) {
      const s = storage({ [key]: "test", tt_device_token_test: "secret", tt_offline_checkins: "pending" });
      const before = JSON.stringify(s.data);
      expect(savedTabletPath(s)).toBe(path);
      expect(JSON.stringify(s.data)).toBe(before);
    }
  });
  it("asks instead of guessing when both modes are paired", () => {
    expect(savedTabletPath(storage())).toBe("/tablet");
    expect(savedTabletPath(storage({ tt_driver_device_id: "a", tt_kiosk_device_id: "b" }))).toBe("/tablet");
  });
  it("remembers only the explicit tablet choice and ignores hostile paths", () => {
    const s = storage();
    rememberTabletMode("driver", s); expect(savedTabletPath(s)).toBe("/driver");
    rememberTabletMode("https://evil.example", s); expect(savedTabletPath(s)).toBe("/driver");
    rememberTabletMode("kiosk", s); expect(savedTabletPath(s)).toBe("/kiosk");
  });
  it("handles blocked storage without blocking setup", () => {
    const s = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } };
    expect(savedTabletPath(s)).toBe("/tablet");
    expect(() => rememberTabletMode("driver", s)).not.toThrow();
  });
  it("allows tablet/legal screens but excludes passenger, admin, phone and auth routes", () => {
    for (const p of ["/driver", "/driver/more", "/driver/drive", "/kiosk", "/tablet", "/privacy", "/terms"]) expect(kioskPathAllowed(p)).toBe(true);
    for (const p of ["/", "/staff", "/journey", "/login", "/register", "/driver-phone", "/driver-phone/drive", "/admin", "//evil.example", "/kiosk/../staff"]) expect(kioskPathAllowed(p)).toBe(false);
    expect(tabletModeForPath("/driver/more")).toBe("driver");
    expect(tabletModeForPath("/driver-phone")).toBe(null);
  });
});
