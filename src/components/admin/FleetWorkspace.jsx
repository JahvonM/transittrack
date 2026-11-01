import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { EmptyState, Kpi, KpiRow, PageIntro, Panel, StatusChip } from "@/components/admin/kit";
import { AlertTriangle, Bus, Camera, ChevronRight, Inbox, MapPin, Users, Wrench } from "lucide-react";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import { busSummaries, cameraTablets, fleetAlerts } from "@/lib/fleetWorkspace";
import { PROTECTION_LABEL } from "@/lib/kioskProtection";
import TabletRemoteViewer from "@/components/admin/TabletRemoteViewer";

const FleetMap = lazy(() => import("@/components/manager/FleetMap"));

// Admin → Fleet workspace: the live map, one line per bus (location, shift,
// on board, tablets, faults, last inspection) and the alerts worth acting on.
// Cameras are a separate trial, off until switched on.

const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE, hour: "numeric", minute: "2-digit" }) : "");
const LOCATION_TEXT = { live: "Live", last_known: "Last known", unavailable: "No location" };
const LOCATION_TONE = { live: "success", last_known: "warning", unavailable: "neutral" };
const PROTECTION_TONE = { ok: "success", limited: "warning", setup: "warning", unsupported: "neutral", failed: "danger" };
const MAX_FEEDS = 4;

function CameraTrial({ kiosks, vehicles }) {
  const [on, setOn] = useState(false);
  const [picked, setPicked] = useState([]);
  const tablets = cameraTablets(kiosks);
  const busName = (id) => vehicles.find((v) => v.id === id)?.name || "Bus";
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_FEEDS ? p : [...p, id]));
  return (
    <Panel title="Cameras (trial)" icon={Camera} description="Road-facing cameras on driver tablets, for testing only until the hardware and access rules are checked."
      actions={<label className="flex items-center gap-2 text-body-sm"><Switch checked={on} onCheckedChange={(v) => { setOn(v); if (!v) setPicked([]); }} aria-label="Show camera trial" />Show</label>}>
      {!on ? (
        <p className="text-body-sm text-muted-foreground">Off. Each view asks the tablet, shows a Stop button on the tablet while live, is logged, and ends after 10 minutes. Boarding tablets' QR cameras and passenger-cabin views are not offered here, and passengers never see these.</p>
      ) : tablets.length === 0 ? (
        <p className="text-body-sm">No driver tablet can be viewed yet. A tablet needs the McSween kiosk app with direct viewing (Kiosk tablets → the tablet → Screen &amp; camera).</p>
      ) : (
        <div className="space-y-3">
          <fieldset>
            <legend className="text-body-sm font-semibold">Choose up to {MAX_FEEDS}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {tablets.map((k) => (
                <label key={k.id} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-body-sm ${picked.includes(k.id) ? "border-primary" : "border-border"}`}>
                  <input type="checkbox" checked={picked.includes(k.id)} disabled={!picked.includes(k.id) && picked.length >= MAX_FEEDS} onChange={() => toggle(k.id)} />
                  {busName(k.vehicle_id)} · {k.label || "Driver tablet"}
                </label>
              ))}
            </div>
          </fieldset>
          <div className={`grid gap-3 ${picked.length > 1 ? "md:grid-cols-2" : ""}`}>
            {picked.map((id) => { const k = tablets.find((t) => t.id === id); return k ? <div key={id}><p className="mb-1 text-body-sm font-semibold">{busName(k.vehicle_id)} · {k.label}</p><TabletRemoteViewer device={k} /></div> : null; })}
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function FleetWorkspace({ vehicles = [], kiosks = [], checkIns = [], faults = [], inspections = [] }) {
  const [shifts, setShifts] = useState([]);
  const [openRequests, setOpenRequests] = useState(0);
  const [now, setNow] = useState(Date.now());
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
  const live = rows.filter((r) => r.location.state === "live").length;
  const counted = rows.filter((r) => r.onBoard != null);
  const onBoard = counted.reduce((n, r) => n + r.onBoard, 0);
  return (
    <div className="space-y-4">
      <PageIntro>The fleet at a glance: where each bus is, who is on board where the count is reliable, tablets and what needs attention.</PageIntro>
      <KpiRow>
        <Kpi label="Buses with live location" value={`${live}/${vehicles.length}`} icon={Bus} />
        <Kpi label="On board now" value={counted.length ? onBoard : "—"} detail={counted.length ? `${counted.length} bus${counted.length === 1 ? "" : "es"} with a boarding tablet reporting` : "No boarding tablet reporting"} icon={Users} />
        <Kpi label="Open faults" value={faults.filter((f) => f.status !== "resolved").length} icon={Wrench} tone={faults.length ? "warning" : undefined} />
        <Kpi label="Passenger requests" value={openRequests} icon={Inbox} />
      </KpiRow>
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Live map" icon={MapPin} bodyClassName="p-0 overflow-hidden rounded-b-2xl">
          <div className="h-[420px]"><Suspense fallback={<p role="status" className="p-4 text-body-sm">Loading the map…</p>}><FleetMap vehicles={vehicles} /></Suspense></div>
        </Panel>
        <Panel title="Buses" icon={Bus} bodyClassName="p-2 pt-0">
          {rows.length === 0 ? <EmptyState icon={Bus} title="No buses yet" /> : (
            <ul className="space-y-1" aria-label="Buses">
              {rows.map((r) => (
                <li key={r.vehicle.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="mr-auto">{r.vehicle.name}</strong>
                    <StatusChip tone={LOCATION_TONE[r.location.state]}>{LOCATION_TEXT[r.location.state]}{r.location.state === "last_known" ? ` · ${time(r.location.at)}` : ""}</StatusChip>
                  </div>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    {r.shift ? `Shift open since ${time(r.shift.started_at)}${r.shift.driver_name ? ` · ${r.shift.driver_name}` : ""}` : "No shift open"}
                    {" · "}{r.onBoard != null ? `${r.onBoard} on board` : r.onBoardWhy}
                    {r.faults ? ` · ${r.faults} open fault${r.faults === 1 ? "" : "s"}` : ""}
                    {r.lastInspection ? ` · last check ${r.lastInspection.condition || r.lastInspection.status || ""} ${new Date(r.lastInspection.inspection_date || r.lastInspection.created_date).toLocaleDateString([], { day: "numeric", month: "short" })}` : ""}
                  </p>
                  {r.protection.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{r.protection.map((p) => <StatusChip key={p.tablet.id} tone={PROTECTION_TONE[p.tone]}>{p.tablet.kiosk_type === "driver" ? "Driver" : p.tablet.kiosk_type === "bus_boarding" ? "Boarding" : "Signing"}: {PROTECTION_LABEL[p.tone]}</StatusChip>)}</p>}
                </li>
              ))}
            </ul>
          )}
          <Link to="/admin/health" className="mt-2 inline-flex min-h-11 items-center gap-1 px-2 text-body-sm font-semibold text-primary">Tablet details in Fleet health<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
        </Panel>
      </div>
      <CameraTrial kiosks={kiosks} vehicles={vehicles} />
    </div>
  );
}
