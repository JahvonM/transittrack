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

export const setTabletFullscreen = enabled => tabletRecoveryAvailable() ? TabletRecovery.setFullscreen({enabled}) : Promise.resolve();
