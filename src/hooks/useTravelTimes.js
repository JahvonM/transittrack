import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { learnedEta, stopKey } from "@/lib/travelTimes";

// Learned stop-to-stop times for every route (RouteTravelTimes), loaded once
// and shared by every screen for 10 minutes — they only change overnight.
const TTL_MS = 10 * 60 * 1000;
let cache = null;
let loadedAt = 0;
let inflight = null;

function load() {
  if (cache && Date.now() - loadedAt < TTL_MS) return Promise.resolve(cache);
  if (!inflight) {
    inflight = base44.entities.RouteTravelTimes.list("-learned_at", 500)
      .then((rows) => {
        cache = Object.fromEntries((rows || []).map((r) => [r.route_id, r]));
        loadedAt = Date.now();
        return cache;
      })
      .catch(() => cache || {})
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export default function useTravelTimes() {
  const [byRoute, setByRoute] = useState(() => cache || {});
  useEffect(() => {
    let alive = true;
    load().then((c) => { if (alive) setByRoute(c); });
    return () => { alive = false; };
  }, []);
  return byRoute;
}

// ETA from real trips for `vehicle` reaching `stop` on `route`, or null when
// too little of the way has been learned yet (then screens fall back to a
// road estimate). { mins, isLearned: true, trips }
export function etaFromLearned(record, route, vehicle, stop, now = Date.now()) {
  if (!record || !route?.stops?.length || vehicle?.current_lat == null || !stop) return null;
  const stops = [...route.stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const key = stopKey(stop);
  const target = stops.findIndex((s) => stopKey(s) === key || (stop.name && s.name === stop.name));
  if (target < 0) return null;
  const r = learnedEta({ stats: record, stops, pos: { lat: vehicle.current_lat, lng: vehicle.current_lng }, target, now });
  if (!r || r.learnedShare < 0.5) return null;
  return { mins: r.seconds / 60, isLearned: true, trips: r.trips };
}
