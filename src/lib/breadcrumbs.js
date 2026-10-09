// The last few things that happened in this tab before an error: pages
// visited, buttons tapped, server calls that failed, the connection dropping.
// Sent with an error report so Admin → App errors can show what the person was
// doing. Never records what anyone typed, and page addresses keep only the
// names of their ?parameters, never the values (they can carry codes).

const MAX = 25;
const trail = [];

export function addBreadcrumb(type, text) {
  try {
    trail.push({ t: new Date().toISOString(), type, text: String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 160) });
    if (trail.length > MAX) trail.shift();
  } catch { /* never break the app */ }
}

export const breadcrumbs = () => trail.slice();

// "/kiosk?code=ABC&x=1" -> "/kiosk?code&x"
export function safePath(pathname = "", search = "") {
  const keys = [...new URLSearchParams(search).keys()];
  return pathname + (keys.length ? "?" + keys.join("&") : "");
}

// Which part of TransitTrack a page belongs to.
export function appArea(pathname = "") {
  if (pathname.startsWith("/admin")) return "Admin";
  if (pathname.startsWith("/kiosk")) return "Boarding tablet";
  if (pathname.startsWith("/driver-phone")) return "Driver phone app";
  if (pathname.startsWith("/driver")) return "Driver tablet";
  if (pathname.startsWith("/company")) return "Company manager";
  if (pathname.startsWith("/mechanic") || pathname.startsWith("/run-inspection")) return "Mechanic";
  return "Passenger app";
}

// Which release of the app this is: the published file's name changes with
// every publish (e.g. "index-D9dBjP6p").
export function appVersion() {
  try {
    const src = [...document.querySelectorAll("script[type=module][src]")].map((s) => s.getAttribute("src")).find((s) => /\/assets\/index-/.test(s));
    return src ? src.split("/").pop().replace(/\.js$/, "") : "dev";
  } catch { return ""; }
}

function labelOf(el) {
  const text = el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.getAttribute("name") || "";
  return text.replace(/\s+/g, " ").trim().slice(0, 60);
}

let installed = false;
export function installBreadcrumbs() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const page = () => addBreadcrumb("page", safePath(window.location.pathname, window.location.search));
  page();
  for (const method of ["pushState", "replaceState"]) {
    const original = window.history[method];
    window.history[method] = function (...args) {
      const before = window.location.pathname;
      const result = original.apply(this, args);
      if (window.location.pathname !== before) page();
      return result;
    };
  }
  window.addEventListener("popstate", page);
  document.addEventListener("click", (e) => {
    const el = e.target?.closest?.("button, a, [role=button], [role=tab], [role=switch], [role=checkbox], [role=menuitem], summary");
    if (!el) return;
    const label = labelOf(el);
    addBreadcrumb("tap", label || el.tagName.toLowerCase());
  }, { capture: true, passive: true });
  window.addEventListener("offline", () => addBreadcrumb("network", "Went offline"));
  window.addEventListener("online", () => addBreadcrumb("network", "Back online"));
}
