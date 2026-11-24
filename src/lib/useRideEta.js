import { useEffect, useRef, useState } from "react";
import { fetchDrivingRoute } from "@/lib/geo";
import { ROAD_REFRESH_MS, etaText, roughMinutes } from "@/lib/rideEta";

// { to: "pickup" | "dropoff", minutes } while there's a live position and a
// next stop, otherwise null.
export function useRideEta(view, { fetchRoute = fetchDrivingRoute, now = () => Date.now() } = {}) {
  const at = view?.location, target = view?.eta;
  const key = target ? `${target.to}:${target.lat},${target.lng}` : "";
  const [road, setRoad] = useState(null); // { key, minutes, asked }
  const asking = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!key || !at || asking.current) return;
    if (road?.key === key && now() - road.asked < ROAD_REFRESH_MS) return;
    asking.current = true;
    const asked = now();
    Promise.resolve(fetchRoute([{ lat: at.lat, lng: at.lng }, { lat: target.lat, lng: target.lng }]))
      .catch(() => null)
      .then((r) => { if (mounted.current) setRoad({ key, minutes: Number.isFinite(r?.durationMin) ? r.durationMin : null, asked }); })
      .finally(() => { asking.current = false; });
    // Asked again as the ride moves, once the minute is up.
  }, [key, at?.lat, at?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!key || !at) return null;
  const minutes = road?.key === key && road.minutes != null ? road.minutes : roughMinutes(at, target);
  return etaText(minutes) ? { to: target.to, minutes } : null;
}
