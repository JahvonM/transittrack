// Wording for the driver tablet's Internet settings, from the TransitTrack
// Helper's status report (window.__ttHelperHealth, Helper 1.11+):
//   wifi:    { enabled, ssid, bars, networks, scanned_at, join }
//   mobile:  { sim: "ready"|"none"|"not ready", data, connected, type, operator, bars }
//   hotspot: "On" | "Off (on Wi-Fi Depot)" | ...    hotspot_always: true|false

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function wifiStatus(h) {
  const w = obj(obj(h).wifi);
  const ssid = typeof w.ssid === "string" ? w.ssid : "";
  const enabled = typeof w.enabled === "boolean" ? w.enabled : !!ssid;
  const bars = Number.isFinite(w.bars) ? w.bars : 0;
  const text = ssid ? `Connected to ${ssid}` : enabled ? "On, not connected to a network" : "Off";
  return { enabled, ssid, bars, text };
}

export function mobileStatus(h) {
  const m = obj(obj(h).mobile);
  const wifiOn = !!wifiStatus(h).ssid;
  const bars = Number.isFinite(m.bars) ? m.bars : null;
  const via = [m.operator, m.type].filter((s) => typeof s === "string" && s).join(" · ");
  if (!Object.keys(m).length) return { tone: "unknown", text: "Not reported yet", bars: null };
  if (m.sim === "none") return { tone: "bad", text: "No SIM card in this tablet", bars: null };
  if (m.sim === "not ready") return { tone: "unknown", text: "SIM card starting up…", bars: null };
  if (m.data === false) return { tone: "bad", text: "Off. Run Update with the setup tool on a computer to switch it on.", bars };
  if (m.connected) return { tone: "ok", text: `On${via ? ` · ${via}` : ""}`, bars };
  if (wifiOn) return { tone: "ok", text: `On${m.operator ? ` · ${m.operator}` : ""} · standing by while Wi-Fi is used`, bars };
  return { tone: "warn", text: `On, but not connected${m.operator ? ` (${m.operator})` : ""}. Check the signal and the SIM's credit.`, bars };
}

export function hotspotStatus(h) {
  const o = obj(h);
  if (typeof o.hotspot !== "string") return null;
  return { text: o.hotspot, always: o.hotspot_always === true };
}

// The scan list, only if the helper finished a scan after `since` (ms).
export function freshNetworks(h, since) {
  const w = obj(obj(h).wifi);
  const at = Date.parse(w.scanned_at || "");
  if (!Number.isFinite(at) || at < since - 2000) return null;
  return Array.isArray(w.networks)
    ? w.networks.filter((n) => n && typeof n.ssid === "string" && n.ssid)
    : [];
}

// The helper's latest join attempt, if it is the one this screen asked for.
export function joinFor(h, id) {
  const j = obj(obj(obj(h).wifi).join);
  return id && j.id === id ? j : null;
}
