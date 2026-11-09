import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bus, Camera, ChevronLeft, ChevronRight, LayoutGrid, List, Maximize2, Search, Video, X } from "lucide-react";
import { EmptyState, Segmented, StatusChip } from "@/components/admin/kit";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import { CAMERAS_PER_TABLET, filterBuses, MAX_LIVE_VIEWS, MONITOR_FILTERS, MONITOR_PAGE, speedText } from "@/lib/fleetWorkspace";
import { PROTECTION_LABEL } from "@/lib/kioskProtection";
import BusArtwork from "@/components/BusArtwork";
import TabletRemoteViewer from "@/components/admin/TabletRemoteViewer";
import TabletRecordingsViewer from "@/components/admin/TabletRecordingsViewer";

// Admin → Live fleet → Cameras: a tile per bus, to watch up to 4 buses at
// once, and Saved clips. Cameras keep the same rules as before: a live view
// starts only when an admin taps a bus (one tap starts its back camera in
// the box; Front camera switches), the tablet shows a Stop button, it ends
// after 10 minutes and is logged, at most 4 at once, driver tablets' front
// and back cameras only (never a boarding tablet's QR camera).

export const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE, hour: "numeric", minute: "2-digit" }) : "");
export const LOCATION_TEXT = { live: "Live", last_known: "Last known", unavailable: "No location" };
export const LOCATION_TONE = { live: "success", last_known: "warning", unavailable: "neutral" };
export const PROTECTION_TONE = { ok: "success", limited: "warning", setup: "warning", unsupported: "neutral", failed: "danger" };
export const tabletKind = (k) => (k.kiosk_type === "driver" ? "Driver" : k.kiosk_type === "bus_boarding" ? "Boarding" : "Signing");

// One bus: its status, what it can show, and a live camera when opened.
function BusTile({ row, camera, open, canOpen, onOpen, onClose, onOpenBus, picked = false }) {
  const tile = useRef(null);
  const v = row.vehicle;
  const live = row.location.state === "live";
  const full = () => { try { tile.current?.requestFullscreen?.(); } catch { /* not available here */ } };
  return (
    <li ref={tile} id={"tile-" + v.id} aria-current={picked ? "true" : undefined} className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card ${picked ? "ring-2 ring-ring" : ""}`} aria-label={v.name}>
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${live ? "bg-success" : row.location.state === "last_known" ? "bg-warning" : "bg-muted-foreground/40"}`} aria-hidden="true" />
        <button type="button" onClick={() => onOpenBus(v.id)} className="min-w-0 flex-1 truncate text-left font-bold underline-offset-4 hover:underline" aria-label={`Open ${v.name}`}>{v.name}</button>
        <span className="flex shrink-0 items-center gap-1 text-caption text-muted-foreground"><Camera className="h-3.5 w-3.5" aria-hidden="true" />{camera ? `${CAMERAS_PER_TABLET} cams` : "No live camera"}</span>
      </div>
      <div className="relative m-2 overflow-hidden rounded-xl bg-secondary">
        {open && camera ? (
          <div className="space-y-2 p-2">
            <TabletRemoteViewer device={camera} compact capabilities={["camera_back", "camera_front"]} start="camera_back" />
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
                <Video className="h-3.5 w-3.5" aria-hidden="true" />{!camera ? "No camera to view" : canOpen ? "Tap to watch live" : `Up to ${MAX_LIVE_VIEWS} at once`}
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
        {row.protection.length > 0 && <p className="flex flex-wrap gap-1">{row.protection.map((p) => <StatusChip key={p.tablet.id} tone={PROTECTION_TONE[p.tone]}>{tabletKind(p.tablet)}: {PROTECTION_LABEL[p.tone]}</StatusChip>)}</p>}
      </div>
    </li>
  );
}

export default function CameraWall({ rows, cameraOf, cameraIds, alertBusIds, pickedId, onOpenBus }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState("grid");
  const [page, setPage] = useState(0);
  const [openIds, setOpenIds] = useState([]);
  const shown = useMemo(() => filterBuses(rows, { filter, query, cameraIds, alertBusIds }), [rows, filter, query, cameraIds, alertBusIds]);
  const pages = Math.max(1, Math.ceil(shown.length / MONITOR_PAGE));
  const current = Math.min(page, pages - 1);
  const pageRows = shown.slice(current * MONITOR_PAGE, (current + 1) * MONITOR_PAGE);
  const open = (id) => setOpenIds((ids) => (ids.includes(id) || ids.length >= MAX_LIVE_VIEWS ? ids : [...ids, id]));
  const close = (id) => setOpenIds((ids) => ids.filter((x) => x !== id));
  // A view whose tile leaves the screen (search, filter, another page, List)
  // has ended, so stop counting it.
  const onScreen = layout === "grid" ? pageRows.map((r) => r.vehicle.id).join(",") : "";
  useEffect(() => {
    const visible = new Set(onScreen.split(",").filter(Boolean));
    setOpenIds((ids) => (ids.every((id) => visible.has(id)) ? ids : ids.filter((id) => visible.has(id))));
  }, [onScreen]);
  const hasCameras = rows.some((r) => cameraOf(r.vehicle.id));

  return (
    <section className="min-w-0 space-y-3" aria-label="Live fleet view">
      <div className="flex flex-wrap items-center gap-2">
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
      {hasCameras && <p role="status" className="text-body-sm text-muted-foreground">{openIds.length > 0 ? `${openIds.length} of ${MAX_LIVE_VIEWS} live views open.` : "Live cameras are a trial until they're tested on a bus."} Tap a bus to watch its back camera in its box; Front camera switches. Each view shows a Stop button on the tablet, ends after 10 minutes and is logged.</p>}
      {pageRows.length === 0 ? <EmptyState icon={Bus} title={rows.length ? "No buses match" : "No buses yet"} /> : layout === "grid" ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Bus tiles">
          {pageRows.map((r) => <BusTile key={r.vehicle.id} row={r} camera={cameraOf(r.vehicle.id)} open={openIds.includes(r.vehicle.id)} canOpen={openIds.length < MAX_LIVE_VIEWS} onOpen={() => open(r.vehicle.id)} onClose={() => close(r.vehicle.id)} onOpenBus={onOpenBus} picked={r.vehicle.id === pickedId} />)}
        </ul>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Bus list">
          {pageRows.map((r) => (
            <li key={r.vehicle.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <button type="button" onClick={() => onOpenBus(r.vehicle.id)} className="min-w-[8rem] text-left font-bold underline-offset-4 hover:underline" aria-label={`Open ${r.vehicle.name}`}>{r.vehicle.name}</button>
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
  );
}

// Saved dashcam clips on driver tablets. A clip is sent from the tablet only
// when asked for, while the tablet is online.
export function SavedClips({ tablets, vehicles, initialId = "" }) {
  const [pickedId, setPickedId] = useState(initialId);
  const picked = tablets.find((k) => k.id === pickedId) || null;
  if (tablets.length === 0) return <p className="text-body-sm text-muted-foreground">No driver tablet has saved recordings to offer yet. The rear dashcam must be on in the tablet's settings.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a bus">
        {tablets.map((k) => <button key={k.id} type="button" aria-pressed={k.id === pickedId} onClick={() => setPickedId(k.id)} className={`min-h-10 rounded-full border px-3 text-body-sm font-semibold ${k.id === pickedId ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}>{vehicles.find((v) => v.id === k.vehicle_id)?.name || "Bus"} · {k.label || "Driver tablet"}</button>)}
      </div>
      {picked ? <TabletRecordingsViewer key={picked.id} device={picked} /> : <p className="text-body-sm text-muted-foreground">Choose a bus to see its saved clips.</p>}
    </div>
  );
}
