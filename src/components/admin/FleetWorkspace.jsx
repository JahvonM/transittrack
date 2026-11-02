import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { EmptyState, PageIntro, Panel, Segmented, StatusChip } from "@/components/admin/kit";
import { AlertTriangle, BarChart3, Bus, Camera, ChevronLeft, ChevronRight, Film, LayoutGrid, List, Maximize2, MapPin, Search, Video, X } from "lucide-react";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import { busSummaries, cameraTablets, CAMERAS_PER_TABLET, filterBuses, fleetAlerts, MAX_LIVE_VIEWS, MONITOR_FILTERS, MONITOR_PAGE, speedText } from "@/lib/fleetWorkspace";
import { PROTECTION_LABEL } from "@/lib/kioskProtection";
import BusArtwork from "@/components/BusArtwork";
import TabletRemoteViewer from "@/components/admin/TabletRemoteViewer";
import TabletRecordingsViewer from "@/components/admin/TabletRecordingsViewer";

const FleetMap = lazy(() => import("@/components/manager/FleetMap"));

// Admin → Fleet workspace, laid out as a monitoring screen: Live view (a tile
// per bus, the map and a list), Playback (saved dashcam clips), Alerts and
// Reports. Cameras keep the same rules as before: a live view starts only
// when an admin taps a bus, the tablet shows a Stop button, it ends after 10
// minutes and is logged, at most 4 at once, driver tablets' front and back
// cameras only (never a boarding tablet's QR camera).

const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE, hour: "numeric", minute: "2-digit" }) : "");
const LOCATION_TEXT = { live: "Live", last_known: "Last known", unavailable: "No location" };
const LOCATION_TONE = { live: "success", last_known: "warning", unavailable: "neutral" };
const PROTECTION_TONE = { ok: "success", limited: "warning", setup: "warning", unsupported: "neutral", failed: "danger" };
const REPORTS = [
  { to: "driving-reports", title: "Driving reports", sub: "Speeding, harsh braking and driving events" },
  { to: "fleet-analytics", title: "Fleet analytics", sub: "Distance, hours and use per bus" },
  { to: "route-analytics", title: "Route analytics", sub: "How each route runs" },
  { to: "vehicle-logs", title: "Vehicle logs", sub: "Where each bus has been" },
  { to: "ride-history", title: "Ride history", sub: "Trips and jobs" },
  { to: "checkins", title: "Boarding log", sub: "Card, QR and code taps" },
];
const where = (r) => (r.location.state === "live" ? `Live · ${time(r.location.at)}` : r.location.state === "last_known" ? `Last known · ${time(r.location.at)}` : "No location yet");

// One bus: its status, what it can show, and a live camera when opened.
function BusTile({ row, camera, open, canOpen, onOpen, onClose }) {
  const tile = useRef(null);
  const v = row.vehicle;
  const live = row.location.state === "live";
  const full = () => { try { tile.current?.requestFullscreen?.(); } catch { /* not available here */ } };
  return (
    <li ref={tile} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card" aria-label={v.name}>
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${live ? "bg-success" : row.location.state === "last_known" ? "bg-warning" : "bg-muted-foreground/40"}`} aria-hidden="true" />
        <strong className="min-w-0 flex-1 truncate">{v.name}</strong>
        <span className="flex shrink-0 items-center gap-1 text-caption text-muted-foreground"><Camera className="h-3.5 w-3.5" aria-hidden="true" />{camera ? `${CAMERAS_PER_TABLET} cams` : "No live camera"}</span>
      </div>
      <div className="relative m-2 overflow-hidden rounded-xl bg-secondary">
        {open && camera ? (
          <div className="space-y-2 p-2">
            <TabletRemoteViewer device={camera} compact capabilities={["camera_back", "camera_front"]} />
            <div className="flex gap-2">
              <button type="button" onClick={full} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-caption font-semibold hover:bg-accent" aria-label={`Full screen: ${v.name}`}><Maximize2 className="h-4 w-4" aria-hidden="true" />Full screen</button>
              <button type="button" onClick={onClose} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-caption font-semibold hover:bg-accent" aria-label={`Close camera: ${v.name}`}><X className="h-4 w-4" aria-hidden="true" />Close</button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={!camera || !canOpen} onClick={onOpen} className="group relative block aspect-video w-full text-left disabled:cursor-default" aria-label={camera ? `Open live camera: ${v.name}` : `${v.name}: no live camera`}>
            <BusArtwork vehicle={v} fallbackUrl="/images/boarding-coaster.webp" width={320} className="h-full w-full object-contain opacity-90" />
            <span className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-caption font-semibold">
                <Video className="h-3.5 w-3.5" aria-hidden="true" />{!camera ? "No camera to view" : canOpen ? "Tap to view live" : `Up to ${MAX_LIVE_VIEWS} at once`}
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="mt-auto space-y-1 px-3 pb-3 text-caption text-muted-foreground">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusChip tone={LOCATION_TONE[row.location.state]}>{LOCATION_TEXT[row.location.state]}{row.location.state !== "unavailable" ? ` · ${time(row.location.at)}` : ""}</StatusChip>
          <span>{speedText(row)}</span>
          <span>{row.onBoard != null ? `${row.onBoard} on board` : row.onBoardWhy}</span>
        </p>
        <p className="truncate">{row.shift ? `On shift since ${time(row.shift.started_at)}${row.shift.driver_name ? ` · ${row.shift.driver_name}` : ""}` : "No shift open"}{row.faults ? ` · ${row.faults} open fault${row.faults === 1 ? "" : "s"}` : ""}</p>
        {row.protection.length > 0 && <p className="flex flex-wrap gap-1">{row.protection.map((p) => <StatusChip key={p.tablet.id} tone={PROTECTION_TONE[p.tone]}>{p.tablet.kiosk_type === "driver" ? "Driver" : p.tablet.kiosk_type === "bus_boarding" ? "Boarding" : "Signing"}: {PROTECTION_LABEL[p.tone]}</StatusChip>)}</p>}
      </div>
    </li>
  );
}

export default function FleetWorkspace({ vehicles = [], kiosks = [], checkIns = [], faults = [], inspections = [] }) {
  const [tab, setTab] = useState("live");
  const [shifts, setShifts] = useState([]);
  const [openRequests, setOpenRequests] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState("grid");
  const [page, setPage] = useState(0);
  const [openIds, setOpenIds] = useState([]);
  const [playbackId, setPlaybackId] = useState("");
  const [mapFocus, setMapFocus] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      base44.entities.DriverShift.list("-started_at", 100).then((rows) => { if (alive) setShifts(Array.isArray(rows) ? rows : []); }).catch(() => {});
      base44.functions.invoke("passengerCases", { action: "list" }).then((r) => { if (alive) setOpenRequests((r.data?.cases || []).length); }).catch(() => {});
      setNow(Date.now());
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const rows = useMemo(() => busSummaries({ vehicles, kiosks, checkIns, shifts, faults, inspections, now }), [vehicles, kiosks, checkIns, shifts, faults, inspections, now]);
  const alerts = useMemo(() => fleetAlerts(rows, { openRequests, now }), [rows, openRequests, now]);
  const cameras = useMemo(() => cameraTablets(kiosks), [kiosks]);
  const cameraOf = (vehicleId) => cameras.find((k) => k.vehicle_id === vehicleId) || null;
  const cameraIds = useMemo(() => new Set(cameras.map((k) => k.vehicle_id)), [cameras]);
  const alertBusIds = useMemo(() => new Set(alerts.map((a) => (a.key.split(":")[1] || "")).filter(Boolean).flatMap((id) => [id, kiosks.find((k) => k.id === id)?.vehicle_id].filter(Boolean))), [alerts, kiosks]);
  const shown = useMemo(() => filterBuses(rows, { filter, query, cameraIds, alertBusIds }), [rows, filter, query, cameraIds, alertBusIds]);
  const pages = Math.max(1, Math.ceil(shown.length / MONITOR_PAGE));
  const current = Math.min(page, pages - 1);
  const pageRows = shown.slice(current * MONITOR_PAGE, (current + 1) * MONITOR_PAGE);
  const live = rows.filter((r) => r.location.state === "live").length;
  const counted = rows.filter((r) => r.onBoard != null);
  const onBoard = counted.reduce((n, r) => n + r.onBoard, 0);
  const recordingTablets = kiosks.filter((k) => k.kiosk_type === "driver" && k.paired && k.status === "active" && k.helper_health?.recordings_available === true);
  const playback = recordingTablets.find((k) => k.id === playbackId) || null;
  const open = (id) => setOpenIds((ids) => (ids.includes(id) || ids.length >= MAX_LIVE_VIEWS ? ids : [...ids, id]));
  const close = (id) => setOpenIds((ids) => ids.filter((x) => x !== id));
  // A view whose tile leaves the screen (search, filter, another page, List,
  // another tab) has ended, so stop counting it.
  const onScreen = tab === "live" && layout === "grid" ? pageRows.map((r) => r.vehicle.id).join(",") : "";
  useEffect(() => {
    const visible = new Set(onScreen.split(",").filter(Boolean));
    setOpenIds((ids) => (ids.every((id) => visible.has(id)) ? ids : ids.filter((id) => visible.has(id))));
  }, [onScreen]);

  return (
    <div className="space-y-4">
      <PageIntro>Watch the fleet: each bus's location, shift and tablets, a live camera when you open one, saved dashcam clips, and what needs attention.</PageIntro>
      <Segmented label="Fleet workspace" value={tab} onChange={setTab} options={[
        { value: "live", label: "Live view", icon: Video },
        { value: "playback", label: "Playback", icon: Film },
        { value: "alerts", label: "Alerts", icon: AlertTriangle, count: alerts.length },
        { value: "reports", label: "Reports", icon: BarChart3 },
      ]} />

      {tab === "live" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <section className="min-w-0 space-y-3" aria-label="Live fleet view">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-title font-bold">Live fleet view</h2>
              <label className="sr-only" htmlFor="fleet-filter">Show</label>
              <select id="fleet-filter" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }} className="h-10 rounded-xl border border-border bg-background px-3 text-body-sm">
                {MONITOR_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label} ({filterBuses(rows, { filter: f.value, cameraIds, alertBusIds }).length})</option>)}
              </select>
              <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-body-sm">
                <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search bus or driver" aria-label="Search buses" className="w-40 bg-transparent outline-none" />
              </label>
              <Segmented size="sm" label="Layout" value={layout} onChange={setLayout} options={[{ value: "grid", label: "Tiles", icon: LayoutGrid }, { value: "list", label: "List", icon: List }]} />
            </div>
            {cameras.length > 0 && <p role="status" className="text-body-sm text-muted-foreground">{openIds.length > 0 ? `${openIds.length} of ${MAX_LIVE_VIEWS} live views open.` : "Live cameras are a trial until they're tested on a bus."} Tap a bus, then choose a camera. Each view shows a Stop button on the tablet, ends after 10 minutes and is logged.</p>}
            {pageRows.length === 0 ? <EmptyState icon={Bus} title={rows.length ? "No buses match" : "No buses yet"} /> : layout === "grid" ? (
              <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" aria-label="Bus tiles">
                {pageRows.map((r) => <BusTile key={r.vehicle.id} row={r} camera={cameraOf(r.vehicle.id)} open={openIds.includes(r.vehicle.id)} canOpen={openIds.length < MAX_LIVE_VIEWS} onOpen={() => open(r.vehicle.id)} onClose={() => close(r.vehicle.id)} />)}
              </ul>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Bus list">
                {pageRows.map((r) => (
                  <li key={r.vehicle.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <strong className="min-w-[8rem]">{r.vehicle.name}</strong>
                    <StatusChip tone={LOCATION_TONE[r.location.state]}>{LOCATION_TEXT[r.location.state]}</StatusChip>
                    <span className="text-body-sm text-muted-foreground">{speedText(r)} · {r.onBoard != null ? `${r.onBoard} on board` : r.onBoardWhy} · {r.shift ? `on shift since ${time(r.shift.started_at)}` : "no shift open"}</span>
                    <button type="button" disabled={!cameraOf(r.vehicle.id) || (!openIds.includes(r.vehicle.id) && openIds.length >= MAX_LIVE_VIEWS)} onClick={() => { setLayout("grid"); open(r.vehicle.id); }} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-caption font-semibold text-primary disabled:text-muted-foreground" aria-label={`Open live camera: ${r.vehicle.name}`}><Video className="h-4 w-4" aria-hidden="true" />{cameraOf(r.vehicle.id) ? "View live" : "No camera"}</button>
                  </li>
                ))}
              </ul>
            )}
            {pages > 1 && (
              <nav className="flex items-center justify-center gap-1" aria-label="Pages">
                <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-accent disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
                {Array.from({ length: pages }, (_, i) => <button key={i} type="button" aria-current={i === current ? "page" : undefined} onClick={() => setPage(i)} className={`h-9 min-w-9 rounded-lg px-2 text-body-sm font-semibold ${i === current ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{i + 1}</button>)}
                <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-accent disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
              </nav>
            )}
          </section>
          <div className="min-w-0 space-y-4">
            <Panel title="Live map" icon={MapPin} bodyClassName="p-0 overflow-hidden rounded-b-2xl">
              <div className="h-[340px]"><Suspense fallback={<p role="status" className="p-4 text-body-sm">Loading the map…</p>}><FleetMap vehicles={vehicles} mapOnly focusId={mapFocus} mapClassName="h-[340px] w-full" /></Suspense></div>
            </Panel>
            <Panel title={`Buses (${rows.length})`} icon={Bus} actions={<><StatusChip tone="success">{live} live</StatusChip><StatusChip tone="neutral">{rows.length - live} not live</StatusChip></>} bodyClassName="p-0">
              <p className="px-5 pb-2 text-caption text-muted-foreground">{counted.length ? `${onBoard} on board on ${counted.length} bus${counted.length === 1 ? "" : "es"} with a boarding tablet reporting` : "No boarding tablet reporting"}</p>
              <ul className="divide-y divide-border" aria-label="Buses">
                {rows.map((r) => (
                  <li key={r.vehicle.id}>
                    <button type="button" onClick={() => setMapFocus(r.vehicle.id)} disabled={r.location.state === "unavailable"} aria-label={`Show ${r.vehicle.name} on the map (${where(r)}, ${speedText(r) === "—" ? "speed not known" : speedText(r)}, ${cameraIds.has(r.vehicle.id) ? CAMERAS_PER_TABLET : "no"} live cameras)`} className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-5 py-2.5 text-left text-body-sm hover:bg-accent/60 disabled:hover:bg-transparent">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${r.location.state === "live" ? "bg-success" : r.location.state === "last_known" ? "bg-warning" : "bg-muted-foreground/40"}`} aria-hidden="true" /><strong className="truncate">{r.vehicle.name}</strong></span>
                      <span className="block truncate text-caption text-muted-foreground">{where(r)}</span>
                    </span>
                    <span className="tabular-nums">{speedText(r)}</span>
                    <span className="flex items-center gap-1 text-muted-foreground"><Camera className="h-3.5 w-3.5" aria-hidden="true" />{cameraIds.has(r.vehicle.id) ? CAMERAS_PER_TABLET : 0}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Link to="/admin/health" className="inline-flex min-h-11 items-center gap-1 px-5 pb-2 text-body-sm font-semibold text-primary">Tablet details in Fleet health<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
            </Panel>
          </div>
        </div>
      )}

      {tab === "playback" && (
        <Panel title="Playback" icon={Film} description="Saved dashcam clips on driver tablets. A clip is sent from the tablet only when you ask for it, while the tablet is online.">
          {recordingTablets.length === 0 ? <p className="text-body-sm text-muted-foreground">No driver tablet has saved recordings to offer yet. The rear dashcam must be on in the tablet's settings.</p> : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a bus">
                {recordingTablets.map((k) => <button key={k.id} type="button" aria-pressed={k.id === playbackId} onClick={() => setPlaybackId(k.id)} className={`min-h-10 rounded-full border px-3 text-body-sm font-semibold ${k.id === playbackId ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}>{vehicles.find((v) => v.id === k.vehicle_id)?.name || "Bus"} · {k.label || "Driver tablet"}</button>)}
              </div>
              {playback ? <TabletRecordingsViewer key={playback.id} device={playback} /> : <p className="text-body-sm text-muted-foreground">Choose a bus to see its saved clips.</p>}
            </div>
          )}
        </Panel>
      )}

      {tab === "alerts" && (
        <Panel title={`Needs attention (${alerts.length})`} icon={AlertTriangle}>
          {alerts.length === 0 ? <p className="text-body-sm text-muted-foreground">Nothing needs attention right now.</p> : (
            <ul className="space-y-1" aria-label="Fleet alerts">
              {alerts.map((a) => (
                <li key={a.key}><Link to={`/admin/${a.go}`} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-accent/60">
                  <StatusChip tone={a.tone}>{a.tone === "danger" ? "Urgent" : a.tone === "warning" ? "Check" : "Note"}</StatusChip>
                  <span className="flex-1 text-body-sm">{a.text}</span><ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </Link></li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === "reports" && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Reports">
          {REPORTS.map((r) => (
            <li key={r.to}><Link to={`/admin/${r.to}`} className="flex min-h-20 items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-accent/60">
              <BarChart3 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1"><strong className="block">{r.title}</strong><span className="text-body-sm text-muted-foreground">{r.sub}</span></span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
