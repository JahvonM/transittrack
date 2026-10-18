import { Capacitor, registerPlugin } from "@capacitor/core";
const Health = registerPlugin("TabletHealth");
export const nativeDashcamAvailable = () => Capacitor.isNativePlatform()
  && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("TabletHealth");
export async function openRearDashcam() {
  if (!nativeDashcamAvailable()) return false;
  await Health.openDashcam(); return true;
}
export async function rearDashcamState() {
  if (!nativeDashcamAvailable()) return null;
  try { return await Health.getDashcamState(); } catch { return null; }
}
export async function notifyDashcamShift(action) {
  if (!["start_shift", "end_shift"].includes(action) || !nativeDashcamAvailable()) return;
  // Shift success never depends on optional recording hardware. Native opt-in is required.
  try { await Health.dashcamShift({ action }); } catch { /* recording state remains visible on the tablet */ }
}
