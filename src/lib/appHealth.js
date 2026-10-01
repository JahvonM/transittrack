/* global __APP_BUILD__ */
// What this tablet's copy of TransitTrack reports about itself on each
// heartbeat (alongside the Android helper app's battery/reader report):
// which build it runs, whether it's online, work still waiting to upload,
// when it last had a GPS fix, and the card reader it's using. Shown in
// Admin → Fleet health.
import { queuedGpsCount } from "@/lib/gpsQueue";
import { pendingJobs } from "@/lib/offlineJobs";
import { queueLength } from "@/lib/offlineQueue";
import { directoryInfo } from "@/lib/kioskOffline";

export const APP_BUILD = typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : "dev";
const LAST_FIX_KEY = "tt_last_gps_fix";

export function noteGpsFix(at = Date.now()) {
  try { localStorage.setItem(LAST_FIX_KEY, String(at)); } catch { /* ignore */ }
}

function readerInUse() {
  try {
    if (localStorage.getItem("tt_reader_helper") === "1") return "pc_helper";
    if (localStorage.getItem("tt_badge_reader") === "1") return "usb_reader";
  } catch { /* ignore */ }
  return typeof window !== "undefined" && "NDEFReader" in window ? "built_in_nfc" : "";
}

export function appHealthPayload(kind = "driver") {
  try {
    const h = {
      build: APP_BUILD,
      online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
      queued_jobs: pendingJobs().length,
      reader: readerInUse(),
    };
    if (kind === "driver") {
      h.queued_gps = queuedGpsCount();
      const fix = Number(localStorage.getItem(LAST_FIX_KEY) || 0);
      if (fix) h.last_gps_fix = new Date(fix).toISOString();
    } else {
      h.queued_checkins = queueLength();
      const dir = directoryInfo();
      if (dir) { h.saved_list_at = dir.updated; h.saved_list_count = dir.count; }
    }
    return { app_health: h };
  } catch {
    return {};
  }
}
