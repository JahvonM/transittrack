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
    let acquiring = false;
    let retry = null;

    const acquireWeb = async () => {
      if (cancelled || acquiring || document.visibilityState !== "visible" || !("wakeLock" in navigator) || (wakeLock && !wakeLock.released)) return;
      acquiring = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) { await lock.release(); return; }
        wakeLock = lock;
        lock.addEventListener("release", () => {
          if (wakeLock === lock) wakeLock = null;
          if (!cancelled && document.visibilityState === "visible") {
            clearTimeout(retry);
            retry = setTimeout(acquireWeb, 5000);
          }
        }, { once: true });
      } catch {
        /* OS/browser may decline; retry on the next visible wake. */
      } finally { acquiring = false; }
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
          if (cancelled) await KeepAwake.allowSleep();
          return;
        }
      } catch {
        /* Capacitor not present (plain web build) — fall through to Wake Lock API */
      }
      if (!cancelled) acquireWeb();
    })();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onVisibilityChange);

    return () => {
      cancelled = true;
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onVisibilityChange);
      if (usedNative) {
        import("@capacitor-community/keep-awake").then(({ KeepAwake }) => KeepAwake.allowSleep()).catch(() => {});
      } else if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [enabled]);
}
