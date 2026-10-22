import { describe, it, expect, vi, beforeEach } from "vitest";
const env = vi.hoisted(() => ({ native: true, platform: "android", available: true, plugin: {} }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => env.native, getPlatform: () => env.platform, isPluginAvailable: name => env.available && name === "TabletRecovery" },
  registerPlugin: () => env.plugin,
}));
import { tabletRecoveryAvailable, tabletRecoveryState, openTabletHomeSettings, setTabletFullscreen } from "../tabletRecovery";
beforeEach(() => {
  env.native = true; env.platform = "android"; env.available = true;
  env.plugin.getState = vi.fn(async () => ({ available: true, defaultHome: false }));
  env.plugin.openHomeSettings = vi.fn(async () => ({}));
});
describe("optional kiosk startup setup", () => {
  it("keeps a missing optional fullscreen method catchable without a synchronous crash", async () => {
    delete env.plugin.setFullscreen;
    let pending;
    expect(() => { pending = setTabletFullscreen(true); }).not.toThrow();
    await expect(pending).rejects.toThrow();
  });
  it("forwards fullscreen changes only on supported tablet installs", async () => {
    env.plugin.setFullscreen = vi.fn(async () => ({}));
    await setTabletFullscreen(true);
    expect(env.plugin.setFullscreen).toHaveBeenCalledWith({ enabled: true });
    env.available = false;
    await expect(setTabletFullscreen(false)).resolves.toBeUndefined();
    expect(env.plugin.setFullscreen).toHaveBeenCalledOnce();
  });
  it("is absent on web, iOS and older/non-helper builds", () => {
    env.native = false; expect(tabletRecoveryAvailable()).toBe(false);
    env.native = true; env.platform = "ios"; expect(tabletRecoveryAvailable()).toBe(false);
    env.platform = "android"; env.available = false; expect(tabletRecoveryAvailable()).toBe(false);
  });
  it("reads capability state without selecting Home or opening Android settings", async () => {
    expect(await tabletRecoveryState()).toEqual({ available: true, defaultHome: false });
    expect(env.plugin.openHomeSettings).not.toHaveBeenCalled();
  });
  it("handles unavailable or failed native state without blocking the page", async () => {
    env.available = false; expect(await tabletRecoveryState()).toEqual({ available: false });
    expect(env.plugin.getState).not.toHaveBeenCalled();
    env.available = true; env.plugin.getState.mockRejectedValue(Error("missing"));
    expect(await tabletRecoveryState()).toEqual({ available: false });
  });
  it("only opens Home settings on explicit request and preserves errors", async () => {
    await openTabletHomeSettings(); expect(env.plugin.openHomeSettings).toHaveBeenCalledOnce();
    env.plugin.openHomeSettings.mockRejectedValue(Error("OS blocked"));
    await expect(openTabletHomeSettings()).rejects.toThrow("OS blocked");
  });
});
