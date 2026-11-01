import { busSummaries, fleetAlerts, locationState } from "./fleetWorkspace";

// Office displays (/display): the screen's own rules, separate from what the
// server decides it may see (base44/shared/officeDisplay.ts). Plain logic so
// it can be tested without a browser.

export const LAYOUT_NAMES = { fleet: "Fleet overview", cameras: "Cameras + map", dispatch: "Dispatch board", maintenance: "Maintenance board" };
export const TOKEN_KEY = "tt-office-display-v1";
// A feed older than this is "delayed": the screen says so in plain words.
export const DELAYED_MS = 45_000;
// Past this without a successful update the screen hides what it was showing
// (bounded offline): an old picture of the fleet never stays up for hours.
export const HIDE_AFTER_MS = 15 * 60_000;
const BACKOFF = [5_000, 10_000, 20_000, 30_000, 60_000];
const TEXT_SCALE = { normal: 1, large: 1.15, xlarge: 1.32 };

// The base text size for the whole screen, from its size in CSS pixels. The
// layouts are sized in rem, so a 1080p TV, a 4K TV and Windows scaling all
// show the same layout, just sharper or larger.
export function baseFontPx(width, height, textSize = "large") {
  const fit = Math.min(width / 96, height / 54);
  return Math.round(Math.min(44, Math.max(13, fit)) * (TEXT_SCALE[textSize] || 1) * 10) / 10;
}

export function retryDelay(failures) {
  return BACKOFF[Math.min(Math.max(failures - 1, 0), BACKOFF.length - 1)];
}

// How current the screen is, for the header and the warning banner.
export function connection({ lastOkAt, failures = 0, now = Date.now(), online = true }) {
  if (!lastOkAt) return { state: failures ? "offline" : "connecting", ageMs: null };
  const ageMs = Math.max(0, now - lastOkAt);
  if (ageMs > HIDE_AFTER_MS) return { state: "hidden", ageMs };
  if (!online || (failures > 0 && ageMs > DELAYED_MS)) return { state: "offline", ageMs };
  if (ageMs > DELAYED_MS) return { state: "delayed", ageMs };
  return { state: "live", ageMs };
}

// Layouts this screen shows in turn. Cameras never rotate in.
export function rotation(display) {
  if (!display) return ["fleet"];
  const list = (display.rotate_layouts || []).filter((l) => ["fleet", "dispatch", "maintenance"].includes(l));
  return display.rotate && display.layout !== "cameras" && list.length >= 2 ? list : [display.layout || "fleet"];
}

export function readStoredToken(storage) {
  try {
    const raw = storage?.getItem(TOKEN_KEY);
    const token = raw ? JSON.parse(raw)?.token : null;
    return typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ? token : null;
  } catch { return null; }
}
export function storeToken(storage, token) {
  try { storage?.setItem(TOKEN_KEY, JSON.stringify({ token, at: Date.now() })); } catch { /* storage unavailable */ }
}
export function forgetToken(storage) {
  try { storage?.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
}

// One row per bus for the fleet overview, using the fleet workspace's own
// rules for live/last-known location and the on-board count.
export function fleetRows(feed, now = Date.now()) {
  if (!feed?.vehicles) return [];
  const summaries = busSummaries({ vehicles: feed.vehicles, kiosks: feed.tablets || [], checkIns: (feed.boardings || []).map((b) => ({ ...b, person_key: b.person, boarded_at: b.at })), shifts: feed.shifts || [], now });
  const jobs = feed.jobs || [];
  return summaries.map((s) => {
    const v = s.vehicle;
    const job = jobs.find((j) => j.vehicle_id === v.id && ["on_the_way", "arrived"].includes(j.status)) || null;
    const driver = s.driver[0] || null;
    const tabletAge = driver?.last_seen ? now - Date.parse(driver.last_seen) : null;
    return {
      id: v.id, name: v.name, plate: v.plate_number || v.fleet_number || "", status: v.status, inService: v.in_service !== false,
      location: s.location, onBoard: s.onBoard, onBoardWhy: s.onBoardWhy,
      driverName: s.shift?.driver_name || v.driver_name || "", shiftOpen: !!s.shift,
      tablet: driver ? { ok: tabletAge != null && tabletAge <= 15 * 60_000, ageMs: tabletAge, battery: driver.helper_health?.battery ?? null, charging: !!driver.helper_health?.charging } : null,
      job: job ? { kind: job.kind, to: job.dropoff_name, status: job.status } : null,
    };
  }).sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
}
const rank = (r) => (r.status === "emergency" ? 0 : r.location.state === "live" ? 1 : r.location.state === "last_known" ? 2 : r.inService ? 3 : 4);

// Alerts a wall screen can stand behind: the ones built from data it was sent.
const DISPLAY_ALERTS = /^(sos|gps|off|bat):/;
export function displayAlerts(feed, now = Date.now()) {
  if (!feed?.vehicles) return [];
  const summaries = busSummaries({ vehicles: feed.vehicles, kiosks: feed.tablets || [], shifts: feed.shifts || [], now });
  return fleetAlerts(summaries, { now }).filter((a) => DISPLAY_ALERTS.test(a.key));
}

export function fleetCounts(feed, now = Date.now()) {
  const vehicles = feed?.vehicles || [];
  const jobs = feed?.jobs || [];
  const states = vehicles.map((v) => locationState(v, now).state);
  return {
    live: states.filter((s) => s === "live").length,
    lastKnown: states.filter((s) => s === "last_known").length,
    noLocation: states.filter((s) => s === "unavailable").length,
    underWay: jobs.filter((j) => ["on_the_way", "arrived"].includes(j.status)).length,
    pastTime: jobs.filter((j) => j.past_time_not_started).length,
    outOfService: vehicles.filter((v) => v.in_service === false).length,
  };
}

// The dispatch board: what is late (a fact: past its time, not started), what
// is moving, what comes next, and how many are done today.
export function dispatchColumns(jobs = [], now = Date.now()) {
  const t = (j) => Date.parse(j.scheduled_time || "") || 0;
  return {
    pastTime: jobs.filter((j) => j.past_time_not_started).sort((a, b) => t(a) - t(b)),
    underWay: jobs.filter((j) => ["on_the_way", "arrived"].includes(j.status)).sort((a, b) => t(a) - t(b)),
    next: jobs.filter((j) => j.status === "scheduled" && !j.past_time_not_started && t(j) >= now - 60_000).sort((a, b) => t(a) - t(b)),
    done: jobs.filter((j) => j.status === "completed").length,
  };
}

export const JOB_STATUS = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  on_the_way: { label: "On the way", tone: "live" },
  arrived: { label: "At pickup", tone: "info" },
  completed: { label: "Done", tone: "success" },
};

export function progressText(job) {
  if (job.dropoff_confirmed) return "Drop-off confirmed";
  if (job.pickup_confirmed) return "Picked up, heading to drop-off";
  if (job.status === "arrived") return "Waiting at pickup";
  if (job.status === "on_the_way") return "Driving to pickup";
  return "";
}

export const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
export function minutesLeft(expiresAt, now = Date.now()) {
  const ms = Date.parse(expiresAt || "") - now;
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 60_000)) : 0;
}
