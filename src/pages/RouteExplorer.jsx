import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import BusLoader from "@/components/BusLoader";
import { routeProgress } from "@/components/TripProgress";
import { loadFailed } from "@/lib/loadFailed";
import { cn } from "@/lib/utils";
import useUserLocation from "@/hooks/useUserLocation";
import { busNumber, busStatusLine, clock, sortStops } from "@/components/passenger/passengerState";

const LiveTransitMap = lazy(() => import("@/components/map3d/LiveTransitMap"));
const STAFF_ROLES = new Set(["admin", "company"]);

const busLine = busStatusLine;

export default function RouteExplorer() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [focusId, setFocusId] = useState(() => params.get("bus") || null);
  const [focusKey, setFocusKey] = useState(() => (params.get("bus") ? 1 : 0));
  const [expanded, setExpanded] = useState(false);
  const { location: userLoc } = useUserLocation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    Promise.all([base44.entities.Route.list(), base44.entities.Vehicle.list()]).then(([r, v]) => {
      setRoutes(r.filter((x) => x.active)); setVehicles(v); setLoading(false);
    }).catch(() => { setLoading(false); loadFailed(); });
    // Keep positions live while the map is open (read-only, like the home screen).
    const unsub = base44.entities.Vehicle.subscribe((event) => {
      setVehicles((prev) => {
        if (event.type === "delete") return prev.filter((x) => x.id !== event.id);
        const rec = event.data;
        if (!rec) return prev;
        const idx = prev.findIndex((x) => x.id === event.id);
        return idx === -1 ? prev : prev.map((x) => (x.id === event.id ? rec : x));
      });
    });
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => { unsub?.(); clearInterval(tick); };
  }, []);

  // SOS is admin/management-only: passengers never see "emergency".
  const visible = useMemo(
    () => (STAFF_ROLES.has(user?.role) ? vehicles : vehicles.map((v) => (v.status === "emergency" ? { ...v, status: "on_trip" } : v))),
    [vehicles, user?.role],
  );
  const shownVehicles = active ? visible.filter((v) => v.route_id === active) : visible;
  const activeRoute = active ? routes.find((r) => r.id === active) : null;
  const orderedStops = useMemo(() => sortStops(activeRoute?.stops).filter((s) => s.lat != null && s.lng != null), [activeRoute]);
  const allStops = useMemo(() => {
    if (activeRoute) return [];
    const seen = new Set();
    return routes.flatMap((r) => r.stops || []).filter((s) => s.lat != null && s.name && !seen.has(s.name) && seen.add(s.name));
  }, [routes, activeRoute]);
  const routeOf = (v) => routes.find((r) => r.id === v.route_id) || null;
  const pickup = typeof window !== "undefined" ? localStorage.getItem("tt_staff_pickup") : null;
  const myStop = useMemo(() => {
    if (!pickup) return null;
    return [...orderedStops, ...allStops].find((s) => s.name === pickup) || null;
  }, [pickup, orderedStops, allStops]);

  const located = shownVehicles.filter((v) => v.current_lat != null);
  const focus = located.find((v) => v.id === focusId) || null;
  const focusRoute = focus ? routeOf(focus) : null;
  const focusStops = sortStops(focusRoute?.stops).filter((s) => s.lat != null && s.lng != null);
  const focusNextIndex = focus && focusStops.length > 1 ? routeProgress(focusStops, focus.current_lat, focus.current_lng)?.nextIndex ?? null : null;
  const focusNext = focusNextIndex != null ? focusStops[focusNextIndex] : null;
  const live = (v) => v.tracking_active && v.current_lat != null;
  const sorted = [...shownVehicles].sort((a, b) => Number(live(b)) - Number(live(a)) || String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));

  const pick = (id) => {
    setFocusId(id);
    setFocusKey((k) => k + 1);
    setExpanded(false);
    const next = new URLSearchParams(params);
    next.set("bus", id);
    setParams(next, { replace: true });
  };

  return (
    <AppLayout variant="passenger" fullBleed>
      <h1 className="sr-only">Map</h1>
      {loading ? <BusLoader label="Loading routes…" className="py-10" /> : (
        <div className="flex h-[calc(100dvh-60px-env(safe-area-inset-bottom))] flex-col md:h-[calc(100dvh-64px)] md:flex-row-reverse">
          <div className="relative min-h-0 flex-1">
            <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
              <LiveTransitMap
                variant="page"
                defaultSatellite
                className="h-full w-full"
                vehicles={located}
                focusVehicleId={focus?.id || null}
                focusKey={focusKey}
                userLocation={userLoc}
                followUser={!focus}
                stops={focus ? focusStops : orderedStops}
                looseStops={focus ? [] : allStops}
                myStop={myStop}
                nextStopIndex={focusNextIndex}
                callout={focus ? { primary: focus.name, secondary: focusNext ? `Next: ${focusNext.name}` : undefined, tone: live(focus) ? "live" : "lost" } : null}
                label={activeRoute ? `Live map of ${activeRoute.name}` : "Live map of all routes"}
              />
            </Suspense>
          </div>

          <section
            className={cn(
              "relative z-10 flex min-h-0 flex-col border-t border-border bg-background md:max-h-none md:w-[380px] md:border-r md:border-t-0",
              expanded ? "max-h-[70%]" : "max-h-[38%]",
            )}
            aria-label="Routes and buses"
          >
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex h-11 w-full shrink-0 items-center justify-center gap-1.5 text-body-sm font-semibold text-muted-foreground md:hidden"
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
              {sorted.filter(live).length} of {sorted.length} buses live
            </button>
            <div className="tt-no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 md:px-5 md:pt-5" role="group" aria-label="Choose a route">
              {[{ id: null, name: "All routes" }, ...routes].map((r) => {
                const on = active === r.id;
                return (
                  <button
                    key={r.id || "all"}
                    type="button"
                    onClick={() => { setActive(r.id); setFocusId(null); setFocusKey((k) => k + 1); }}
                    aria-pressed={on}
                    className={cn(
                      "h-10 shrink-0 rounded-full border px-4 text-body-sm font-semibold transition-colors",
                      on ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent",
                    )}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto border-t border-border">
              {sorted.length === 0 && <li className="px-5 py-6 text-body-sm text-muted-foreground">No buses on this route.</li>}
              {sorted.map((v) => {
                const num = busNumber(v.name);
                const on = v.id === focus?.id;
                const isLive = live(v);
                const route = routeOf(v);
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => pick(v.id)}
                      disabled={v.current_lat == null}
                      aria-current={on ? "true" : undefined}
                      className={cn("flex min-h-[64px] w-full items-center gap-4 px-5 py-2 text-left hover:bg-accent/50 disabled:cursor-default disabled:hover:bg-transparent", on && "bg-accent")}
                    >
                      <span className={cn("w-10 shrink-0 text-center font-display text-headline font-semibold tabular-nums", !isLive && "text-muted-foreground")} aria-hidden="true">{num || "·"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {v.name}{!active && route ? <span className="font-normal text-muted-foreground"> · {route.name}</span> : null}
                        </span>
                        <span className="flex items-center gap-1.5 truncate text-body-sm text-muted-foreground">
                          {isLive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                          {busLine(v, route, now)}
                        </span>
                      </span>
                      {isLive && v.last_location_update && <span className="shrink-0 text-caption text-muted-foreground">{clock(v.last_location_update)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </AppLayout>
  );
}
