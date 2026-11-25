import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, BatteryLow, Bus, ChevronRight, Film, History, Lock, Maximize2, MapPin, Radar, Smartphone, TabletSmartphone, Unlock, Video, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/admin/kit";
import { StatusPill } from "@/components/admin/AdminOverview";
import BusDistance from "@/components/BusDistance";
import TabletRemoteViewer from "@/components/admin/TabletRemoteViewer";
import { busNumber } from "@/components/passenger/passengerState";
import { freshnessOf, formatAge } from "@/components/system/status";
import { CAMERAS_PER_TABLET, speedText } from "@/lib/fleetWorkspace";
import { PROTECTION_LABEL } from "@/lib/kioskProtection";
import { HealthCell } from "@/components/admin/fleet/FleetHealthTable";
import { PROTECTION_TONE, tabletKind, time } from "@/components/admin/fleet/CameraWall";

function Section({ icon: Icon, title, children, action }) {
  return (
    <section className="border-t border-border py-4" aria-label={title}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="flex-1 text-body font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// This bus's live camera: nothing is asked of the tablet until "Watch live".
function LiveCamera({ bus, camera }) {
  const [watching, setWatching] = useState(false);
  const box = useRef(null);
  useEffect(() => { setWatching(false); }, [bus.id]);
  if (!camera) return <p className="text-body-sm text-muted-foreground">No live camera on this bus. A paired driver tablet with direct viewing is needed.</p>;
  const full = () => { try { box.current?.requestFullscreen?.(); } catch { /* not available here */ } };
  return watching ? (
    <div ref={box} className="space-y-2 rounded-xl bg-secondary p-2">
      <TabletRemoteViewer device={camera} compact capabilities={["camera_back", "camera_front"]} start="camera_back" />
      <div className="flex gap-2">
        <button type="button" onClick={full} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-caption font-semibold hover:bg-accent" aria-label={`Full screen: ${bus.name}`}><Maximize2 className="h-4 w-4" aria-hidden="true" />Full screen</button>
        <button type="button" onClick={() => setWatching(false)} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-caption font-semibold hover:bg-accent" aria-label={`Close camera: ${bus.name}`}><X className="h-4 w-4" aria-hidden="true" />Close</button>
      </div>
    </div>
  ) : (
    <div className="space-y-2">
      <Button variant="outline" onClick={() => setWatching(true)} aria-label={`Open live camera: ${bus.name}`}><Video className="h-4 w-4" /> Watch live</Button>
      <p className="text-caption text-muted-foreground">{CAMERAS_PER_TABLET} cameras: back first, Front camera switches. The tablet shows a Stop button; a view ends after 10 minutes and is logged.</p>
    </div>
  );
}

// One bus, everything about it in one place: where it is and who's on it,
// tracking, its live camera and clips, its tablets and GPS, and what needs
// attention. It sits beside the map without covering the rest of the page,
// so another bus can be picked straight from the list.
export default function BusPanel({
  bus, open, onOpenChange, row, health, route, status, occupancy, alerts, camera, clipsTablet, userLoc, busy, now,
  onPastTrips, onClips, onStartTracking, onReleaseLock, onPhoneGps, onOpenHealth,
}) {
  if (!bus) return null;
  const num = busNumber(bus.name);
  const onBoard = occupancy > 0 ? `${occupancy}${bus.capacity ? ` of ${bus.capacity}` : ""}` : "0";
  const facts = [
    ["Route", route?.name || "None"],
    ["Driver", bus.driver_name || bus.driver_email || "Unassigned"],
    ["Company · plate", [bus.company_name, bus.plate_number].filter(Boolean).join(" · ") || "—"],
    ...(bus.backup_gps_driver_email ? [["GPS source", `Driver's phone (backup) since ${new Date(bus.backup_gps_since || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`]] : []),
    ["Last fix", bus.current_lat != null ? formatAge(freshnessOf(bus.last_location_update, { now }).ageMs) || "Unknown" : "No location yet"],
    ["Speed", row ? speedText(row) : "—"],
    ["On board", row && row.onBoard == null && row.onBoardWhy ? `${onBoard} (${row.onBoardWhy.toLowerCase()})` : onBoard],
    ["Shift", row?.shift ? `Since ${time(row.shift.started_at)}${row.shift.driver_name ? ` · ${row.shift.driver_name}` : ""}` : "No shift open"],
    ...(row?.faults ? [["Open faults", String(row.faults)]] : []),
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent side="right" className="w-full overflow-y-auto shadow-2xl sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="pb-3 text-left">
          <div className="flex items-start gap-3 pr-6">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary font-display text-title-sm font-semibold tabular-nums" aria-hidden="true">{num || <Bus className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">{bus.name}</SheetTitle>
              <SheetDescription>{status?.line || ""}</SheetDescription>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {status && <StatusPill status={status} />}
                {bus.remote_tracking_lock && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-caption font-semibold"><Lock className="h-3 w-3" aria-hidden="true" /> Tracking locked on</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            <Button size="sm" variant="outline" onClick={() => onPastTrips(bus)}><History className="h-4 w-4" /> Past trips</Button>
            <Button size="sm" variant="outline" asChild><Link to={`/admin/vehicles?bus=${encodeURIComponent(bus.id)}${bus.driver_id ? "&driver=" + encodeURIComponent(bus.driver_id) : ""}`}><Bus className="h-4 w-4" /> Bus and driver</Link></Button>
          </div>
        </SheetHeader>

        <Section icon={MapPin} title="Now">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body-sm">
            {facts.map(([k, val]) => (
              <div key={k} className="min-w-0">
                <dt className="text-caption text-muted-foreground">{k}</dt>
                <dd className="break-words font-semibold">{val}</dd>
              </div>
            ))}
          </dl>
          {bus.current_lat != null && userLoc && <div className="mt-3"><BusDistance vehicle={bus} userLocation={userLoc} /></div>}
        </Section>

        <Section icon={Radar} title="Tracking">
          <div className="flex flex-wrap gap-2">
            {!bus.tracking_active && <Button disabled={busy} onClick={() => onStartTracking(bus)}><Radar className="h-4 w-4" /> Start tracking</Button>}
            {bus.backup_gps_driver_email
              ? <Button variant="outline" disabled={busy} onClick={() => onPhoneGps(bus, false)}><Smartphone className="h-4 w-4" /> Stop phone GPS</Button>
              : bus.driver_email && <Button variant="outline" disabled={busy} onClick={() => onPhoneGps(bus, true)}><Smartphone className="h-4 w-4" /> Use driver's phone for GPS</Button>}
            {bus.remote_tracking_lock && <Button variant="outline" disabled={busy} onClick={() => onReleaseLock(bus)}><Unlock className="h-4 w-4" /> Release lock</Button>}
          </div>
          {bus.tracking_active && !bus.backup_gps_driver_email && !bus.remote_tracking_lock && !bus.driver_email && <p className="text-body-sm text-muted-foreground">Tracking is on.</p>}
        </Section>

        <Section icon={Video} title="Camera" action={clipsTablet && <Button size="sm" variant="ghost" onClick={() => onClips(clipsTablet)}><Film className="h-4 w-4" /> Saved clips</Button>}>
          <LiveCamera bus={bus} camera={camera} />
        </Section>

        <Section icon={Activity} title="Tablets and GPS" action={<Button size="sm" variant="ghost" onClick={onOpenHealth}>Whole fleet</Button>}>
          {health ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {[["GPS", health.cells.gps], ["GPS module", health.cells.gpsModule], ["Driver tablet", health.cells.driver], ["Boarding tablet", health.cells.boarding], ["Card reader", health.cells.reader]].map(([k, cell]) => (
                  <div key={k} className="min-w-0">
                    <p className="text-caption text-muted-foreground">{k}</p>
                    <HealthCell s={cell} />
                  </div>
                ))}
                <div className="min-w-0">
                  <p className="text-caption text-muted-foreground">Waiting to upload</p>
                  <HealthCell s={health.waiting > 0 ? { tone: "warn", text: `${health.waiting} item${health.waiting === 1 ? "" : "s"}`, sub: "saved offline, will upload" } : { tone: "idle", text: "Nothing" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-caption text-muted-foreground">App errors (24 h)</p>
                  <HealthCell s={health.errs > 0 ? { tone: "bad", text: String(health.errs), sub: "see Admin → App errors" } : { tone: "idle", text: "0" }} />
                </div>
              </div>
              {health.lowBattery && <p className="flex items-center gap-1 text-body-sm text-danger"><BatteryLow className="h-4 w-4" aria-hidden="true" /> Low battery</p>}
              {row?.protection?.length > 0 && <p className="flex flex-wrap gap-1">{row.protection.map((p) => <StatusChip key={p.tablet.id} tone={PROTECTION_TONE[p.tone]}>{tabletKind(p.tablet)}: {PROTECTION_LABEL[p.tone]}</StatusChip>)}</p>}
              <Link to="/admin/kiosks" className="inline-flex min-h-9 items-center gap-1 text-body-sm font-semibold text-primary"><TabletSmartphone className="h-4 w-4" aria-hidden="true" /> Kiosk tablets <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          ) : <p role="status" className="text-body-sm text-muted-foreground">Loading…</p>}
        </Section>

        <Section icon={AlertTriangle} title="Needs attention">
          {alerts.length === 0 ? <p className="text-body-sm text-muted-foreground">Nothing needs attention on this bus.</p> : (
            <ul className="space-y-1" aria-label={`${bus.name} alerts`}>
              {alerts.map((a) => {
                const chip = <StatusChip tone={a.tone}>{a.tone === "danger" ? "Urgent" : a.tone === "warning" ? "Check" : "Note"}</StatusChip>;
                // Alerts about where the bus is or its GPS are answered here.
                return ["fleet", "health"].includes(a.go)
                  ? <li key={a.key} className="flex min-h-11 items-center gap-2 px-2">{chip}<span className="flex-1 text-body-sm">{a.text}</span></li>
                  : (
                    <li key={a.key}><Link to={`/admin/${a.go}`} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-accent/60">
                      {chip}<span className="flex-1 text-body-sm">{a.text}</span><ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </Link></li>
                  );
              })}
            </ul>
          )}
        </Section>
      </SheetContent>
    </Sheet>
  );
}
