// A one-off destination for the tablet's in-app directions: "Directions to
// <passenger>" in the passenger list sets it, the Drive map takes the driver
// there instead of the next route stop, and it clears on arrival or when the
// driver ends navigation. Kept for this session so changing screens keeps it.

const KEY = "tt_nav_target";
const EVENT = "tt-nav-target";

export function getNavTarget() {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return t && Number.isFinite(t.lat) && Number.isFinite(t.lng) ? t : null;
  } catch { return null; }
}

export function setNavTarget(target) {
  const t = target && Number.isFinite(Number(target.lat)) && Number.isFinite(Number(target.lng))
    ? { name: String(target.name || "Pickup").slice(0, 80), lat: Number(target.lat), lng: Number(target.lng) }
    : null;
  try { if (t) sessionStorage.setItem(KEY, JSON.stringify(t)); else sessionStorage.removeItem(KEY); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: t }));
}

export const clearNavTarget = () => setNavTarget(null);

export function onNavTarget(fn) {
  const handler = (e) => fn(e.detail || null);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
