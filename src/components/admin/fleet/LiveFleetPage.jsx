import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, BarChart3, Bus, ChevronRight, Film, History, Lock, MapPin, Search, Users, Video } from "lucide-react";
import { base44 } from "@/api/base44Client";
import useAdminFocus from "@/hooks/useAdminFocus";
import useUserLocation from "@/hooks/useUserLocation";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageActions, StatusChip } from "@/components/admin/kit";
import { cn } from "@/lib/utils";
import { computeOccupancyByVehicle } from "@/lib/occupancy";
import { busNumber, busStatusLine, sortStops } from "@/components/passenger/passengerState";
import { fleetStatus, StatusPill } from "@/components/admin/AdminOverview";
import LocationReplay from "@/components/replay/LocationReplay";
import { drawnRoad } from "@/lib/routeRoad";
import { busSummaries, cameraTablets, fleetAlerts } from "@/lib/fleetWorkspace";
import { healthRows } from "@/lib/fleetHealth";
import BusPanel from "@/components/admin/fleet/BusPanel";
import CameraWall, { SavedClips } from "@/components/admin/fleet/CameraWall";
import FleetHealthTable from "@/components/admin/fleet/FleetHealthTable";

const LiveTransitMap = lazy(() => import("@/components/map3d/LiveTransitMap"));

const FILTERS = [
  { id: "all", label: "Buses", test: () => true },
  { id: "live", label: "On route", test: (k) => ["live", "stale", "speed"].includes(k) },
  { id: "issues", label: "Issues", test: (k) => ["sos", "speed", "lost", "stale", "out"].includes(k) },
  { id: "idle", label: "Not tracking", test: (k) => k === "idle" },
];
const ORDER = { sos: 0, speed: 1, lost: 2, stale: 3, live: 4, out: 5, idle: 6 };
const REPORTS = [
  { to: "driving-reports", title: "Driving reports", sub: "Speeding, harsh braking and driving events" },
  { to: "fleet-analytics", title: "Fleet analytics", sub: "Distance, hours and use per bus" },
  { to: "route-analytics", title: "Route analytics", sub: "How each route runs" },
  { to: "vehicle-logs", title: "Vehicle logs", sub: "Where each bus has been" },
  { to: "ride-history", title: "Ride history", sub: "Trips and jobs" },
  { to: "checkins", title: "Boarding log", sub: "Card, QR and code taps" },
];
const HEALTH_MS = 30_000;
const SHIFTS_MS = 60_000;
const TONE_FG = { warning: "text-warning", danger: "text-danger" };
const SHEET_OF = { "fleet-workspace": "cameras", health: "health", "location-timeline": "history" };

// A number at the top that also filters the list (or opens what it counts).
function Tile({ label, value, tone, on, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn("min-w-0 rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-foreground/20 bg-accent" : "border-border")}>
      <span className="block truncate text-caption font-semibold text-muted-foreground">{label}</span>
      <span className={cn("mt-1 block font-display text-[1.75rem] font-semibold leading-none tabular-nums", value > 0 && TONE_FG[tone])}>{value}</span>
    </button>
  );
}

// What needs attention across the fleet. A bus's own alert opens that bus.
function AlertList({ alerts, limit, onOpenBus, busOf }) {
  if (alerts.length === 0) return <p className="px-4 py-6 text-center text-body-sm text-muted-foreground">Nothing needs attention right now.</p>;
  return (
    <ul className="divide-y divide-border" aria-label="Fleet alerts">
      {alerts.slice(0, limit || alerts.length).map((a) => {
        const chip = <StatusChip tone={a.tone}>{a.tone === "danger" ? "Urgent" : a.tone === "warning" ? "Check" : "Note"}</StatusChip>;
        const bus = ["fleet", "health"].includes(a.go) ? busOf(a) : "";
        const cls = "flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left hover:bg-accent/60";
        return (
          <li key={a.key}>
            {bus
              ? <button type="button" onClick={() => onOpenBus(bus)} className={cls}>{chip}<span className="flex-1 text-body-sm">{a.text}</span><ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" /></button>
              : <Link to={`/admin/${a.go}`} className={cls}>{chip}<span className="flex-1 text-body-sm">{a.text}</span><ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" /></Link>}
          </li>
        );
      })}
    </ul>
  );
}

// Admin → Live fleet: every bus on the map and in a list. Tap a bus for
// everything about it in one panel beside the map: where it is and who's on
// it, tracking, its live camera and clips, its tablets and GPS, and what
// needs attention. The camera wall, saved clips, the whole-fleet health
// table, past trips and reports open on the same page. The old addresses
// (/admin/fleet-workspace, /admin/health, /admin/location-timeline) open
// this page with that part already open; ?bus= opens that bus.
export default function LiveFleetPage({
  mode = "fleet", vehicles = [], routes = [], kiosks = [], checkIns = [], faults = [], inspections = [], onVehicleUpdate, refreshTick = 0,
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { location: userLoc, error: locationError, retry: retryLocation } = useUserLocation();
  const [mapKey, setMapKey] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [occupancy, setOccupancy] = useState({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(() => Date.now());
  const [devices, setDevices] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loadedAt, setLoadedAt] = useState(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [shifts, setShifts] = useState([]);
  const [openRequests, setOpenRequests] = useState(0);
  // The bus open in the panel rides in the address (?bus=).
  const [busFocus, setBusFocus] = useAdminFocus("bus");
  const [focusN, setFocusN] = useState(busFocus ? 1 : 0);
  const [panelOpen, setPanelOpen] = useState(() => !!busFocus);
  const [sheet, setSheet] = useState(() => (busFocus ? null : SHEET_OF[mode] || null));
  const [fromBus, setFromBus] = useState(false);
  const [historyId, setHistoryId] = useState(busFocus || "");
  const [clipsId, setClipsId] = useState("");
  const [cameraView, setCameraView] = useState("live");

  // Who's on board: the latest boarding or exit per person per bus.
  useEffect(() => {
    const load = () => base44.entities.StaffCheckIn.list("-created_date", 500).then((list) => setOccupancy(computeOccupancyByVehicle(list))).catch(() => {});
    load();
    const unsub = base44.entities.StaffCheckIn.subscribe(() => load());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { unsub?.(); clearInterval(t); };
  }, []);
  // Tablets and app errors, for each bus's health: every 30 seconds.
  const loadHealth = useCallback(async () => {
    setHealthBusy(true);
    try {
      const since = Date.now() - 24 * 3600000;
      const [d, e] = await Promise.all([
        base44.entities.KioskDevice.list("-last_seen", 500),
        base44.entities.ClientError.list("-created_date", 300).catch(() => []),
      ]);
      setDevices(d || []);
      setErrors((e || []).filter((x) => new Date(x.created_date).getTime() >= since));
      setLoadedAt(new Date());
    } catch { /* keep what we had */ } finally { setHealthBusy(false); }
  }, []);
  useEffect(() => { loadHealth(); const t = setInterval(loadHealth, HEALTH_MS); return () => clearInterval(t); }, [loadHealth, refreshTick]);
  // Open shifts and passenger requests waiting: every minute.
  useEffect(() => {
    let alive = true;
    const load = () => {
      base44.entities.DriverShift.list("-started_at", 100).then((rows) => { if (alive) setShifts(Array.isArray(rows) ? rows : []); }).catch(() => {});
      base44.functions.invoke("passengerCases", { action: "list" }).then((r) => { if (alive) setOpenRequests((r.data?.cases || []).length); }).catch(() => {});
      setNow(Date.now());
    };
    load();
    const t = setInterval(load, SHIFTS_MS);
    return () => { alive = false; clearInterval(t); };
  }, [refreshTick]);

  // Reaching /admin/fleet-workspace, /admin/health or /admin/location-timeline
  // while the page is open (the admin search, a link) opens that part.
  const lastMode = useRef(mode);
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    if (SHEET_OF[mode]) { setPanelOpen(false); setFromBus(false); setSheet(SHEET_OF[mode]); }
  }, [mode]);

  const tablets = devices || kiosks;
  const rows = useMemo(() => busSummaries({ vehicles, kiosks: tablets, checkIns, shifts, faults, inspections, now }), [vehicles, tablets, checkIns, shifts, faults, inspections, now]);
  const rowOf = useMemo(() => new Map(rows.map((r) => [r.vehicle.id, r])), [rows]);
  const health = useMemo(() => (devices ? healthRows(vehicles, devices, errors) : []), [vehicles, devices, errors]);
  const healthOf = useMemo(() => new Map(health.map((h) => [h.v.id, h])), [health]);
  const alerts = useMemo(() => fleetAlerts(rows, { openRequests, now }), [rows, openRequests, now]);
  const cameras = useMemo(() => cameraTablets(tablets), [tablets]);
  const cameraOf = useCallback((id) => cameras.find((k) => k.vehicle_id === id) || null, [cameras]);
  const cameraIds = useMemo(() => new Set(cameras.map((k) => k.vehicle_id)), [cameras]);
  const tabletBus = useCallback((id) => tablets.find((k) => k.id === id)?.vehicle_id || "", [tablets]);
  // The bus an alert is about: its key ends in the bus's id, or its tablet's.
  const busOf = useCallback((a) => { const id = a.key.split(":")[1] || ""; return vehicles.some((v) => v.id === id) ? id : tabletBus(id); }, [vehicles, tabletBus]);
  const alertBusIds = useMemo(() => new Set(alerts.map(busOf).filter(Boolean)), [alerts, busOf]);
  const recordingTablets = tablets.filter((k) => k.kiosk_type === "driver" && k.paired && k.status === "active" && k.helper_health?.recordings_available === true);

  const routeOf = (v) => routes.find((r) => r.id === v.route_id) || null;
  const statuses = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, fleetStatus(v, now)])), [vehicles, now]);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, vehicles.filter((v) => f.test(statuses[v.id].key)).length]));
  const q = query.trim().toLowerCase();
  const list = vehicles
    .filter((v) => FILTERS.find((f) => f.id === filter).test(statuses[v.id].key))
    .filter((v) => !q || [v.name, v.plate_number, v.driver_name, v.driver_email, v.company_name, routeOf(v)?.name].some((s) => String(s || "").toLowerCase().includes(q)))
    .sort((a, b) => ORDER[statuses[a.id].key] - ORDER[statuses[b.id].key] || String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  const withLocation = vehicles.filter((v) => v.current_lat != null);

  const selected = busFocus ? vehicles.find((v) => v.id === busFocus) || null : null;
  const selRoute = selected ? routeOf(selected) : null;
  const selStops = useMemo(() => sortStops(selRoute?.stops).filter((s) => s.lat != null && s.lng != null), [selRoute]);
  const callout = selected?.current_lat != null
    ? { primary: selected.name, secondary: busStatusLine(selected, selRoute, now), tone: ["lost", "idle"].includes(statuses[selected.id]?.key) ? "lost" : "live" }
    : null;

  // Opening a bus centres the map on it and shows everything about it (its
  // panel says when it has no location yet).
  const openBus = (id) => {
    const v = vehicles.find((x) => x.id === id);
    if (!v) return;
    if (mode !== "fleet") navigate("/admin/fleet?bus=" + encodeURIComponent(id), { replace: true });
    else setBusFocus(id);
    setFocusN((n) => n + 1);
    setSheet(null);
    setPanelOpen(true);
  };
  // A part opened from a bus's panel (Past trips, Saved clips, Whole fleet)
  // goes back to it when it closes; one opened from the page goes back to
  // the map. Either way the page ends up on /admin/fleet.
  const closeSheet = () => {
    setSheet(null);
    const back = fromBus && busFocus ? busFocus : "";
    if (back) setPanelOpen(true);
    if (mode !== "fleet") navigate("/admin/fleet" + (back ? "?bus=" + encodeURIComponent(back) : ""), { replace: true });
  };
  const closePanel = () => {
    setPanelOpen(false);
    if (mode !== "fleet") navigate("/admin/fleet", { replace: true });
    else setBusFocus("");
  };
  const openSheet = (name, forBus = false) => {
    setPanelOpen(false);
    setFromBus(forBus);
    if (!forBus && busFocus) setBusFocus("");
    setSheet(name);
  };

  const updateBus = async (v, patch, ok, fail) => {
    setBusyId(v.id);
    try {
      await base44.entities.Vehicle.update(v.id, patch);
      onVehicleUpdate?.({ ...v, ...patch });
      toast(ok);
    } catch {
      toast({ title: fail, variant: "destructive" });
    } finally { setBusyId(null); }
  };
  const startTracking = (v) => updateBus(v, { remote_tracking_lock: true, tracking_active: true },
    { title: "Tracking enforced", description: `${v.name} — driver tablet will auto-start on next heartbeat.` }, "Failed to start tracking");
  const releaseLock = (v) => updateBus(v, { remote_tracking_lock: false },
    { title: "Lock released", description: `${v.name} can now stop tracking manually.` }, "Failed to release lock");
  // Backup GPS: when a bus tablet fails, the assigned driver's phone app
  // sends the bus position for their open shift. It switches itself off
  // when the driver ends the shift on the phone.
  const phoneGps = (v, on) => updateBus(v,
    on ? { backup_gps_driver_email: v.driver_email, backup_gps_since: new Date().toISOString(), tracking_active: true } : { backup_gps_driver_email: "", backup_gps_since: null },
    on
      ? { title: "Backup GPS on", description: `${v.driver_name || v.driver_email}'s phone will send ${v.name}'s position while their shift is open. They need the driver app open.` }
      : { title: "Backup GPS off", description: `${v.name}'s position comes from its tablet again.` },
    "Couldn't change backup GPS");

  const onBoardTotal = Object.values(occupancy).reduce((n, x) => n + (x > 0 ? x : 0), 0);

  return (
    <>
      <PageActions>
        <Button variant="outline" size="sm" onClick={() => openSheet("cameras")}><Video className="h-4 w-4" /> Cameras</Button>
        <Button variant="outline" size="sm" onClick={() => openSheet("health")}><Activity className="h-4 w-4" /> Fleet health</Button>
        <Button variant="outline" size="sm" onClick={() => { setHistoryId(""); openSheet("history"); }}><History className="h-4 w-4" /> Past trips</Button>
        <Button variant="outline" size="sm" onClick={() => openSheet("reports")}><BarChart3 className="h-4 w-4" /> Reports</Button>
      </PageActions>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FILTERS.map((f) => (
          <Tile key={f.id} label={f.label} value={counts[f.id]} tone={f.id === "issues" ? "danger" : f.id === "live" ? "success" : undefined}
            on={filter === f.id} onClick={() => setFilter(filter === f.id && f.id !== "all" ? "all" : f.id)} />
        ))}
        <Tile label="Needs attention" value={alerts.length} tone="warning" onClick={() => openSheet("alerts")} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-body-sm text-muted-foreground">
          {locationError || (!userLoc ? "Finding your location…" : userLoc.accuracy > 500 ? `Approximate location · accuracy about ${Math.round(userLoc.accuracy)} metres` : "Your current location is shown on the map")}
          {" · "}{withLocation.length} of {vehicles.length} buses with a last known position{onBoardTotal > 0 ? ` · ${onBoardTotal} on board` : ""}
        </p>
        <Button size="sm" variant="outline" onClick={() => { closePanel(); setMapKey((n) => n + 1); retryLocation(); }}>
          <MapPin className="h-4 w-4" aria-hidden="true" /> My location
        </Button>
      </div>

      {/* On a phone: the map, then the buses, then what needs attention. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <Suspense fallback={<div className="h-[46vh] animate-pulse rounded-2xl bg-muted lg:h-[calc(100vh-24rem)]" />}>
            <LiveTransitMap
              key={mapKey}
              followUser={!selected}
              variant="page"
              className="h-[46vh] min-h-[320px] rounded-2xl border border-border lg:h-[calc(100vh-24rem)] lg:min-h-[420px]"
              vehicles={withLocation}
              focusVehicleId={selected?.current_lat != null ? selected.id : null}
              focusKey={focusN}
              routes={routes}
              stops={selected ? selStops : []}
              road={selected ? drawnRoad(selRoute) : null}
              userLocation={selected ? null : userLoc}
              callout={callout}
              label="Live fleet map"
            />
          </Suspense>
        </div>
        <section className="flex min-h-0 min-w-0 flex-col self-start rounded-2xl border border-border bg-card lg:col-start-1 lg:row-span-2 lg:row-start-1" aria-label="Buses">
          <div className="p-3">
            <label className="relative block">
              <span className="sr-only">Search buses</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Bus, plate, driver or route"
                className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto border-t border-border px-2 py-1 lg:max-h-[calc(100vh-24rem)]">
            {list.map((v) => {
              const st = statuses[v.id];
              const num = busNumber(v.name);
              const on = panelOpen && selected?.id === v.id;
              const hasCamera = cameraIds.has(v.id);
              return (
                <li key={v.id}>
                  <button type="button" onClick={() => openBus(v.id)} aria-pressed={on} aria-label={`${v.name}, ${st.label}. Open`}
                    className={cn("my-1 flex min-h-[64px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors", on ? "bg-primary/12 ring-1 ring-primary/60" : "hover:bg-accent/60")}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary font-display text-title-sm font-semibold tabular-nums" aria-hidden="true">{num || <Bus className="h-4 w-4" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate font-semibold">
                        <span className="truncate">{v.name}</span>
                        {v.remote_tracking_lock && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                        {hasCamera && <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      </span>
                      <span className="block truncate text-body-sm text-muted-foreground">{routeOf(v)?.name || v.driver_name || v.company_name || "No route"}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <StatusPill status={st} />
                      {occupancy[v.id] > 0 && <span className="inline-flex items-center gap-1 text-caption tabular-nums text-muted-foreground"><Users className="h-3 w-3" aria-hidden="true" /> {occupancy[v.id]}{v.capacity ? `/${v.capacity}` : ""}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="px-3 py-10 text-center text-body-sm text-muted-foreground">{vehicles.length === 0 ? "No vehicles registered yet." : "No buses match."}</li>}
          </ul>
        </section>
        <section className="min-w-0 rounded-2xl border bg-card lg:col-start-2 lg:row-start-2" aria-labelledby="fleet-attention">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 id="fleet-attention" className="flex-1 text-body font-semibold">Needs attention</h2>
            {alerts.length > 4 && <Button variant="ghost" size="sm" onClick={() => openSheet("alerts")}>All {alerts.length}</Button>}
          </div>
          <AlertList alerts={alerts} limit={4} onOpenBus={openBus} busOf={busOf} />
        </section>
      </div>

      <BusPanel
        bus={selected} open={panelOpen && !!selected} onOpenChange={(o) => (o ? setPanelOpen(true) : closePanel())}
        row={selected ? rowOf.get(selected.id) : null} health={selected && devices ? healthOf.get(selected.id) || null : null}
        route={selRoute} status={selected ? { ...statuses[selected.id], line: busStatusLine(selected, selRoute, now) } : null}
        occupancy={selected ? occupancy[selected.id] || 0 : 0} alerts={selected ? alerts.filter((a) => busOf(a) === selected.id) : []}
        camera={selected ? cameraOf(selected.id) : null} clipsTablet={selected ? recordingTablets.find((k) => k.vehicle_id === selected.id) || null : null}
        userLoc={userLoc} busy={busyId === selected?.id} now={now}
        onPastTrips={(v) => { setHistoryId(v.id); openSheet("history", true); }}
        onClips={(k) => { setClipsId(k.id); setCameraView("clips"); openSheet("cameras", true); }}
        onOpenHealth={() => openSheet("health", true)}
        onStartTracking={startTracking} onReleaseLock={releaseLock} onPhoneGps={phoneGps}
      />

      <Sheet open={sheet === "cameras"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-5xl">
          <SheetHeader className="pb-2 text-left">
            <SheetTitle>Cameras</SheetTitle>
            <SheetDescription>Watch up to 4 buses at once, or play back saved dashcam clips. A bus's name opens it.</SheetDescription>
          </SheetHeader>
          <div className="mb-3 flex rounded-xl bg-secondary p-1" role="tablist" aria-label="Cameras">
            {[["live", "Watch live", Video], ["clips", "Saved clips", Film]].map(([v, l, Icon]) => (
              <button key={v} type="button" role="tab" aria-selected={cameraView === v} onClick={() => setCameraView(v)}
                className={cn("flex h-9 items-center gap-2 rounded-lg px-3 text-body-sm font-semibold", cameraView === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}><Icon className="h-4 w-4" aria-hidden="true" />{l}</button>
            ))}
          </div>
          {sheet === "cameras" && cameraView === "live" && <CameraWall rows={rows} cameraOf={cameraOf} cameraIds={cameraIds} alertBusIds={alertBusIds} pickedId={busFocus} onOpenBus={openBus} />}
          {sheet === "cameras" && cameraView === "clips" && <SavedClips key={clipsId} tablets={recordingTablets} vehicles={vehicles} initialId={clipsId} />}
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "health"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-5xl">
          <SheetHeader className="pb-2 text-left">
            <SheetTitle>Fleet health</SheetTitle>
            <SheetDescription>Every bus's GPS, tablets, card reader and uploads. A bus's name opens it.</SheetDescription>
          </SheetHeader>
          {sheet === "health" && <FleetHealthTable rows={health} devices={devices || []} errors={errors} loadedAt={loadedAt} busy={healthBusy} onRefresh={loadHealth} onOpenBus={openBus} />}
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "history"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
          <SheetHeader className="pb-2 text-left">
            <SheetTitle>Location timeline</SheetTitle>
            <SheetDescription>Pick a bus and a day to replay where it went.</SheetDescription>
          </SheetHeader>
          {sheet === "history" && <LocationReplay vehicles={vehicles} initialVehicleId={historyId || busFocus || vehicles[0]?.id || ""} />}
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "alerts"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="pb-2 text-left"><SheetTitle>Needs attention ({alerts.length})</SheetTitle></SheetHeader>
          <div className="-mx-2 rounded-2xl border"><AlertList alerts={alerts} onOpenBus={openBus} busOf={busOf} /></div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "reports"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="pb-2 text-left"><SheetTitle>Reports</SheetTitle></SheetHeader>
          <ul className="space-y-2" aria-label="Reports">
            {REPORTS.map((r) => (
              <li key={r.to}><Link to={`/admin/${r.to}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-accent/60">
                <BarChart3 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1"><strong className="block">{r.title}</strong><span className="text-body-sm text-muted-foreground">{r.sub}</span></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </Link></li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
