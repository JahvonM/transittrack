import { useEffect, useMemo, useRef, useState } from "react";
import { fetchDrivingRoute, haversineKm, etaMinutes } from "@/lib/geo";
import { etaFromLearned } from "@/hooks/useTravelTimes";

const REFETCH_M = 150; // ask for road times again once the bus has moved this far

/**
 * Arrival estimates for the stops ahead of a bus, using exactly the same
 * sources as the passenger's own ETA: learned travel times first, then the
 * road route (Mapbox Directions), then the straight-line estimate. Nothing
 * new is calculated; this only runs those per stop.
 *
 *   bus:    vehicle with current_lat/current_lng/speed
 *   route:  the bus's route (for learned times)
 *   stops:  [{ name, lat, lng }] still ahead, in order
 *   record: learned travel-time record for the route (useTravelTimes()[route.id])
 * -> { [stopName]: { mins, km, source: "learned"|"driving"|"straight" } }
 */
export default function useStopEtas({ bus, route, stops, record, enabled = true }) {
  const [driving, setDriving] = useState({});
  const lastFetch = useRef(null);
  const key = (stops || []).map((s) => s.name).join("|");

  // Road times, refreshed only when the bus has moved a fair way.
  useEffect(() => {
    if (!enabled || !bus || bus.current_lat == null || !stops?.length) return undefined;
    const here = { lat: bus.current_lat, lng: bus.current_lng };
    const prev = lastFetch.current;
    if (prev && prev.key === key && haversineKm(prev.lat, prev.lng, here.lat, here.lng) * 1000 < REFETCH_M) return undefined;
    lastFetch.current = { ...here, key };
    let cancelled = false;
    Promise.all(stops.map((s) => fetchDrivingRoute([here, { lat: s.lat, lng: s.lng }]).then((r) => [s.name, r]))).then((rows) => {
      if (cancelled) return;
      setDriving(Object.fromEntries(rows.filter(([, r]) => r).map(([name, r]) => [name, { mins: r.durationMin, km: r.distanceKm }])));
    });
    return () => { cancelled = true; };
  }, [enabled, bus?.current_lat, bus?.current_lng, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (!enabled || !bus || bus.current_lat == null) return {};
    const out = {};
    (stops || []).forEach((s) => {
      const learned = record ? etaFromLearned(record, route, bus, s) : null;
      const straightKm = haversineKm(bus.current_lat, bus.current_lng, s.lat, s.lng);
      const road = driving[s.name];
      if (learned) out[s.name] = { mins: learned.mins, km: road?.km ?? straightKm, source: "learned" };
      else if (road) out[s.name] = { mins: road.mins, km: road.km, source: "driving" };
      else out[s.name] = { mins: etaMinutes(straightKm, bus.speed || 25), km: straightKm, source: "straight" };
    });
    return out;
  }, [enabled, bus, route, stops, record, driving]);
}
