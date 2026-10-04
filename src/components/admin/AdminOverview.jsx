import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Bus, ChevronRight, CircleCheck, Gauge, OctagonAlert, SatelliteDish, Siren, Users, Wrench } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { computeOccupancyByVehicle } from "@/lib/occupancy";
import { freshnessOf, formatAge } from "@/components/system/status";
import { busNumber, busStatusLine } from "@/components/passenger/passengerState";
import RecentActivityFeed from "@/components/admin/RecentActivityFeed";

const LiveTransitMap = lazy(() => import("@/components/map3d/LiveTransitMap"));

// One status word for a bus, for staff (emergencies included).
export function fleetStatus(v, now = Date.now()) {
  if (v.status === "emergency") return { key: "sos", label: "SOS", tone: "danger" };
  if (v.in_service === false) return { key: "out", label: "Out of service", tone: "warning" };
  if (!v.tracking_active || v.current_lat == null) return { key: "idle", label: "Not tracking", tone: "offline" };
  const f = freshnessOf(v.last_location_update, { now });
  if (f.state === "lost" || f.state === "unknown") return { key: "lost", label: "Signal lost", tone: "warning" };
  if (v.status === "speeding") return { key: "speed", label: "Speeding", tone: "danger" };
  if (f.state === "stale") return { key: "stale", label: "Delayed signal", tone: "warning" };
  return { key: "live", label: "On route", tone: "success" };
}

const PILL = {
  success: "text-success", warning: "text-warning", danger: "text-danger", offline: "text-muted-foreground", info: "text-info",
};
const DOT = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", offline: "bg-offline", info: "bg-info" };

export function StatusPill({ status }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-body-sm font-semibold", PILL[status.tone])}>
      <span className={cn("h-2 w-2 rounded-full", DOT[status.tone], status.key === "live" && "tt-live-pulse text-success")} aria-hidden="true" />
      {status.label}
    </span>
  );
}

function Stat({ icon: Icon, tone, value, label, detail, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[96px] min-w-0 flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent sm:flex-row sm:items-center sm:gap-4">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl sm:h-12 sm:w-12", tone)} aria-hidden="true">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
      <span className="min-w-0 max-w-full">
        <span className="block font-display text-[2.25rem] font-semibold leading-none tabular-nums">{value}</span>
        <span className="mt-1 block text-body-sm font-semibold">{label}</span>
        {detail && <span className="block truncate text-caption text-muted-foreground">{detail}</span>}
      </span>
    </button>
  );
}

function Panel({ title, action, children, className }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl border border-border bg-card", className)} aria-label={title}>
      <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h2 className="text-title-sm font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const ViewAll = ({ onClick, label = "View all" }) => (
  <button type="button" onClick={onClick} className="flex items-center gap-1 text-body-sm font-semibold text-muted-foreground hover:text-foreground">
    {label} <ChevronRight className="h-4 w-4" aria-hidden="true" />
  </button>
);

/**
 * Fleet operations at a glance: the four numbers that matter, the live
 * fleet beside the 3D map, then what needs attention next to what just
 * happened. Reads the data Admin already loads (plus boardings for the
 * passenger count); changes nothing.
 */
export default function AdminOverview({ vehicles, routes, trips, faults, schedules, companies, parts, onNavigate, tools }) {
  const [occupancy, setOccupancy] = useState({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const load = () => base44.entities.StaffCheckIn.list("-created_date", 500).then((rows) => setOccupancy(computeOccupancyByVehicle(rows))).catch(() => {});
    load();
    const unsub = base44.entities.StaffCheckIn.subscribe(() => load());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { unsub?.(); clearInterval(t); };
  }, []);

  const routeOf = (v) => routes.find((r) => r.id === v.route_id) || null;
  const statuses = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, fleetStatus(v, now)])), [vehicles, now]);
  const live = vehicles.filter((v) => ["live", "stale", "speed"].includes(statuses[v.id].key));
  const signal = vehicles.filter((v) => ["lost", "stale"].includes(statuses[v.id].key));
  const sos = vehicles.filter((v) => v.status === "emergency");
  const majorFaults = faults.filter((f) => f.status !== "resolved" && (f.severity === "high" || f.severity === "critical"));
  const onBoard = Object.values(occupancy).reduce((a, b) => a + (b || 0), 0);
  const activeTrips = trips.filter((t) => ["scheduled", "on_the_way", "arrived"].includes(t.status));
  const openFaults = faults.filter((f) => f.status === "open");
  const dueSchedules = schedules.filter((s) => s.status === "due" || s.status === "overdue");

  const ORDER = { sos: 0, speed: 1, lost: 2, stale: 3, live: 4, out: 5, idle: 6 };
  const fleetRows = [...vehicles].sort((a, b) => ORDER[statuses[a.id].key] - ORDER[statuses[b.id].key] || String(a.name).localeCompare(String(b.name), undefined, { numeric: true })).slice(0, 7);

  const attention = [
    ...sos.map((v) => ({ key: `sos-${v.id}`, tone: "danger", icon: Siren, title: `${v.name}: SOS`, detail: v.driver_name || v.company_name || "Driver alert", go: "fleet" })),
    ...vehicles.filter((v) => statuses[v.id].key === "speed").map((v) => ({ key: `sp-${v.id}`, tone: "danger", icon: Gauge, title: `${v.name} speeding`, detail: v.driver_name || "", go: "fleet" })),
    ...majorFaults.slice(0, 4).map((f) => ({ key: `f-${f.id}`, tone: f.severity === "critical" ? "danger" : "warning", icon: OctagonAlert, title: f.title || "Fault", detail: [f.vehicle_name, f.severity].filter(Boolean).join(" · "), go: "faults" })),
    ...schedules.filter((s) => s.status === "overdue").slice(0, 3).map((s) => ({ key: `m-${s.id}`, tone: "warning", icon: Wrench, title: `${s.service_type || "Service"} overdue`, detail: s.vehicle_name || "", go: "schedule" })),
    ...signal.filter((v) => statuses[v.id].key === "lost").slice(0, 3).map((v) => ({ key: `l-${v.id}`, tone: "warning", icon: SatelliteDish, title: `${v.name}: signal lost`, detail: `Last fix ${formatAge(freshnessOf(v.last_location_update, { now }).ageMs) || "unknown"}`, go: "fleet" })),
  ];
  const TONE_BG = { danger: "border-danger/40 bg-danger/12", warning: "border-warning/35 bg-warning/12" };
  const TONE_FG = { danger: "text-danger", warning: "text-warning" };

  return (
    <div className="space-y-6">
      <section aria-label="Fleet overview" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={Bus} tone="bg-primary/15 text-primary" value={live.length} label="Active buses" detail={`of ${vehicles.length} in the fleet`} onClick={() => onNavigate("fleet")} />
        <Stat icon={SatelliteDish} tone="bg-warning/15 text-warning" value={signal.length} label="Signal issues" detail="GPS late or lost" onClick={() => onNavigate("fleet")} />
        <Stat icon={OctagonAlert} tone="bg-danger/15 text-danger" value={sos.length + majorFaults.length} label="Major issues" detail={`${sos.length} SOS · ${majorFaults.length} serious faults`} onClick={() => onNavigate(sos.length ? "fleet" : "faults")} />
        <Stat icon={Users} tone="bg-info/15 text-info" value={onBoard} label="Passengers" detail="On board now" onClick={() => onNavigate("checkins")} />
      </section>

      <ul className="m-0 flex list-none flex-wrap gap-x-8 gap-y-2 p-0 text-body-sm" aria-label="Fleet totals">
        {[
          ["Vehicles", vehicles.length, "vehicles"], ["Active trips", activeTrips.length, "trips"], ["Companies", companies.length, "companies"],
          ["Open faults", openFaults.length, "faults"], ["Maintenance due", dueSchedules.length, "schedule"], ["Parts", parts.length, "parts"],
        ].map(([k, v, go]) => (
          <li key={k}>
            <button type="button" onClick={() => onNavigate(go)} className="flex min-h-[44px] items-baseline gap-2 rounded-md py-2 hover:text-foreground">
              <span className="font-display text-title font-semibold tabular-nums">{v}</span>
              <span className="text-muted-foreground">{k}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel title="Live Fleet" action={<ViewAll onClick={() => onNavigate("fleet")} />}>
          <ul className="divide-y divide-border px-2 pb-2">
            {fleetRows.map((v) => {
              const st = statuses[v.id];
              const num = busNumber(v.name);
              return (
                <li key={v.id}>
                  <button type="button" onClick={() => onNavigate("fleet")} className="flex min-h-[60px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent/60">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary font-display text-title-sm font-semibold tabular-nums" aria-hidden="true">{num || <Bus className="h-4 w-4" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{v.name}<span className="font-normal text-muted-foreground">{routeOf(v)?.name ? ` · ${routeOf(v).name}` : ""}</span></span>
                      <span className="block truncate text-body-sm text-muted-foreground">{busStatusLine(v, routeOf(v), now)}</span>
                    </span>
                    {occupancy[v.id] > 0 && <span className="hidden shrink-0 text-body-sm tabular-nums text-muted-foreground sm:inline">{occupancy[v.id]}{v.capacity ? `/${v.capacity}` : ""}</span>}
                    <StatusPill status={st} />
                  </button>
                </li>
              );
            })}
            {!vehicles.length && <li className="px-3 py-8 text-center text-body-sm text-muted-foreground">No vehicles registered yet.</li>}
          </ul>
        </Panel>

        <Panel title="Fleet Map" action={<ViewAll onClick={() => onNavigate("fleet")} label="Open Live Fleet" />} className="overflow-hidden">
          <div className="px-3 pb-3">
            <Suspense fallback={<div className="h-[420px] animate-pulse rounded-xl bg-muted" />}>
              <LiveTransitMap
                variant="page"
                className="h-[420px] rounded-xl"
                vehicles={vehicles.filter((v) => v.current_lat != null)}
                label="Fleet map"
              />
            </Suspense>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Items requiring attention">
          <div className="space-y-2 px-4 pb-4">
            {attention.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-body-sm text-muted-foreground"><CircleCheck className="h-5 w-5 text-success" aria-hidden="true" /> Nothing needs attention right now.</p>
            ) : attention.slice(0, 8).map((a) => {
              const Icon = a.icon;
              return (
                <button key={a.key} type="button" onClick={() => onNavigate(a.go)} className={cn("flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left hover:brightness-110", TONE_BG[a.tone])}>
                  <Icon className={cn("h-5 w-5 shrink-0", TONE_FG[a.tone])} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{a.title}</span>
                    {a.detail && <span className="block truncate text-body-sm text-muted-foreground">{a.detail}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </Panel>
        <RecentActivityFeed onNavigate={onNavigate} />
      </div>

      {tools}
    </div>
  );
}

