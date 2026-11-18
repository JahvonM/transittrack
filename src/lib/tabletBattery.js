import { useEffect, useState } from "react";

// Battery for the kiosk screens' status bars (kiosk mode hides Android's own).
// Sources, best first: the browser's battery reading, which changes straight
// away; Android's reading from the tablet app (window.__ttNativeHealth, every
// minute); the old Helper app's report (window.__ttHelperHealth).
const FRESH_MS = 5 * 60 * 1000;
const percent = value => Math.max(0, Math.min(100, Math.round(value)));

export function batteryFrom({ browser, native, helper, now = Date.now() } = {}) {
  const fresh = value => value && typeof value.at === "number" && now - value.at <= FRESH_MS && value.at <= now + 5000;
  if (browser && Number.isFinite(browser.level) && browser.level >= 0 && browser.level <= 1) return { level: percent(browser.level * 100), charging: browser.charging === true };
  if (fresh(native) && Number.isFinite(native.battery)) return { level: percent(native.battery), charging: native.charging === true };
  if (helper && Number.isFinite(helper.battery) && (typeof helper.at !== "number" || fresh(helper))) return { level: percent(helper.battery), charging: helper.charging === true };
  return null;
}

// "low" at 15% or less, "warn" at 30% or less, while not charging.
export function batteryState(reading) {
  if (!reading) return "";
  if (reading.charging) return "charging";
  return reading.level <= 15 ? "low" : reading.level <= 30 ? "warn" : "ok";
}

export function useTabletBattery(win = typeof window !== "undefined" ? window : null) {
  const [browser, setBrowser] = useState(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!win) return undefined;
    let manager = null, stopped = false;
    const read = () => { if (!stopped && manager) setBrowser({ level: manager.level, charging: manager.charging }); };
    try {
      win.navigator?.getBattery?.().then(m => {
        if (stopped) return;
        manager = m; read();
        m.addEventListener?.("levelchange", read);
        m.addEventListener?.("chargingchange", read);
      }).catch(() => {});
    } catch { /* no battery reading in this browser */ }
    const again = () => setTick(t => t + 1);
    win.addEventListener("tt-native-health", again);
    const timer = setInterval(again, 60000);
    return () => {
      stopped = true; clearInterval(timer);
      win.removeEventListener("tt-native-health", again);
      manager?.removeEventListener?.("levelchange", read);
      manager?.removeEventListener?.("chargingchange", read);
    };
  }, [win]);
  return batteryFrom({ browser, native: win?.__ttNativeHealth, helper: win?.__ttHelperHealth });
}
