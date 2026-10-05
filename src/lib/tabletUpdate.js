// Keeps bus tablets (driver + boarding) on the newest version without anyone
// touching them:
//  - automatically, when a newer version is published and the tablet is
//    charging and nobody is using it;
//  - on request, when an admin presses "Send update" in Admin → Kiosk tablets
//    (applied the next time the tablet is idle, charging or not).
// "Updating" saves the whole new version for offline use first, then reloads
// into it (public/sw.js); if that can't finish, the tablet keeps running the
// version it has. Anything waiting to upload is kept in the tablet's storage
// and survives the reload.
import { useEffect, useRef } from "react";
import { APP_BUILD } from "@/lib/appHealth";

const APPLIED_KEY = "tt_update_applied_at";
const CHECK_EVERY_MS = 60 * 1000;
const BUILD_CHECK_EVERY_MS = 10 * 60 * 1000;
const PAGE_LOADED_AT = Date.now();

let lastInteraction = Date.now();
if (typeof window !== "undefined") {
  const touch = () => { lastInteraction = Date.now(); };
  ["pointerdown", "keydown", "touchstart", "tt-badge"].forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
}

// Nobody has touched the screen (or tapped a card) for this long.
export const idleFor = (ms) => Date.now() - lastInteraction >= ms;

let battery = null;
if (typeof navigator !== "undefined" && navigator.getBattery) {
  navigator.getBattery().then((b) => { battery = b; }).catch(() => {});
}

// The Android helper app knows best; otherwise ask the browser.
export function isCharging() {
  const h = typeof window !== "undefined" ? window.__ttHelperHealth : null;
  if (typeof h?.charging === "boolean") return h.charging;
  return !!battery?.charging;
}

let lastBuildCheck = 0;
let newerBuild = false;
export async function newerVersionPublished() {
  if (newerBuild) return true;
  if (Date.now() - lastBuildCheck < BUILD_CHECK_EVERY_MS) return false;
  lastBuildCheck = Date.now();
  try {
    const r = await fetch(`/offline-manifest.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return false;
    const m = await r.json();
    newerBuild = !!m.build && APP_BUILD !== "dev" && m.build !== APP_BUILD;
  } catch { /* offline */ }
  return newerBuild;
}

// An admin's "Send update" that this tablet hasn't acted on yet. Requests
// from before this page opened don't count — opening it already loaded the
// newest version.
export function updateRequested(requestedAt) {
  const t = requestedAt ? Date.parse(requestedAt) : NaN;
  if (!Number.isFinite(t) || t <= PAGE_LOADED_AT) return false;
  let applied = 0;
  try { applied = Date.parse(localStorage.getItem(APPLIED_KEY) || "") || 0; } catch { /* ignore */ }
  return t > applied;
}

// Asks the service worker to save the whole new version for offline use.
// True when it's saved (or there's no service worker to ask, e.g. a dev build).
export async function stageNewVersion(timeoutMs = 90_000) {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : null;
  if (!sw) return true;
  let reg = null;
  try { reg = await sw.getRegistration(); } catch { /* ignore */ }
  if (!reg) return true;
  try { await reg.update(); } catch { /* keep the current worker */ }
  const worker = sw.controller || reg.active;
  if (!worker) return true;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data?.ok === true); };
    try { worker.postMessage({ type: "tt-stage-update" }, [channel.port2]); }
    catch { clearTimeout(timer); resolve(false); }
  });
}

// Reloads into the newest version only once it's fully saved on the tablet.
// If saving fails (signal dropped, a file missing) the tablet stays on the
// version it's running and tries again on a later check. Resolves false then.
export async function applyUpdate(requestedAt) {
  if (!(await stageNewVersion())) return false;
  try { localStorage.setItem(APPLIED_KEY, requestedAt || new Date().toISOString()); } catch { /* ignore */ }
  window.location.reload();
  return true;
}

// isIdle: () => boolean — true when reloading now wouldn't interrupt anyone.
export function useTabletUpdates({ requestedAt, isIdle }) {
  const req = useRef(requestedAt);
  const idle = useRef(isIdle);
  req.current = requestedAt;
  idle.current = isIdle;

  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      if (!idle.current?.()) return;
      busy = true;
      try {
        if (updateRequested(req.current)) { await applyUpdate(req.current); return; }
        if (isCharging() && (await newerVersionPublished()) && idle.current?.()) await applyUpdate();
      } finally { busy = false; }
    };
    const t = setInterval(tick, CHECK_EVERY_MS);
    return () => clearInterval(t);
  }, []);
}
