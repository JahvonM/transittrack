import { Capacitor, registerPlugin } from "@capacitor/core";
const TabletRecovery = registerPlugin("TabletRecovery");
export const tabletRecoveryAvailable = () => Capacitor.isNativePlatform()
  && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("TabletRecovery");
export async function tabletRecoveryState() {
  if (!tabletRecoveryAvailable()) return { available: false };
  try { return await TabletRecovery.getState(); } catch { return { available: false }; }
}
export const openTabletHomeSettings = () => TabletRecovery.openHomeSettings();

export const setTabletKeepScreenOn = enabled => TabletRecovery.setKeepScreenOn({ enabled });

// Always return a promise, including when an older bridge has no fullscreen method.
// Callers can catch an unsupported optional capability without crashing the page.
export async function setTabletFullscreen(enabled) {
  if (tabletRecoveryAvailable()) return TabletRecovery.setFullscreen({ enabled });
}
