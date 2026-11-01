// What the boarding tablet's Diagnostics screen shows about recent activity:
// when a card or code was last read and by what, when saved taps last reached
// the server, and the last problem. Never card numbers, codes or names.

const KEY = "tt_kiosk_diag_v1";
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const write = (patch) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch { /* storage full: diagnostics only */ } };

export const noteRead = (method) => write({ last_read_at: new Date().toISOString(), last_read_method: String(method || "").slice(0, 20) });
export const noteSync = () => write({ last_sync_at: new Date().toISOString() });
export const noteProblem = (code) => write({ last_problem: String(code || "").slice(0, 60), last_problem_at: new Date().toISOString() });
export const diagnostics = () => read();

export const READ_METHOD_TEXT = { nfc: "card", qr: "QR code", code: "keypad code", bluetooth: "phone (Bluetooth)" };

// Cameras the browser can see, without asking for permission (labels stay
// hidden until a camera has been used, but the count is known).
export async function cameraCount() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return null;
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").length;
  } catch { return null; }
}
