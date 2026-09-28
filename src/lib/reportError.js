import { base44 } from "@/api/base44Client";

// Fire-and-forget crash report. Never throws; de-duplicates in this tab so a
// render loop can't flood the backend.
const sent = new Set();

export function reportError(error, { source = "window", extra = "" } = {}) {
  try {
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
        url: window.location.pathname + window.location.search,
        user_agent: navigator.userAgent,
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
  window.addEventListener("error", (e) => {
    // Ignore browser noise that isn't an app crash.
    if (!e.error || /ResizeObserver loop/.test(e.message || "")) return;
    reportError(e.error, { source: "window" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    // Failed network requests are handled (or not) by each screen; only report real code errors.
    if (!r || r?.response || /Network|fetch|Load failed/i.test(String(r?.message || r))) return;
    reportError(r, { source: "promise" });
  });
}
