// Sign-up day iPads (pages/SignupKiosk.jsx, functions signupKiosk).

export const KIOSK_KEY = "tt_signup_kiosk";
// How often the iPad asks what the admin has put on screen.
export const POLL_MS = 2000;
// Walked away half-way: their details are cleared after this long untouched.
export const IDLE_MS = 60_000;

// This iPad's saved connection, or null.
export function readKiosk(storage = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    const k = JSON.parse(storage?.getItem(KIOSK_KEY) || "null");
    return k && typeof k.device_id === "string" && /^[a-f0-9]{64}$/.test(k.device_token || "") ? { device_id: k.device_id, device_token: k.device_token } : null;
  } catch { return null; }
}

// What the admin's live view gets: the step, and what has been typed so far.
export function liveDraft(step, form = {}, pickup = {}) {
  return { step, draft: { name: form.name || "", email: form.email || "", phone: form.phone || "", employee_id: form.employee_id || "", pickup_name: pickup.name || "" } };
}

// A new "Back to start" from the admin (not the same one seen again).
export const screenChanged = (seenAt, screen) => !!screen?.at && screen.at !== seenAt;

// The QR link an iPad opens to connect (Admin → Sign-up iPads → Add an iPad).
export const pairLink = (origin, code) => `${origin}/kiosk/signup#pair=${encodeURIComponent(code)}`;
