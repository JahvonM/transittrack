import { useEffect } from "react";

/**
 * Keeps the screen on while active — for driver tablets that are mounted and
 * always powered, so the screen locking is never what interrupts GPS
 * tracking. Uses the native plugin inside the Capacitor app shell (reliable
 * regardless of WebView quirks); falls back to the browser's Wake Lock API
 * for the plain web/PWA version (re-acquired on visibility change, since the
 * browser releases it whenever the tab is hidden).
 *
 * Deliberately NOT background-location: this only keeps the screen from
 * sleeping while the app is the active, visible screen. It does not request
 * any location permission or track anything while backgrounded.
 */
export function useKeepAwake(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let wakeLock = null;
    let cancelled = false;
    let usedNative = false;

    const acquireWeb = async () => {
      if (!("wakeLock" in navigator)) return;
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch {
        /* e.g. tab not visible yet, or unsupported — harmless */
      }
    };

    const onVisibilityChange = () => {
      if (!usedNative && document.visibilityState === "visible") acquireWeb();
    };

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (Capacitor.isNativePlatform()) {
          const { KeepAwake } = await import("@capacitor-community/keep-awake");
          await KeepAwake.keepAwake();
          usedNative = true;
          return;
        }
      } catch {
        /* Capacitor not present (plain web build) — fall through to Wake Lock API */
      }
      if (!cancelled) acquireWeb();
    })();

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (usedNative) {
        import("@capacitor-community/keep-awake").then(({ KeepAwake }) => KeepAwake.allowSleep()).catch(() => {});
      } else if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [enabled]);
}
