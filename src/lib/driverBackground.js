import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { deviceRequest } from "@/lib/deviceAuth";
const Native = registerPlugin("DriverBackground");
export const BACKGROUND_EVENT = "tt-background-gps";
export const backgroundGpsAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("DriverBackground");
export const backgroundGpsState = async () => backgroundGpsAvailable() ? Native.getState() : { available: false };
export async function setBackgroundGpsEnabled(enabled) {
 const result = await Native.setEnabled({ enabled: !!enabled });
 window.dispatchEvent(new Event(BACKGROUND_EVENT));
 return result;
}
export async function stopBackgroundGps() {
 if (backgroundGpsAvailable()) await Native.stop();
}
export async function configureBackgroundGps(vehicle) {
 if (!backgroundGpsAvailable() || !vehicle?.id || !vehicle?.company_id) return false;
 const state = await backgroundGpsState();
 if (!state.enabled) return false;
 const id = localStorage.getItem("tt_driver_device_id");
 const data = deviceRequest(id);
 if (!id || !/^[a-f0-9]{64}$/.test(data.device_token || "") || !/^[a-f0-9]{64}$/.test(data.driver_grant || "")) return false;
 const result = await Native.configure({ ...data, expected_device_id: id, expected_company_id: vehicle.company_id, expected_vehicle_id: vehicle.id });
 return result.managed === true;
}
// Unmounting a WebView must not stop its native GPS session. Explicit stop,
// unpair, a mode switch, grant expiry or server rejection ends it instead.
export function useDriverBackgroundTracking(sharing, vehicle) {
 useEffect(() => {
  if (!sharing || !backgroundGpsAvailable()) return undefined;
  let stopped = false, busy = false, retry = false;
  const sync = async () => {
   if (stopped || document.visibilityState === "hidden") return;
   if (busy) { retry = true; return; }
   busy = true;
   try { await configureBackgroundGps(vehicle); } catch { /* native setup/status explains a failure; ordinary foreground GPS stays available */ }
   finally { busy = false; if (retry && !stopped) { retry = false; void sync(); } }
  };
  const pulse = () => { if (document.visibilityState !== "hidden") void Native.pulse().catch(() => {}); };
  void sync(); pulse();
  const timer = setInterval(sync, 60000), heartbeat = setInterval(pulse, 5000);
  window.addEventListener(BACKGROUND_EVENT, sync); document.addEventListener("visibilitychange", sync);
  return () => { stopped = true; clearInterval(timer); clearInterval(heartbeat); window.removeEventListener(BACKGROUND_EVENT, sync); document.removeEventListener("visibilitychange", sync); };
 }, [sharing, vehicle?.id, vehicle?.company_id]);
}
export async function exportBackgroundGps() {
 if (!backgroundGpsAvailable()) return [];
 const points = []; let cursor = 0, max = 0;
 for (let guard = 0; guard < 101; guard++) {
  const page = await Native.savedPoints({ cursor, max });
  if (!Array.isArray(page.points)) throw new Error("Could not read saved GPS points.");
  points.push(...page.points);
  if (page.done) return points;
  if (!Number.isFinite(page.cursor) || page.cursor <= cursor) throw new Error("Saved GPS export could not continue.");
  cursor = page.cursor; max = page.max;
 }
 throw new Error("Saved GPS export exceeded its limit.");
}
