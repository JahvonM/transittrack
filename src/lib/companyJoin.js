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
