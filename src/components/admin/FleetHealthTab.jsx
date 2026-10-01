import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Activity, AlertTriangle, BatteryLow, Bus, CloudUpload, CreditCard, MapPinOff, RefreshCw, TabletSmartphone } from "lucide-react";
import { APP_BUILD } from "@/lib/appHealth";

// One screen for "is everything working out there?": per bus, how fresh its
// GPS is, whether its driver and boarding tablets are checking in, the card
// reader, battery, work waiting to upload, which app version each tablet
// runs, and app errors from those tablets in the last 24 hours. Refreshes
// every 30 seconds.
const REFRESH_MS = 30000;
const TRACKING = new Set(["on_trip", "speeding", "emergency"]);
const READER_OK = /^(connected|fix|paused|card reader off|gps off)/i;

const minsSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity);
function ago(iso) {
  const m = minsSince(iso);
  if (m === Infinity) return "never";
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

const TONE = {
  ok: { dot: "bg-green-500", text: "text-foreground" },
  warn: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  bad: { dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
  idle: { dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};
function Cell({ s }) {
  if (!s) return <span className="text-xs text-muted-foreground">—</span>;
  const t = TONE[s.tone] || TONE.idle;
  return (
    <div className="min-w-0">
      <p className={`flex items-center gap-1.5 text-sm font-medium ${t.text}`}><span className={`w-2 h-2 rounded-full shrink-0 ${t.dot}`} />{s.text}</p>
      {s.sub && <p className="text-xs text-muted-foreground truncate pl-3.5">{s.sub}</p>}
    </div>
  );
}

function gpsStatus(v) {
  if (!v.last_location_update) return { tone: "idle", text: "No GPS yet" };
  const m = minsSince(v.last_location_update);
  if (!TRACKING.has(v.status)) return { tone: "idle", text: "Not tracking", sub: `last position ${ago(v.last_location_update)}` };
  if (m < 2) return { tone: "ok", text: "Live", sub: `updated ${ago(v.last_location_update)}` };
  if (m < 10) return { tone: "warn", text: `No update for ${Math.floor(m)} min`, sub: "weak signal or app closed" };
  return { tone: "bad", text: "GPS lost", sub: `last ${ago(v.last_location_update)} while tracking` };
}

function tabletStatus(d, kind) {
  if (!d) return { tone: "idle", text: kind === "driver" ? "No driver tablet" : "No boarding tablet" };
  const h = d.helper_health || {};
  const a = d.app_health || {};
  const m = minsSince(d.last_seen);
  const extra = [];
  if (typeof h.battery === "number") extra.push(`battery ${h.battery}%${h.charging ? " ⚡" : ""}`);
  if (a.build && a.build !== APP_BUILD) extra.push("older version");
  const sub = [d.label, ...extra].filter(Boolean).join(" · ");
  if (h.parked && m >= 2) return { tone: "idle", text: "Parked", sub };
  if (m < 2) return { tone: a.online === false ? "warn" : "ok", text: a.online === false ? "No internet" : "Online", sub };
  if (m < 30) return { tone: "warn", text: `Not seen ${Math.floor(m)} min`, sub };
  return { tone: "bad", text: m === Infinity ? "Never connected" : `Offline ${ago(d.last_seen)}`, sub };
}

function readerStatus(d) {
  if (!d) return null;
  const h = d.helper_health || {};
  const a = d.app_health || {};
  if (h.reader) {
    const ok = READER_OK.test(h.reader);
    return { tone: ok ? "ok" : "bad", text: ok ? "Reader OK" : `Reader: ${h.reader}`, sub: h.last_card_at ? `last card ${ago(h.last_card_at)}` : undefined };
  }
  if (a.reader === "usb_reader" || a.reader === "pc_helper") return { tone: "ok", text: "USB reader", sub: a.saved_list_at ? `staff list ${ago(a.saved_list_at)}` : undefined };
  if (a.reader === "built_in_nfc") return { tone: "ok", text: "Built-in NFC", sub: a.saved_list_at ? `staff list ${ago(a.saved_list_at)}` : undefined };
  return { tone: "idle", text: "Unknown", sub: "keypad codes still work" };
}

export default function FleetHealthTab({ vehicles = [] }) {
  const [devices, setDevices] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loadedAt, setLoadedAt] = useState(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fleet, setFleet] = useState(vehicles);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const since = Date.now() - 24 * 3600000;
      const [d, e, v] = await Promise.all([
        base44.entities.KioskDevice.list("-last_seen", 500),
        base44.entities.ClientError.list("-created_date", 300).catch(() => []),
        base44.entities.Vehicle.list("-updated_date", 500).catch(() => null),
      ]);
      setDevices(d || []);
      setErrors((e || []).filter((x) => new Date(x.created_date).getTime() >= since));
      if (v) setFleet(v);
      setLoadedAt(new Date());
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, [load]);

  const rows = useMemo(() => {
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
      };
      const lowBattery = [driver, boarding].some((d) => typeof d?.helper_health?.battery === "number" && d.helper_health.battery <= 20 && !d.helper_health.charging);
      const problem = Object.values(cells).some((c) => c && (c.tone === "bad" || c.tone === "warn")) || waiting > 0 || errs > 0 || lowBattery;
      return { v, driver, boarding, waiting, errs, cells, lowBattery, problem };
    }).sort((a, b) => Number(b.problem) - Number(a.problem) || (a.v.name || "").localeCompare(b.v.name || "", undefined, { numeric: true }));
  }, [fleet, devices, errors]);

  const shown = problemsOnly ? rows.filter((r) => r.problem) : rows;
  const tiles = [
    { label: "Tracking live", value: rows.filter((r) => r.cells.gps.tone === "ok").length, icon: Activity, tone: "ok" },
    { label: "GPS lost / late", value: rows.filter((r) => ["bad", "warn"].includes(r.cells.gps.tone)).length, icon: MapPinOff, tone: "bad" },
    { label: "Tablets offline", value: rows.reduce((n, r) => n + ["driver", "boarding"].filter((k) => (r[k] && r.cells[k].tone === "bad")).length, 0), icon: TabletSmartphone, tone: "bad" },
    { label: "Card reader problems", value: rows.filter((r) => r.cells.reader?.tone === "bad").length, icon: CreditCard, tone: "bad" },
    { label: "Waiting to upload", value: rows.reduce((n, r) => n + r.waiting, 0), icon: CloudUpload, tone: "warn" },
    { label: "App errors (24 h)", value: errors.length, icon: AlertTriangle, tone: "bad" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Activity className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Fleet health</h2>
        <span className="text-xs text-muted-foreground">Updated {loadedAt ? loadedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "…"} · refreshes every 30 s · current version {APP_BUILD}</span>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={problemsOnly} onCheckedChange={setProblemsOnly} aria-label="Problems only" /> Problems only</label>
          <Button variant="ghost" size="icon" onClick={load} disabled={busy} aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {tiles.map((t) => {
          const Icon = t.icon;
          const alert = t.value > 0 && t.tone !== "ok";
          return (
            <div key={t.label} className={`rounded-2xl border p-3 ${alert ? (t.tone === "warn" ? "border-amber-500/50 bg-amber-500/10" : "border-rose-500/50 bg-rose-500/10") : "bg-card"}`}>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5" /> {t.label}</p>
              <p className="text-2xl font-bold tabular-nums mt-0.5">{t.value}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Bus</th>
              <th className="px-3 py-2 font-medium">GPS</th>
              <th className="px-3 py-2 font-medium">Driver tablet</th>
              <th className="px-3 py-2 font-medium">Boarding tablet</th>
              <th className="px-3 py-2 font-medium">Card reader</th>
              <th className="px-3 py-2 font-medium">Waiting</th>
              <th className="px-3 py-2 font-medium">Errors 24 h</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">{problemsOnly ? "No problems right now." : "No buses yet."}</td></tr>
            )}
            {shown.map((r) => (
              <tr key={r.v.id} className={`border-b last:border-0 align-top ${r.problem ? "" : "opacity-90"}`}>
                <td className="px-3 py-2.5">
                  <p className="font-medium flex items-center gap-1.5"><Bus className="w-4 h-4 text-muted-foreground" />{r.v.name}</p>
                  <p className="text-xs text-muted-foreground pl-5.5">{[r.v.fleet_number, r.v.driver_name].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-3 py-2.5"><Cell s={r.cells.gps} /></td>
                <td className="px-3 py-2.5"><Cell s={r.cells.driver} /></td>
                <td className="px-3 py-2.5"><Cell s={r.cells.boarding} /></td>
                <td className="px-3 py-2.5"><Cell s={r.cells.reader} /></td>
                <td className="px-3 py-2.5">
                  {r.waiting > 0
                    ? <Cell s={{ tone: "warn", text: `${r.waiting} item${r.waiting === 1 ? "" : "s"}`, sub: "saved offline, will upload" }} />
                    : <span className="text-xs text-muted-foreground">Nothing</span>}
                  {r.lowBattery && <p className="text-xs text-rose-600 flex items-center gap-1 mt-1"><BatteryLow className="w-3.5 h-3.5" /> Low battery</p>}
                </td>
                <td className="px-3 py-2.5">
                  {r.errs > 0 ? <Cell s={{ tone: "bad", text: `${r.errs}`, sub: "see Data manager → ClientError" }} /> : <span className="text-xs text-muted-foreground">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Battery and card-reader details come from the TransitTrack Helper app on each tablet; uploads waiting and app version come from TransitTrack itself.
        A tablet showing “older version” picks up the new one next time it reloads with internet.
      </p>
    </div>
  );
}
