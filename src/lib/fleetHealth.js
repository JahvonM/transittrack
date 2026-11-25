import { APP_BUILD } from "@/lib/appHealth";

// "Is everything working out there?", per bus: how fresh its GPS is, whether
// its driver and boarding tablets are checking in, the card reader, the USB
// GPS module, battery, work waiting to upload, the app version each tablet
// runs and app errors from those tablets in the last 24 hours.
// Used by Admin → Live fleet: each bus's panel and the Fleet health table.

const TRACKING = new Set(["on_trip", "speeding", "emergency"]);
const READER_OK = /^(connected|fix|paused|card reader off|gps off)/i;

export const minsSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity);
export function ago(iso) {
  const m = minsSince(iso);
  if (m === Infinity) return "never";
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

export function gpsStatus(v) {
  if (!v.last_location_update) return { tone: "idle", text: "No GPS yet" };
  const m = minsSince(v.last_location_update);
  if (!TRACKING.has(v.status)) return { tone: "idle", text: "Not tracking", sub: `last position ${ago(v.last_location_update)}` };
  if (m < 2) return { tone: "ok", text: "Live", sub: `updated ${ago(v.last_location_update)}` };
  if (m < 10) return { tone: "warn", text: `No update for ${Math.floor(m)} min`, sub: "weak signal or app closed" };
  return { tone: "bad", text: "GPS lost", sub: `last ${ago(v.last_location_update)} while tracking` };
}

export function tabletStatus(d, kind) {
  if (!d) return { tone: "idle", text: kind === "driver" ? "No driver tablet" : "No boarding tablet" };
  const h = d.helper_health || {};
  const a = d.app_health || {};
  const m = minsSince(d.last_seen);
  const extra = [];
  if (typeof h.battery === "number") extra.push(`battery ${h.battery}%${h.charging ? ", charging" : ""}`);
  if (h.battery_temperature >= 45) extra.push("battery hot");
  if (h.free_storage_mb < 200) extra.push("storage almost full");
  if (a.build && a.build !== APP_BUILD) extra.push("older version");
  const sub = [d.label, ...extra].filter(Boolean).join(" · ");
  if (h.parked && m >= 2) return { tone: "idle", text: "Parked", sub };
  if (m < 2 && (h.battery_temperature >= 45 || h.free_storage_mb < 200)) return { tone: "warn", text: "Needs attention", sub };
  if (m < 2) return { tone: a.online === false ? "warn" : "ok", text: a.online === false ? "No internet" : "Online", sub };
  if (m < 30) return { tone: "warn", text: `Not seen ${Math.floor(m)} min`, sub };
  return { tone: "bad", text: m === Infinity ? "Never connected" : `Offline ${ago(d.last_seen)}`, sub };
}

// The USB GPS module, as reported by the TransitTrack Helper app on
// whichever tablet it's plugged into.
export function gpsModuleStatus(...devices) {
  const d = devices.find((x) => x?.helper_health?.gps);
  if (!d) return { tone: "idle", text: "Not reported", sub: "no GPS module seen" };
  const h = d.helper_health;
  const g = String(h.gps);
  const sub = `${d.kiosk_type === "driver" ? "driver tablet" : "boarding tablet"} · ${ago(h.reported_at)}`;
  if (minsSince(h.reported_at) > 10) return { tone: "idle", text: "No recent report", sub };
  if (/^fix|connected|giving/i.test(g)) return { tone: "ok", text: "Working", sub: `${g} · ${sub}` };
  if (/searching/i.test(g)) return { tone: "warn", text: "Searching for satellites", sub };
  if (/off|paused/i.test(g)) return { tone: "idle", text: g, sub };
  return { tone: "bad", text: g, sub };
}

export function readerStatus(d) {
  if (!d) return null;
  const h = d.helper_health || {};
  const a = d.app_health || {};
  if (h.reader) {
    const ok = READER_OK.test(h.reader);
    return { tone: ok ? "ok" : "bad", text: ok ? "Reader OK" : `Reader: ${h.reader}`, sub: h.last_card_at ? `last card ${ago(h.last_card_at)}` : undefined };
  }
  if (a.reader === "usb_reader" || a.reader === "pc_helper") return { tone: "ok", text: "USB reader", sub: a.saved_list_at ? `passenger list ${ago(a.saved_list_at)}` : undefined };
  if (a.reader === "built_in_nfc") return { tone: "ok", text: "Built-in NFC", sub: a.saved_list_at ? `passenger list ${ago(a.saved_list_at)}` : undefined };
  return { tone: "idle", text: "Unknown", sub: "keypad codes still work" };
}

// One row per bus, buses with a problem first.
export function healthRows(fleet = [], devices = [], errors = []) {
  const active = devices.filter((d) => d.status === "active" && d.paired);
  const errorsBy = {};
  for (const e of errors) if (e.device_id) errorsBy[e.device_id] = (errorsBy[e.device_id] || 0) + 1;
  return fleet.map((v) => {
    const driver = active.find((d) => d.kiosk_type === "driver" && d.vehicle_id === v.id) || null;
    const boarding = active.find((d) => d.kiosk_type === "bus_boarding" && d.vehicle_id === v.id) || null;
    const waiting = [driver, boarding].reduce((n, d) => {
      const a = d?.app_health || {};
      return n + (a.queued_gps || 0) + (a.queued_checkins || 0) + (a.queued_jobs || 0);
    }, 0);
    const errs = (driver ? errorsBy[driver.id] || 0 : 0) + (boarding ? errorsBy[boarding.id] || 0 : 0);
    const cells = {
      gps: gpsStatus(v),
      driver: tabletStatus(driver, "driver"),
      boarding: tabletStatus(boarding, "boarding"),
      reader: readerStatus(boarding),
      gpsModule: gpsModuleStatus(driver, boarding),
    };
    const lowBattery = [driver, boarding].some((d) => typeof d?.helper_health?.battery === "number" && d.helper_health.battery <= 20 && !d.helper_health.charging);
    const problem = Object.values(cells).some((c) => c && (c.tone === "bad" || c.tone === "warn")) || waiting > 0 || errs > 0 || lowBattery;
    return { v, driver, boarding, waiting, errs, cells, lowBattery, problem };
  }).sort((a, b) => Number(b.problem) - Number(a.problem) || (a.v.name || "").localeCompare(b.v.name || "", undefined, { numeric: true }));
}

// The totals across the top of the Fleet health table.
export function healthTotals(rows, errors = []) {
  return [
    { key: "live", label: "Tracking live", value: rows.filter((r) => r.cells.gps.tone === "ok").length, tone: "ok" },
    { key: "gps", label: "GPS lost / late", value: rows.filter((r) => ["bad", "warn"].includes(r.cells.gps.tone)).length, tone: "bad" },
    { key: "tablets", label: "Tablets offline", value: rows.reduce((n, r) => n + ["driver", "boarding"].filter((k) => (r[k] && r.cells[k].tone === "bad")).length, 0), tone: "bad" },
    { key: "reader", label: "Card reader problems", value: rows.filter((r) => r.cells.reader?.tone === "bad").length, tone: "bad" },
    { key: "module", label: "GPS module problems", value: rows.filter((r) => r.cells.gpsModule.tone === "bad").length, tone: "bad" },
    { key: "waiting", label: "Waiting to upload", value: rows.reduce((n, r) => n + r.waiting, 0), tone: "warn" },
    { key: "errors", label: "App errors (24 h)", value: errors.length, tone: "bad" },
  ];
}
