import { base44 } from "@/api/base44Client";
import { addBreadcrumb, appArea, appVersion, breadcrumbs, installBreadcrumbs, safePath } from "@/lib/breadcrumbs";
import { installUpdateReload, reloadingForUpdate } from "@/lib/updateReload";

// Fire-and-forget crash report. Never throws; de-duplicates in this tab so a
// render loop can't flood the backend.
const sent = new Set();

export function reportError(error, { source = "window", extra = "" } = {}) {
  try {
    // The page is already reloading into the new version; nothing to report.
    if (reloadingForUpdate()) return;
    const message = String(error?.message || error || "Unknown error").slice(0, 500);
    const key = `${source}:${message}`;
    if (sent.has(key) || sent.size > 20) return;
    sent.add(key);
    const stack = [error?.stack, extra].filter(Boolean).join("\n---\n").slice(0, 4000);
    base44.functions
      .invoke("reportClientError", {
        message,
        stack,
        source,
        url: safePath(window.location.pathname, window.location.search),
        user_agent: navigator.userAgent,
        // What the person was doing just before, and on what.
        breadcrumbs: breadcrumbs(),
        context: {
          area: appArea(window.location.pathname),
          version: appVersion(),
          screen: `${window.innerWidth}x${window.innerHeight}`,
          online: navigator.onLine,
          installed: window.matchMedia?.("(display-mode: standalone)")?.matches || false,
          language: navigator.language || "",
        },
        // Which tablet it came from (driver or kiosk), for Admin → Fleet health.
        device_id: (() => { try { return localStorage.getItem("tt_driver_device_id") || localStorage.getItem("tt_kiosk_device_id") || ""; } catch { return ""; } })(),
      })
      .catch(() => {});
  } catch {
    /* reporting must never break the app */
  }
}

let installed = false;
export function installGlobalErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  installBreadcrumbs();
  installUpdateReload();
  window.addEventListener("error", (e) => {
    // Ignore browser noise that isn't an app crash.
    if (!e.error || /ResizeObserver loop/.test(e.message || "")) return;
    reportError(e.error, { source: "window" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    // Failed network requests are handled (or not) by each screen; only report real code errors.
    if (!r || r?.response || /Network|fetch|Load failed/i.test(String(r?.message || r))) {
      if (r) addBreadcrumb("error", String(r?.message || r));
      return;
    }
    reportError(r, { source: "promise" });
  });
}
