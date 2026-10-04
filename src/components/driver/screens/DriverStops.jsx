import React, { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { haversineKm } from "@/lib/geo";
import { routeProgress } from "@/components/TripProgress";
import { arrivalClock, sortStops } from "@/components/passenger/passengerState";
import useStopEtas from "@/components/passenger/useStopEtas";

/**
 * Stops and passengers for this bus. Stops: the route in order with the
 * time each stop ahead is reached (same estimates as everywhere else) and
 * how many pickups are pinned nearest to it. Passengers: the pickup list
 * and booked trips, passed in by the app.
 */
export default function DriverStops({ session, passengers, trips }) {
  const [tab, setTab] = useState("stops");
  const vehicle = session?.vehicle;
  const route = session?.route;
  const stops = useMemo(() => sortStops(route?.stops).filter((s) => s.lat != null && s.lng != null), [route]);
  const p = vehicle?.current_lat != null && stops.length > 1 ? routeProgress(stops, vehicle.current_lat, vehicle.current_lng) : null;
  const nextIndex = p ? p.nextIndex : null;
  const ahead = useMemo(() => (nextIndex == null ? [] : stops.slice(nextIndex)), [stops, nextIndex]);
  const etas = useStopEtas({ bus: vehicle, route, stops: ahead, record: null, enabled: !!vehicle?.tracking_active && ahead.length > 0 });

  // Each pickup counted at the stop nearest their pinned pickup point.
  const perStop = useMemo(() => {
    const out = {};
    (session?.staff || []).forEach((s) => {
      if (s.skip_pickup_today || s.home_lat == null || !stops.length) return;
      let best = null;
      stops.forEach((st) => { const d = haversineKm(s.home_lat, s.home_lng, st.lat, st.lng); if (!best || d < best.d) best = { d, name: st.name }; });
      if (best) out[best.name] = (out[best.name] || 0) + 1;
    });
    return out;
  }, [session?.staff, stops]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-title font-bold">{route?.name || "No route assigned"}</h1>
          {stops.length > 1 && <p className="truncate text-body-sm text-muted-foreground">{stops[0].name} to {stops[stops.length - 1].name}</p>}
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-secondary p-1" role="tablist" aria-label="Stops or passengers">
        {[["stops", "Stops"], ["people", "Passengers"]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("h-11 rounded-lg text-body font-semibold transition-colors", tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "stops" ? (
        stops.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">This bus has no stops yet. Ask dispatch to assign a route.</p>
        ) : (
          <ol className="m-0 list-none p-0" role="tabpanel">
            {stops.map((st, i) => {
              const passed = nextIndex != null && i < nextIndex;
              const isNext = i === nextIndex;
              const e = etas[st.name];
              const count = perStop[st.name] || 0;
              return (
                <li key={st.name} className={cn("grid min-h-[64px] grid-cols-[32px_minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-xl pr-2", isNext && "bg-card ring-1 ring-primary/50", passed && "text-muted-foreground")}>
                  <span className="relative h-full" aria-hidden="true">
                    {i > 0 && <span className={cn("absolute left-[14px] top-0 h-1/2 w-1", passed || isNext ? "bg-primary" : "bg-border")} />}
                    {i < stops.length - 1 && <span className={cn("absolute bottom-0 left-[14px] top-1/2 w-1", passed ? "bg-primary" : "bg-border")} />}
                    <span className={cn("absolute left-[7px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full border-[3px] bg-background", isNext ? "border-primary" : passed ? "border-primary bg-primary" : "border-muted-foreground/60")} />
                  </span>
                  <span className="min-w-0 py-2">
                    <span className="block truncate font-semibold">{st.name}</span>
                    <span className="block text-body-sm text-muted-foreground">{passed ? "Passed" : isNext ? "Next stop" : i === stops.length - 1 ? "Last stop" : " "}</span>
                  </span>
                  <span className="text-right font-display text-title-sm font-semibold tabular-nums">
                    {!passed && e?.mins != null ? arrivalClock(e.mins) : ""}
                  </span>
                  <span className={cn("inline-flex min-w-[3rem] items-center justify-end gap-1 font-display text-title-sm font-semibold tabular-nums", count ? "text-foreground" : "text-muted-foreground")} aria-label={`${count} pickup${count === 1 ? "" : "s"}`}>
                    <Users className="h-4 w-4" aria-hidden="true" />{count}
                  </span>
                </li>
              );
            })}
          </ol>
        )
      ) : (
        <div className="space-y-4" role="tabpanel">
          {trips}
          {passengers}
        </div>
      )}
    </div>
  );
}
