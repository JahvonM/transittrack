import { useEffect, useMemo, useState } from "react";
import { fetchDrivingRoute } from "@/lib/geo";
import { locationIsStale, remainingBusPoints } from "@/lib/busEta";

export default function useBusEta(route, vehicle, stop) {
  const [now, setNow] = useState(Date.now);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const stale = locationIsStale(vehicle, now);
  const points = useMemo(() => remainingBusPoints(route, vehicle, stop), [route, vehicle, stop]);
  const key = points ? JSON.stringify(points.map((p) => [p.lat, p.lng])) : "";
  useEffect(() => {
    let alive = true;
    setResult(null);
    if (stale || !key) { setLoading(false); return undefined; }
    setLoading(true);
    const waypoints = JSON.parse(key).map(([lat, lng]) => ({ lat, lng }));
    fetchDrivingRoute(waypoints).then((r) => {
      if (alive) { setResult(r ? { mins: r.durationMin, km: r.distanceKm, isDriving: true } : null); setLoading(false); }
    });
    return () => { alive = false; };
  }, [key, stale]);
  return stale ? { mins: null, stale: true } : result || { mins: null, loading, unavailable: !loading };
}
