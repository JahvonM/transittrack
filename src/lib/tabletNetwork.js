// Admin → Kiosk tablets can ask a boarding tablet to scan for Wi-Fi or join a
// network, and a driver tablet to keep its hotspot on all the time. The server
// hands the command to this page on a check-in (`network_command`); the page
// passes it to the TransitTrack Helper app on the tablet (127.0.0.1:8765,
// Helper 1.9+) using the key the helper gave this page (window.__ttHelperKey),
// then confirms on the next check-in (`network_ack`) so the server deletes the
// command, including any Wi-Fi password. Nothing about it is saved on the tablet
// by this page. See base44/shared/tabletNetwork.ts.

export const HELPER_URL = "http://127.0.0.1:8765";
const ID = /^[A-Za-z0-9_-]{8,64}$/;

let ack = null;           // command id to confirm on the next check-in
const done = new Set();   // ids already passed to the helper since this page opened

export function helperKey() {
  try {
    const k = typeof window !== "undefined" ? window.__ttHelperKey : null;
    return typeof k === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(k) ? k : "";
  } catch {
    return "";
  }
}

// The helper address for a command, or null if it isn't one this page sends.
export function networkCommandUrl(cmd, key) {
  if (!cmd || typeof cmd !== "object" || !ID.test(cmd.id || "") || !key) return null;
  const q = new URLSearchParams({ id: cmd.id, k: key });
  if (cmd.type === "wifi_scan") return `${HELPER_URL}/wifi/scan?${q}`;
  if (cmd.type === "wifi_join" && typeof cmd.ssid === "string" && cmd.ssid) {
    q.set("ssid", cmd.ssid);
    q.set("pass", typeof cmd.password === "string" ? cmd.password : "");
    return `${HELPER_URL}/wifi/join?${q}`;
  }
  if (cmd.type === "hotspot" && typeof cmd.always_on === "boolean") {
    q.set("always", cmd.always_on ? "1" : "0");
    return `${HELPER_URL}/hotspot?${q}`;
  }
  return null;
}

// Passes a check-in's command to the helper. Returns what happened:
// "none" (nothing pending), "sent", "already" (sent earlier, still confirming),
// "no-helper" (no Helper 1.9 on this tablet: not confirmed, so the server lets
// it expire and Admin can say so), "unreachable" or "invalid".
export async function handleNetworkCommand(cmd, { fetchImpl = (url, opts) => fetch(url, opts), key = helperKey() } = {}) {
  if (!cmd) { ack = null; return "none"; }
  if (typeof cmd !== "object" || !ID.test(cmd.id || "")) return "invalid";
  if (done.has(cmd.id)) { ack = cmd.id; return "already"; }
  if (!key) return "no-helper";
  const url = networkCommandUrl(cmd, key);
  if (!url) return "invalid";
  try {
    await fetchImpl(url, { mode: "no-cors", cache: "no-store" });
  } catch {
    return "unreachable";
  }
  done.add(cmd.id);
  ack = cmd.id;
  return "sent";
}

// Add to the next check-in so the server deletes the command it handed over.
export function networkAckPayload() {
  return ack ? { network_ack: ack } : {};
}

// A check-in reply without the command, for saving on the tablet.
export function withoutNetworkCommand(data) {
  if (!data || typeof data !== "object") return data;
  const { network_command: _command, ...rest } = data;
  return rest;
}

// Tests only.
export function resetNetworkState() {
  ack = null;
  done.clear();
}
