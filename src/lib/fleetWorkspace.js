import { onBoardCount } from "../../base44/shared/boardingEvents.ts";
import { protectionFromHealth } from "./kioskProtection";

// Admin → Fleet workspace: one line per bus and the alerts worth acting on,
// from data the console already loads. Counts are shown only where they can
// be trusted (a boarding tablet reporting); otherwise they say so.

const LIVE_MS = 2 * 60_000;
const TABLET_OK_MS = 15 * 60_000;
const ago = (iso, now) => (iso ? now - Date.parse(iso) : Infinity);

export function locationState(v, now = Date.now()) {
  const age = ago(v.last_location_update, now);
  if (v.tracking_active && age <= LIVE_MS) return { state: "live", at: v.last_location_update };
  if (v.last_location_update && Number.isFinite(age)) return { state: "last_known", at: v.last_location_update };
  return { state: "unavailable", at: null };
}

export function busSummaries({ vehicles = [], kiosks = [], checkIns = [], shifts = [], faults = [], inspections = [], now = Date.now() }) {
  return vehicles.map((v) => {
    const tablets = kiosks.filter((k) => k.vehicle_id === v.id && k.paired && k.status === "active");
    const boarding = tablets.filter((k) => k.kiosk_type === "bus_boarding");
    const driver = tablets.filter((k) => k.kiosk_type === "driver");
    const boardingLive = boarding.some((k) => ago(k.last_seen, now) <= TABLET_OK_MS);
    const byPerson = {};
    for (const r of checkIns) {
      if (r.vehicle_id !== v.id) continue;
      const key = r.person_key || r.card_tag || r.staff_name;
      if (key) (byPerson[key] ||= []).push({ status: r.status, at: r.boarded_at || r.created_date });
    }
    const shift = shifts.find((s) => s.vehicle_id === v.id && !s.ended_at) || null;
    const lastInspection = inspections.filter((i) => i.vehicle_id === v.id).sort((a, b) => String(b.inspection_date || b.created_date || "").localeCompare(String(a.inspection_date || a.created_date || "")))[0] || null;
    return {
      vehicle: v,
      location: locationState(v, now),
      shift,
      onBoard: boardingLive ? onBoardCount(byPerson, now) : null,
      onBoardWhy: boardingLive ? "" : boarding.length ? "Boarding tablet not reporting" : "No boarding tablet",
      boarding, driver,
      faults: faults.filter((f) => f.vehicle_id === v.id && f.status !== "resolved").length,
      lastInspection,
      protection: tablets.map((k) => ({ tablet: k, ...protectionFromHealth(k.helper_health) })),
    };
  });
}

// Alerts, most urgent first. Each says what is wrong and where to look.
export function fleetAlerts(summaries, { openRequests = 0, now = Date.now() } = {}) {
  const out = [];
  for (const s of summaries) {
    const v = s.vehicle, name = v.name || "Bus";
    if (v.status === "emergency") out.push({ tone: "danger", key: `sos:${v.id}`, text: `${name}: SOS from the driver`, go: "fleet" });
    if (s.shift && s.location.state !== "live") out.push({ tone: "warning", key: `gps:${v.id}`, text: `${name}: shift open but no live location${s.location.at ? ` since ${new Date(s.location.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`, go: "health" });
    for (const k of [...s.driver, ...s.boarding]) {
      const label = k.label || (k.kiosk_type === "driver" ? "Driver tablet" : "Boarding tablet");
      if (s.shift && ago(k.last_seen, now) > TABLET_OK_MS) out.push({ tone: "warning", key: `off:${k.id}`, text: `${name}: ${label} hasn't checked in for over 15 minutes`, go: "kiosks" });
      const h = k.helper_health || {};
      if (typeof h.battery === "number" && h.battery <= 20 && !h.charging) out.push({ tone: "warning", key: `bat:${k.id}`, text: `${name}: ${label} battery ${h.battery}%, not charging`, go: "health" });
      if ((k.app_health?.queued_checkins || 0) > 0 && ago(k.last_seen, now) > TABLET_OK_MS) out.push({ tone: "info", key: `queue:${k.id}`, text: `${name}: ${label} has ${k.app_health.queued_checkins} tap${k.app_health.queued_checkins === 1 ? "" : "s"} waiting to send`, go: "kiosks" });
    }
    for (const p of s.protection) if (p.tone === "failed") out.push({ tone: "danger", key: `lock:${p.tablet.id}`, text: `${name}: ${p.tablet.label || "tablet"} kiosk protection failed`, go: "kiosks" });
    if (s.faults > 0) out.push({ tone: "info", key: `faults:${v.id}`, text: `${name}: ${s.faults} open fault${s.faults === 1 ? "" : "s"}`, go: "faults" });
  }
  const unprotected = summaries.flatMap((s) => s.protection).filter((p) => ["setup", "limited"].includes(p.tone)).length;
  if (unprotected) out.push({ tone: "info", key: "unprotected", text: `${unprotected} tablet${unprotected === 1 ? " isn't" : "s aren't"} fully locked to the app`, go: "kiosks" });
  if (openRequests > 0) out.push({ tone: "info", key: "requests", text: `${openRequests} passenger request${openRequests === 1 ? "" : "s"} waiting`, go: "support" });
  const rank = { danger: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// Driver tablets whose road-facing camera can be viewed (the McSween kiosk
// app's direct viewing). Boarding tablets' QR cameras are never offered.
export const cameraTablets = (kiosks = []) => kiosks.filter((k) => k.kiosk_type === "driver" && !k.personal && k.paired && k.status === "active"
  && k.helper_health?.support_available === true && k.helper_health?.support_transport === "webrtc");
