import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Bus, History, Lock, Radar, Radio, Search, Unlock, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import BusDistance from "@/components/BusDistance";
import useUserLocation from "@/hooks/useUserLocation";
import { useToast } from "@/components/ui/use-toast";
import { computeOccupancyByVehicle } from "@/lib/occupancy";
import { freshnessOf, formatAge } from "@/components/system/status";
import { busNumber, busStatusLine, sortStops } from "@/components/passenger/passengerState";
import { fleetStatus, StatusPill } from "@/components/admin/AdminOverview";
import LocationReplay from "@/components/replay/LocationReplay";

const LiveTransitMap = lazy(() => import("@/components/map3d/LiveTransitMap"));

const FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "live", label: "On route", test: (k) => ["live", "stale", "speed"].includes(k) },
  { id: "issues", label: "Issues", test: (k) => ["sos", "speed", "lost", "stale", "out"].includes(k) },
  { id: "idle", label: "Not tracking", test: (k) => k === "idle" },
];
const ORDER = { sos: 0, speed: 1, lost: 2, stale: 3, live: 4, out: 5, idle: 6 };

const ACTION =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 text-body-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50";

export default function LiveFleetTab({ vehicles, routes = [], onVehicleUpdate }) {
  const { toast } = useToast();
  const { location: userLoc } = useUserLocation();
  const [busy, setBusy] = useState(null);
  const [occupancy, setOccupancy] = useState({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(() => Date.now());
  const withLocation = vehicles.filter((v) => v.current_lat != null);
  // Tapping a bus in the list centres the map on it.
  const [focus, setFocus] = useState({ id: null, n: 0 });
  const mapBox = useRef(null);
  // "live" = where buses are now, "history" = replay a past day.
  const [view, setView] = useState("live");
  const [historyId, setHistoryId] = useState("");
  // On phones the map sits above the list; bring it into view after a pick.
  const revealMap = () => {
    if (window.matchMedia?.("(min-width: 1024px)").matches) return;
    mapBox.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const showHistory = (v) => {
    setView("history");
    setHistoryId(v.id);
    setFocus((f) => ({ id: v.id, n: f.n }));
    revealMap();
  };
  const showOnMap = (v) => {
    if (view === "history") { showHistory(v); return; }
    setFocus((f) => ({ id: v.id, n: f.n + 1 }));
    if (v.current_lat == null) toast({ title: `${v.name} has no location yet` });
    revealMap();
  };

  // Every boarding/exit already lands in StaffCheckIn — this just aggregates
  // the latest record per person per vehicle into a live headcount, so
  // dispatch can see "14 aboard" without opening the sign-in log.
  useEffect(() => {
    const load = () => {
      base44.entities.StaffCheckIn.list("-created_date", 500).then((list) => {
        setOccupancy(computeOccupancyByVehicle(list));
      });
    };
    load();
    const unsub = base44.entities.StaffCheckIn.subscribe(() => load());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { unsub?.(); clearInterval(t); };
  }, []);

  const remoteStart = async (v) => {
    setBusy(v.id);
    try {
      await base44.entities.Vehicle.update(v.id, { remote_tracking_lock: true, tracking_active: true });
      onVehicleUpdate?.({ ...v, remote_tracking_lock: true, tracking_active: true });
      toast({ title: "Tracking enforced", description: `${v.name} — driver tablet will auto-start on next heartbeat.` });
    } catch {
      toast({ title: "Failed to start tracking", variant: "destructive" });
    } finally { setBusy(null); }
  };

  const releaseLock = async (v) => {
    setBusy(v.id);
    try {
      await base44.entities.Vehicle.update(v.id, { remote_tracking_lock: false });
      onVehicleUpdate?.({ ...v, remote_tracking_lock: false });
      toast({ title: "Lock released", description: `${v.name} can now stop tracking manually.` });
    } catch {
      toast({ title: "Failed to release lock", variant: "destructive" });
    } finally { setBusy(null); }
  };

  const routeOf = (v) => routes.find((r) => r.id === v.route_id) || null;
  const statuses = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, fleetStatus(v, now)])), [vehicles, now]);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, vehicles.filter((v) => f.test(statuses[v.id].key)).length]));
  const q = query.trim().toLowerCase();
  const rows = vehicles
    .filter((v) => FILTERS.find((f) => f.id === filter).test(statuses[v.id].key))
    .filter((v) => !q || [v.name, v.plate_number, v.driver_name, v.driver_email, v.company_name, routeOf(v)?.name].some((s) => String(s || "").toLowerCase().includes(q)))
    .sort((a, b) => ORDER[statuses[a.id].key] - ORDER[statuses[b.id].key] || String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));

  const selectedId = view === "history" ? historyId : focus.id;
  const selected = vehicles.find((v) => v.id === focus.id) || null;
  const selRoute = selected ? routeOf(selected) : null;
  const selStops = useMemo(() => sortStops(selRoute?.stops).filter((s) => s.lat != null && s.lng != null), [selRoute]);
  const callout = selected?.current_lat != null
    ? { primary: selected.name, secondary: busStatusLine(selected, selRoute, now), tone: ["lost", "idle"].includes(statuses[selected.id].key) ? "lost" : "live" }
    : null;

  const list = (
    <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card" aria-label="Buses">
      <div className="space-y-3 p-3">
        <label className="relative block">
          <span className="sr-only">Search buses</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bus, plate, driver or route"
            className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter buses">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-body-sm font-semibold transition-colors",
                filter === f.id ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label} <span className="tabular-nums opacity-80">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto border-t border-border px-2 py-1 lg:max-h-[calc(100vh-17rem)]">
        {rows.map((v) => {
          const st = statuses[v.id];
          const num = busNumber(v.name);
          const on = selectedId === v.id;
          return (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => showOnMap(v)}
                aria-pressed={on}
                aria-label={`${v.name}, ${st.label}${view === "history" ? ". Replay" : ". Show on the map"}`}
                className={cn("my-1 flex min-h-[64px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors", on ? "bg-primary/12 ring-1 ring-primary/60" : "hover:bg-accent/60")}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary font-display text-title-sm font-semibold tabular-nums" aria-hidden="true">
                  {num || <Bus className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate font-semibold">
                    <span className="truncate">{v.name}</span>
                    {v.remote_tracking_lock && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  </span>
                  <span className="block truncate text-body-sm text-muted-foreground">{routeOf(v)?.name || v.driver_name || v.company_name || "No route"}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <StatusPill status={st} />
                  {occupancy[v.id] > 0 && (
                    <span className="inline-flex items-center gap-1 text-caption tabular-nums text-muted-foreground">
                      <Users className="h-3 w-3" aria-hidden="true" /> {occupancy[v.id]}{v.capacity ? `/${v.capacity}` : ""}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-3 py-10 text-center text-body-sm text-muted-foreground">
            {vehicles.length === 0 ? "No vehicles registered yet." : "No buses match."}
          </li>
        )}
      </ul>
    </section>
  );

  const detail = selected && view === "live" && (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label={`${selected.name} details`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-title font-bold">{selected.name}</h2>
            <StatusPill status={statuses[selected.id]} />
            {selected.remote_tracking_lock && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-caption font-semibold"><Lock className="h-3 w-3" aria-hidden="true" /> Tracking locked on</span>
            )}
          </div>
          <p className="mt-0.5 text-body-sm text-muted-foreground">{busStatusLine(selected, selRoute, now)}</p>
        </div>
        <button type="button" onClick={() => setFocus((f) => ({ id: null, n: f.n }))} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-accent" aria-label="Close bus details">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-x-4 gap-y-3 text-body-sm">
        {[
          ["Route", selRoute?.name || "None"],
          ["Driver", selected.driver_name || selected.driver_email || "Unassigned"],
          ["Company · plate", [selected.company_name, selected.plate_number].filter(Boolean).join(" · ") || "—"],
          ["Last fix", selected.current_lat != null ? formatAge(freshnessOf(selected.last_location_update, { now }).ageMs) || "Unknown" : "No location yet"],
          ["On board", occupancy[selected.id] > 0 ? `${occupancy[selected.id]}${selected.capacity ? ` of ${selected.capacity}` : ""}` : "0"],
        ].map(([k, val]) => (
          <div key={k} className="min-w-0">
            <dt className="text-caption text-muted-foreground">{k}</dt>
            <dd className="break-words font-semibold">{val}</dd>
          </div>
        ))}
      </dl>
      {selected.current_lat != null && userLoc && <div className="mt-3"><BusDistance vehicle={selected} userLocation={userLoc} /></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => showHistory(selected)} className={cn(ACTION, "border-border bg-background hover:bg-accent")}>
          <History className="h-4 w-4" aria-hidden="true" /> Past trips
        </button>
        {!selected.tracking_active && (
          <button type="button" disabled={busy === selected.id} onClick={() => remoteStart(selected)} className={cn(ACTION, "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}>
            <Radar className="h-4 w-4" aria-hidden="true" /> Start tracking
          </button>
        )}
        {selected.remote_tracking_lock && (
          <button type="button" disabled={busy === selected.id} onClick={() => releaseLock(selected)} className={cn(ACTION, "border-border bg-background hover:bg-accent")}>
            <Unlock className="h-4 w-4" aria-hidden="true" /> Release lock
          </button>
        )}
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-secondary p-1" role="tablist" aria-label="Map view">
          {[
            { id: "live", label: "Live", icon: Radio },
            { id: "history", label: "History", icon: History },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => {
                setView(id);
                if (id === "history" && !historyId) setHistoryId(focus.id || vehicles[0]?.id || "");
              }}
              className={cn(
                "flex h-10 items-center gap-2 rounded-lg px-4 text-body-sm font-semibold transition-colors",
                view === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <p className="text-body-sm text-muted-foreground">
          {view === "live"
            ? `${withLocation.length} of ${vehicles.length} vehicles with a last known position`
            : "Pick a bus and a day to replay where it went"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <div ref={mapBox} className="min-w-0 scroll-mt-20 space-y-4 lg:order-last" role="tabpanel">
          {view === "live" ? (
            <>
              <Suspense fallback={<div className="h-[46vh] animate-pulse rounded-2xl bg-muted lg:h-[calc(100vh-17rem)]" />}>
                <LiveTransitMap
                  variant="page"
                  className={cn("h-[46vh] min-h-[320px] rounded-2xl border border-border", selected ? "lg:h-[calc(100vh-30rem)] lg:min-h-[380px]" : "lg:h-[calc(100vh-17rem)]")}
                  vehicles={withLocation}
                  focusVehicleId={selected?.current_lat != null ? selected.id : null}
                  focusKey={focus.n}
                  stops={selected ? selStops : []}
                  userLocation={selected ? null : userLoc}
                  callout={callout}
                  label="Live fleet map"
                />
              </Suspense>
              {detail}
            </>
          ) : (
            <LocationReplay vehicles={vehicles} initialVehicleId={historyId} />
          )}
        </div>
        {list}
      </div>
    </div>
  );
}
