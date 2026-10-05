import React, { useMemo, useState } from "react";
import { Building2, MapPinPlus, MapPinned, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
const EDIT_RADIUS_M = 150;
const FRESH_MS = 2 * 60_000;

// "Fix a stop" for places the map gets wrong. Uses the bus's last GPS fix:
// near a stop it offers to move that stop here, anywhere else to add a new
// stop here. The server re-checks everything against its own GPS fix.
function StopEditor({ vehicle, stops, invoke, refresh }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const fresh = vehicle?.current_lat != null && Date.now() - Date.parse(vehicle?.last_location_update || "") <= FRESH_MS;
  const nearest = useMemo(() => {
    if (!fresh) return null;
    let best = null;
    stops.forEach((st) => { const d = haversineKm(vehicle.current_lat, vehicle.current_lng, st.lat, st.lng) * 1000; if (!best || d < best.d) best = { d, stop: st }; });
    return best;
  }, [fresh, stops, vehicle?.current_lat, vehicle?.current_lng]);
  if (!invoke) return null;
  const near = nearest && nearest.d <= EDIT_RADIUS_M ? nearest : null;

  const run = async (action, payload, done) => {
    setBusy(true); setMsg(null);
    try {
      const data = await invoke(action, payload);
      if (data?.ok !== true) throw new Error("not saved");
      setMsg({ ok: true, text: done });
      setName("");
      await refresh?.();
    } catch (e) {
      setMsg({ ok: false, text: e?.response?.data?.error || "Couldn't save. Check the connection and try again." });
    } finally { setBusy(false); }
  };

  return (
    <section className="mb-4 rounded-2xl border border-border bg-card p-4" aria-labelledby="tt-fix-stop">
      <h2 id="tt-fix-stop" className="flex items-center gap-2 font-semibold"><MapPinned className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> Fix a stop on the map</h2>
      {!fresh ? (
        <p className="mt-1 text-body-sm text-muted-foreground">Turn on location sharing and stop the bus where the stop really is.</p>
      ) : near ? (
        <>
          <p className="mt-1 text-body-sm text-muted-foreground">The bus is {Math.round(near.d)} m from <span className="font-semibold text-foreground">{near.stop.name}</span>.</p>
          <Button className="mt-3 w-full" size="lg" disabled={busy} onClick={() => run("move_stop", { stop_name: near.stop.name }, `${near.stop.name} now uses this location.`)}>
            <MapPinned className="h-5 w-5" aria-hidden="true" /> Use this location for {near.stop.name}
          </Button>
        </>
      ) : (
        <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n.length >= 2) run("add_stop", { name: n }, `${n} added to the route here.`); }}>
          <p className="text-body-sm text-muted-foreground">No stop within {EDIT_RADIUS_M} m{nearest ? ` (nearest: ${nearest.stop.name}, ${nearest.d >= 1000 ? `${(nearest.d / 1000).toFixed(1)} km` : `${Math.round(nearest.d)} m`})` : ""}. Add one where the bus is now:</p>
          <label htmlFor="tt-new-stop" className="sr-only">New stop name</label>
          <Input id="tt-new-stop" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Stop name, e.g. Morne Jaloux junction" className="h-12" />
          <Button type="submit" size="lg" className="w-full" disabled={busy || name.trim().length < 2}>
            <MapPinPlus className="h-5 w-5" aria-hidden="true" /> Add a new stop here
          </Button>
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={cn("mt-2 text-body-sm", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p>}
    </section>
  );
}

export default function DriverStops({ session, passengers, trips, invoke, refresh }) {
  const [tab, setTab] = useState("stops");
  const vehicle = session?.vehicle;
  const route = session?.route;
  const stops = useMemo(() => sortStops(route?.stops).filter((s) => s.lat != null && s.lng != null), [route]);
  const p = vehicle?.current_lat != null && stops.length > 1 ? routeProgress(stops, vehicle.current_lat, vehicle.current_lng) : null;
  const nextIndex = p ? p.nextIndex : null;
  const ahead = useMemo(() => (nextIndex == null ? [] : stops.slice(nextIndex)), [stops, nextIndex]);
  const etas = useStopEtas({ bus: vehicle, route, stops: ahead, record: null, enabled: !!vehicle?.tracking_active && ahead.length > 0 });

  // Each pickup listed at the stop nearest their pinned pickup point.
  const perStop = useMemo(() => {
    const out = {};
    (session?.staff || []).forEach((s) => {
      if (s.skip_pickup_today || s.home_lat == null || !stops.length) return;
      let best = null;
      stops.forEach((st) => { const d = haversineKm(s.home_lat, s.home_lng, st.lat, st.lng); if (!best || d < best.d) best = { d, name: st.name }; });
      if (best) (out[best.name] = out[best.name] || []).push(s.full_name || "Passenger");
    });
    return out;
  }, [session?.staff, stops]);
  const workplace = session?.workplace;

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

      {tab === "stops" && route && <StopEditor vehicle={vehicle} stops={stops} invoke={invoke} refresh={refresh} />}
      {tab === "stops" ? (
        stops.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">This bus has no stops yet. Ask dispatch to assign a route.</p>
        ) : (
          <div role="tabpanel"><ol className="m-0 list-none p-0">
            {stops.map((st, i) => {
              const passed = nextIndex != null && i < nextIndex;
              const isNext = i === nextIndex;
              const e = etas[st.name];
              const names = perStop[st.name] || [];
              const count = names.length;
              return (
                <li key={st.name} className={cn("grid min-h-[64px] grid-cols-[32px_minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-xl pr-2", isNext && "bg-card ring-1 ring-primary/50", passed && "text-muted-foreground")}>
                  <span className="relative h-full" aria-hidden="true">
                    {i > 0 && <span className={cn("absolute left-[14px] top-0 h-1/2 w-1", passed || isNext ? "bg-primary" : "bg-border")} />}
                    {i < stops.length - 1 && <span className={cn("absolute bottom-0 left-[14px] top-1/2 w-1", passed ? "bg-primary" : "bg-border")} />}
                    <span className={cn("absolute left-[7px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full border-[3px] bg-background", isNext ? "border-primary" : passed ? "border-primary bg-primary" : "border-muted-foreground/60")} />
                  </span>
                  <span className="min-w-0 py-2">
                    <span className="block truncate font-semibold">{st.name}</span>
                    <span className="block text-body-sm text-muted-foreground">{passed ? "Passed" : isNext ? "Next stop" : i === stops.length - 1 && !workplace ? "Last stop" : " "}</span>
                    {names.length > 0 && (
                      <span className="block text-body-sm text-foreground" aria-label={`Picking up ${names.join(", ")}`}>
                        {names.slice(0, 4).join(", ")}{names.length > 4 ? ` +${names.length - 4} more` : ""}
                      </span>
                    )}
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
            {workplace && (
              <li className="grid min-h-[64px] grid-cols-[32px_minmax(0,1fr)] items-center gap-x-3 rounded-xl pr-2">
                <span className="grid place-items-center" aria-hidden="true"><Building2 className="h-5 w-5 text-primary" /></span>
                <span className="min-w-0 py-2">
                  <span className="block truncate font-semibold">{workplace.name}</span>
                  <span className="block text-body-sm text-muted-foreground">Drop-off · everyone gets off here</span>
                </span>
              </li>
            )}
          </ol></div>
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
