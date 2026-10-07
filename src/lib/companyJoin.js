// Company join QR: the QR holds a link to /join with the company's existing
// access code after "#", so the code never reaches a server log. Scanning it
// only fills in the code; the passenger still signs in, and the code is
// checked by the same companyAccess "verify" step as typing it.
const KEY = "tt_pending_company_code";
const CODE = /^[A-Z0-9]{12}$/;

export function companyJoinUrl(code) {
  return `${window.location.origin}/join#code=${encodeURIComponent(code)}`;
}

// Reads #code= from the current URL, keeps it for this browser tab only,
// and removes it from the address bar.
export function captureJoinCode() {
  const raw = new URLSearchParams(window.location.hash.slice(1)).get("code");
  const code = String(raw || "").trim().toUpperCase();
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (!CODE.test(code)) return false;
  try { sessionStorage.setItem(KEY, code); } catch { return false; }
  return true;
}

export function hasPendingJoinCode() {
  try { return CODE.test(sessionStorage.getItem(KEY) || ""); } catch { return false; }
}

// Returns the pending code once and forgets it.
export function takePendingJoinCode() {
  try {
    const code = sessionStorage.getItem(KEY) || "";
    sessionStorage.removeItem(KEY);
    return CODE.test(code) ? code : "";
  } catch { return ""; }
}

// Reads the company code out of a scanned join QR (or a bare code). Returns
// "" for anything else; the app never opens the scanned link itself.
export function codeFromJoinQr(text) {
  const raw = String(text || "").trim();
  if (CODE.test(raw.toUpperCase())) return raw.toUpperCase();
  try {
    const url = new URL(raw);
    if (!/\/join\/?$/.test(url.pathname)) return "";
    const code = String(new URLSearchParams(url.hash.slice(1)).get("code") || "").trim().toUpperCase();
    return CODE.test(code) ? code : "";
  } catch { return ""; }
}

// Keeps a scanned company code for this browser tab until the passenger is
// signed in; StaffPortal then checks it once, like a typed code.
// Set when someone deliberately switches company, so the app never quietly puts
// them back into the company they just left. Cleared as soon as a code is verified.
const LEFT = "tt_company_left";

export function markCompanyLeft() {
  try { localStorage.setItem(LEFT, "1"); } catch { /* ignore */ }
}

export function hasLeftCompany() {
  try { return localStorage.getItem(LEFT) === "1"; } catch { return false; }
}

export function clearCompanyLeft() {
  try { localStorage.removeItem(LEFT); } catch { /* ignore */ }
}

export function rememberJoinCode(code) {
  const value = String(code || "").trim().toUpperCase();
  if (!CODE.test(value)) return false;
  try { sessionStorage.setItem(KEY, value); return true; } catch { return false; }
}