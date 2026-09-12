import { useEffect, useRef, useState } from "react";
import { fetchDrivingRoute, haversineKm, etaMinutes } from "@/lib/geo";

/**
 * Distance/ETA between two points, preferring the actual driving distance
 * (following roads, via Mapbox Directions) over a straight line.
 *
 * While the request is in flight — or if it fails (offline, rate-limited,
 * no token) — this falls back to the straight-line haversine estimate so
 * something reasonable always shows.
 *
 * @param {{lat:number,lng:number}|null} origin
 * @param {{lat:number,lng:number}|null} destination
 * @param {number} speedKmh - used only for the straight-line fallback ETA
 */
export default function useDrivingEta(origin, destination, speedKmh = 25) {
  const [driving, setDriving] = useState(null);
  const requestId = useRef(0);

  const hasPoints = origin?.lat != null && origin?.lng != null && destination?.lat != null && destination?.lng != null;
  const straightKm = hasPoints ? haversineKm(origin.lat, origin.lng, destination.lat, destination.lng) : null;
  const straightMins = etaMinutes(straightKm, speedKmh);

  useEffect(() => {
    if (!hasPoints) {
      setDriving(null);
      return;
    }
    const id = ++requestId.current;
    setDriving(null); // clear stale route while the new one loads, straight-line fallback covers the gap
    fetchDrivingRoute([origin, destination]).then((res) => {
      if (requestId.current === id) setDriving(res);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPoints, origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  if (!hasPoints) return { km: null, mins: null, isDriving: false, loading: false };
  if (driving) return { km: driving.distanceKm, mins: driving.durationMin, isDriving: true, loading: false };
  return { km: straightKm, mins: straightMins, isDriving: false, loading: true };
}
