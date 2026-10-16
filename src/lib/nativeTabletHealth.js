import { supportCapabilities } from "@/lib/nativeTabletSupport";
import { Capacitor, registerPlugin } from "@capacitor/core";
const TabletHealth = registerPlugin("TabletHealth");
export const nativeTabletHealthAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("TabletHealth");
export async function tabletSnapshot() {
  if (!nativeTabletHealthAvailable()) return null;
  try { return await TabletHealth.getSnapshot(); } catch { return null; }
}
export const openTabletWifiSettings = () => TabletHealth.openWifiSettings();
export const openTabletHotspotSettings = () => TabletHealth.openHotspotSettings();
export function startNativeTabletHealth(target = window) {
  if (!nativeTabletHealthAvailable()) return () => {};
  let stopped = false, reading = false;
  const refresh = async () => {
    if (stopped || reading || target.document?.visibilityState === "hidden") return;
    reading = true;
    try {
      const snapshot = await tabletSnapshot();
      if (!stopped && snapshot?.available) {
        snapshot.supportAvailable = (await supportCapabilities().catch(() => null))?.remoteViewingReady === true;
        target.__ttNativeHealth = snapshot;
        target.dispatchEvent(new Event("tt-native-health"));
      }
    } finally { reading = false; }
  };
  void refresh();
  const timer = setInterval(refresh, 60000);
  target.addEventListener("pageshow", refresh);
  target.document?.addEventListener("visibilitychange", refresh);
  return () => {
    stopped = true; clearInterval(timer);
    target.removeEventListener("pageshow", refresh);
    target.document?.removeEventListener("visibilitychange", refresh);
  };
}
