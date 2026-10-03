// Keeps bus tablets (driver + boarding) on the newest version without anyone
// touching them:
//  - automatically, when a newer version is published and the tablet is
//    charging and nobody is using it;
//  - on request, when an admin presses "Send update" in Admin → Kiosk tablets
//    (applied the next time the tablet is idle, charging or not).
// "Updating" is just reloading the page while online: pages load network-first
// (public/sw.js), so the reload picks up the new version. Anything waiting to
// upload is kept in the tablet's storage and survives the reload.
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

export async function applyUpdate(requestedAt) {
  try { localStorage.setItem(APPLIED_KEY, requestedAt || new Date().toISOString()); } catch { /* ignore */ }
  try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* ignore */ }
  window.location.reload();
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
