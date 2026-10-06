import { useEffect } from "react";

// Kiosk and driver tablets run TransitTrack inside FreeKiosk. A link to any
// other website (map attribution, a phone number, a pasted URL in a chat
// message, window.open) must not take the tablet away from TransitTrack, so
// only pages on this site may open.
export function isOtherSite(href, base = window.location.href, allow = []) {
  if (href == null || href === "") return false;
  let url;
  try { url = new URL(String(href), base); } catch { return true; }
  if (url.protocol === "blob:") return false;
  if (url.origin === new URL(base).origin) return false;
  return !allow.some(ok => ok(url));
}

// Driver tablets keep their existing hand-offs: SOS and pickup messages on
// WhatsApp, and directions in Google Maps.
export const DRIVER_ALLOWED = [
  url => url.protocol === "https:" && (url.hostname === "wa.me" || url.hostname === "api.whatsapp.com"),
  url => url.protocol === "https:" && url.hostname === "www.google.com" && url.pathname.startsWith("/maps"),
];

const NOTICE_ID = "tt-link-blocked";
function showBlockedNotice() {
  if (typeof document === "undefined" || !document.body) return;
  let el = document.getElementById(NOTICE_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = NOTICE_ID;
    el.setAttribute("role", "status");
    el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;"
      + "background:#111827;color:#fff;padding:12px 18px;border-radius:12px;font:500 15px/1.4 system-ui,sans-serif;"
      + "box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:calc(100vw - 32px);text-align:center;pointer-events:none";
    document.body.appendChild(el);
  }
  el.textContent = "Other websites can't be opened on this tablet.";
  clearTimeout(el.__ttTimer);
  el.__ttTimer = setTimeout(() => el.remove(), 3000);
}

export function installLinkLock(win = window, allow = []) {
  const doc = win.document;
  const block = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showBlockedNotice();
  };
  const onClick = (e) => {
    const link = e.target?.closest?.("a[href], area[href]");
    if (link && isOtherSite(link.getAttribute("href"), win.location.href, allow)) block(e);
  };
  const onSubmit = (e) => {
    const form = e.target;
    const action = e.submitter?.getAttribute?.("formaction") || form?.getAttribute?.("action");
    if (action && isOtherSite(action, win.location.href, allow)) block(e);
  };
  const originalOpen = win.open;
  win.open = function (url, ...rest) {
    if (url != null && url !== "" && isOtherSite(url, win.location.href, allow)) {
      showBlockedNotice();
      return null;
    }
    return originalOpen.call(win, url, ...rest);
  };
  // Capture phase, so it runs before any component's own click handler.
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("auxclick", onClick, true);
  doc.addEventListener("submit", onSubmit, true);
  return () => {
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("auxclick", onClick, true);
    doc.removeEventListener("submit", onSubmit, true);
    if (win.open !== originalOpen) win.open = originalOpen;
  };
}

const NONE = [];
export function useBlockOtherSites(enabled = true, allow = NONE) {
  useEffect(() => (enabled ? installLinkLock(window, allow) : undefined), [enabled, allow]);
}
