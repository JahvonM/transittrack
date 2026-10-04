import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import useUserLocation from "@/hooks/useUserLocation";
import { AlertTriangle, Bus, Gauge, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { busNumber, busStatusLine, sortStops } from "@/components/passenger/passengerState";
import { fleetStatus, StatusPill } from "@/components/admin/AdminOverview";

const LiveTransitMap = lazy(() => import("@/components/map3d/LiveTransitMap"));
const ORDER = { sos: 0, speed: 1, lost: 2, stale: 3, live: 4, out: 5, idle: 6 };

// The company's buses beside the 3D map. Read-only: picking a bus flies the
// map to it and draws its route.
export default function FleetMap({ vehicles }) {
  const { location: userLoc } = useUserLocation();
  const [liveVehicles, setLiveVehicles] = useState(vehicles);
  const [routes, setRoutes] = useState([]);
  const [focus, setFocus] = useState({ id: null, n: 0 });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setLiveVehicles(vehicles);
    const unsub = base44.entities.Vehicle.subscribe((event) => {
      setLiveVehicles((prev) => {
        if (event.type === "delete") return prev.filter((v) => v.id !== event.id);
        const rec = event.data;
        if (!rec) return prev;
        const idx = prev.findIndex((v) => v.id === event.id);
        return idx === -1 ? [...prev, rec] : prev.map((v) => (v.id === event.id ? rec : v));
      });
    });
    return unsub;
  }, [vehicles]);

  useEffect(() => {
    base44.entities.Route.list().then((r) => setRoutes(r || [])).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const alerts = liveVehicles.filter((v) => v.status === "speeding" || v.status === "emergency");
  const routeOf = (v) => routes.find((r) => r.id === v.route_id) || null;
  const statuses = useMemo(() => Object.fromEntries(liveVehicles.map((v) => [v.id, fleetStatus(v, now)])), [liveVehicles, now]);
  const rows = [...liveVehicles].sort((a, b) => ORDER[statuses[a.id].key] - ORDER[statuses[b.id].key] || String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  const selected = liveVehicles.find((v) => v.id === focus.id) || null;
  const selRoute = selected ? routeOf(selected) : null;
  const selStops = useMemo(() => sortStops(selRoute?.stops).filter((s) => s.lat != null && s.lng != null), [selRoute]);
  const callout = selected?.current_lat != null ? { primary: selected.name, secondary: busStatusLine(selected, selRoute, now), tone: "live" } : null;

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <section className="rounded-2xl border border-danger/40 bg-danger/10 p-4" aria-label="Vehicles that need attention">
          <p className="mb-2 flex items-center gap-2 font-semibold text-danger">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" /> {alerts.length} vehicle{alerts.length === 1 ? "" : "s"} need{alerts.length === 1 ? "s" : ""} attention
          </p>
          <div className="flex flex-wrap gap-2">
            {alerts.map((v) => (
              <span key={v.id} className="flex items-center gap-1.5 rounded-lg bg-background/60 px-3 py-1.5 text-body-sm font-semibold">
                {v.status === "emergency" ? <Siren className="h-4 w-4 text-danger" aria-hidden="true" /> : <Gauge className="h-4 w-4 text-warning" aria-hidden="true" />}
                {v.name} · {v.status === "emergency" ? "SOS" : "Speeding"}
              </span>
            ))}
          </div>
        </section>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <div className="min-w-0 lg:order-last">
          <Suspense fallback={<div className="h-[46vh] animate-pulse rounded-2xl bg-muted" />}>
            <LiveTransitMap
              variant="page"
              className="h-[46vh] min-h-[320px] rounded-2xl border border-border lg:h-[calc(100vh-19rem)]"
              vehicles={liveVehicles.filter((v) => v.current_lat != null)}
              focusVehicleId={selected?.current_lat != null ? selected.id : null}
              focusKey={focus.n}
              stops={selected ? selStops : []}
              userLocation={selected ? null : userLoc}
              callout={callout}
              label="Fleet map"
            />
          </Suspense>
        </div>
        <section className="min-w-0 rounded-2xl border border-border bg-card" aria-label="Buses">
          <h2 className="px-5 pb-2 pt-4 text-title-sm font-bold">Buses</h2>
          <ul className="divide-y divide-border px-2 pb-2 lg:max-h-[calc(100vh-22rem)] lg:overflow-y-auto">
            {rows.map((v) => {
              const st = statuses[v.id];
              const on = focus.id === v.id;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFocus((f) => ({ id: v.id, n: f.n + 1 }))}
                    className={cn("my-1 flex min-h-[60px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left", on ? "bg-primary/12 ring-1 ring-primary/60" : "hover:bg-accent/60")}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary font-display text-title-sm font-semibold tabular-nums" aria-hidden="true">
                      {busNumber(v.name) || <Bus className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{v.name}</span>
                      <span className="block truncate text-body-sm text-muted-foreground">{busStatusLine(v, routeOf(v), now)}</span>
                    </span>
                    <StatusPill status={st} />
                  </button>
                </li>
              );
            })}
            {rows.length === 0 && <li className="px-3 py-8 text-center text-body-sm text-muted-foreground">No buses yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
