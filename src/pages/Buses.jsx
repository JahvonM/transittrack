import BusArtwork from "@/components/BusArtwork";
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import BusLoader from "@/components/BusLoader";
import PullToRefresh from "@/components/PullToRefresh";
import useDrivingEta from "@/hooks/useDrivingEta";
import { haversineKm } from "@/lib/geo";
import { loadFailed } from "@/lib/loadFailed";
import { cn } from "@/lib/utils";
import { freshnessOf } from "@/components/system/status";
import { busStatusLine } from "@/components/passenger/passengerState";
import { MapClosed, MapToggle, PassengerChatBubble, SectionHead } from "@/components/passenger/PassengerSections";

const LiveTransitMap = lazy(() => import("@/components/map3d/LiveTransitMap"));

const STAFF_ROLES = new Set(["admin", "company"]);

function BusRow({ v, route, stop, now }) {
  const fresh = freshnessOf(v.last_location_update, { now });
  const live = v.tracking_active && v.current_lat != null && fresh.state !== "lost" && v.in_service !== false;
  // Minutes to your stop, the same road estimate the home screen uses.
  const { mins } = useDrivingEta(live && stop ? { lat: v.current_lat, lng: v.current_lng } : null, stop ? { lat: stop.lat, lng: stop.lng } : null, v.speed || 25);
  return (
    <li className="tt-bus-card">
      <Link to={`/route-explorer?bus=${encodeURIComponent(v.id)}`} className="flex min-h-[72px] items-center gap-4 px-6 py-2 hover:bg-accent/50 md:px-3">
        <BusArtwork vehicle={v} width={120} className="h-24 w-24 sm:w-32 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{v.name}{v.plate_number ? <span className="font-normal text-muted-foreground"> · {v.plate_number}</span> : null}</span>
          <span className="block truncate text-body-sm text-muted-foreground">{route?.name ? `${route.name} · ` : ""}{busStatusLine(v, route, now)}</span>
        </span>
        {live && stop && mins != null ? (
          <span className="shrink-0 text-right">
            <span className="block font-display text-title font-semibold tabular-nums">{Math.max(1, Math.round(mins))} min</span>
            <span className="block text-caption text-muted-foreground">to {stop.name}</span>
          </span>
        ) : (
          <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-body-sm", live ? "text-foreground" : "text-muted-foreground")}>
            <span className={cn("h-2 w-2 rounded-full", live ? "bg-success" : "bg-offline")} aria-hidden="true" />
            {live ? "On route" : "Not tracking"}
          </span>
        )}
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

function Group({ id, title, buses, routes, stop, now }) {
  if (!buses.length) return null;
  return (
    <section className="pb-6" aria-labelledby={id}>
      <h2 id={id} className="px-6 pb-1 text-body-sm font-semibold text-muted-foreground md:px-0">{title}</h2>
      <ul className="divide-y divide-border border-y border-border md:rounded-xl md:border md:bg-card">
        {buses.map((v) => <BusRow key={v.id} v={v} route={routes.find((r) => r.id === v.route_id)} stop={stop} now={now} />)}
      </ul>
    </section>
  );
}

// Every bus you can see: coming to your stop first, then the rest on the
// road, then those parked. Tap one to follow it on the map.
export default function Buses() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [workplace, setWorkplace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [mapOpen, setMapOpen] = useState(false);

  const load = () => Promise.all([base44.entities.Route.list(), base44.entities.Vehicle.list(), base44.entities.Workplace.list()])
    .then(([r, v, w]) => {
      setRoutes(r.filter((x) => x.active));
      setVehicles(v);
      // The company's workplace: the drop-off pin on the map.
      const placed = w.filter((x) => x.lat != null && x.lng != null);
      setWorkplace(placed.find((x) => v.some((veh) => veh.company_id === x.company_id)) || placed[0] || null);
    })
    .catch(() => loadFailed());

  useEffect(() => {
    load().finally(() => setLoading(false));
    const unsub = base44.entities.Vehicle.subscribe((event) => {
      setVehicles((prev) => {
        if (event.type === "delete") return prev.filter((x) => x.id !== event.id);
        const rec = event.data;
        if (!rec) return prev;
        return prev.some((x) => x.id === event.id) ? prev.map((x) => (x.id === event.id ? rec : x)) : prev;
      });
    });
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => { unsub?.(); clearInterval(t); };
  }, []);

  // SOS is admin/management-only: passengers never see "emergency".
  const visible = useMemo(
    () => (STAFF_ROLES.has(user?.role) ? vehicles : vehicles.map((v) => (v.status === "emergency" ? { ...v, status: "on_trip" } : v))),
    [vehicles, user?.role],
  );
  const pickup = typeof window !== "undefined" ? localStorage.getItem("tt_staff_pickup") : null;
  const stop = useMemo(() => routes.flatMap((r) => r.stops || []).find((s) => s.name === pickup && s.lat != null) || null, [routes, pickup]);
  const serving = useMemo(() => new Set(routes.filter((r) => (r.stops || []).some((s) => s.name === pickup)).map((r) => r.id)), [routes, pickup]);

  const isLive = (v) => v.tracking_active && v.current_lat != null && v.in_service !== false && freshnessOf(v.last_location_update, { now }).state !== "lost";
  const dist = (v) => (stop && v.current_lat != null ? haversineKm(v.current_lat, v.current_lng, stop.lat, stop.lng) : Infinity);
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
  const coming = visible.filter((v) => isLive(v) && serving.has(v.route_id)).sort((a, b) => dist(a) - dist(b));
  const onRoad = visible.filter((v) => isLive(v) && !serving.has(v.route_id)).sort(byName);
  const parked = visible.filter((v) => !isLive(v)).sort(byName);

  return (
    <AppLayout variant="passenger" title="Company buses">
      <PullToRefresh onRefresh={load} className="max-w-3xl">
        {loading ? <BusLoader className="py-10" /> : (
          <>
            <p className="px-6 pb-4 text-body text-muted-foreground md:px-0">
              <span className="font-semibold text-foreground">All company buses</span>
              <span className="block">{coming.length + onRoad.length} of {visible.length} on the road now.</span>
            </p>
            <section className="px-6 pb-6 md:px-0" aria-labelledby="tt-buses-map">
              <SectionHead id="tt-buses-map" title="Map" aside={mapOpen ? <MapToggle open onToggle={() => setMapOpen(false)} /> : null} />
              {mapOpen ? (
                <div id="passenger-live-map">
                  <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-muted" />}>
                    <LiveTransitMap className="h-72 rounded-2xl border border-border sm:h-96" vehicles={visible.filter((v) => v.current_lat != null)} routes={routes} dropoff={workplace} label="Map of the company's buses" />
                  </Suspense>
                </div>
              ) : (
                <MapClosed onOpen={() => setMapOpen(true)}>See every bus on a 3D map. The map uses more data and battery.</MapClosed>
              )}
            </section>
            <section aria-label="Company bus directory">
            <Group id="tt-buses-coming" title={stop ? `Coming to ${stop.name}` : "Serving your stop"} buses={coming} routes={routes} stop={stop} now={now} />
            <Group id="tt-buses-road" title={coming.length ? "Other buses on the road" : "On the road"} buses={onRoad} routes={routes} stop={null} now={now} />
            <Group id="tt-buses-parked" title="Not on the road" buses={parked} routes={routes} stop={null} now={now} />
            {!visible.length && <p className="px-6 py-10 text-center text-muted-foreground">No buses to show yet.</p>}
            </section>
          </>
        )}
      </PullToRefresh>
      <PassengerChatBubble />
    </AppLayout>
  );
}