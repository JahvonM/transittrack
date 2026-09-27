import React, { useMemo } from "react";
import AnimatedBus from "@/components/AnimatedBus";
import { haversineKm } from "@/lib/geo";

// Where along an ordered list of stops a vehicle currently is, as a 0..1
// fraction of the whole route plus the index of the next stop ahead.
export function routeProgress(stops, lat, lng) {
  const pts = (stops || []).filter((s) => s.lat != null && s.lng != null);
  if (pts.length < 2 || lat == null || lng == null) return null;
  const d = pts.map((s) => haversineKm(lat, lng, s.lat, s.lng));
  let nearest = 0;
  d.forEach((v, i) => { if (v < d[nearest]) nearest = i; });

  // Decide whether we're just before or just after the nearest stop by
  // comparing distances to its neighbours.
  let from = nearest;
  if (nearest === pts.length - 1) from = nearest - 1;
  else if (nearest > 0 && d[nearest - 1] < d[nearest + 1]) from = nearest - 1;
  const to = from + 1;
  const seg = d[from] + d[to];
  const t = seg > 0 ? Math.min(1, Math.max(0, d[from] / seg)) : 0;
  return { fraction: (from + t) / (pts.length - 1), nextIndex: t > 0.95 ? Math.min(to + 1, pts.length - 1) : to, stops: pts };
}

// Horizontal strip with the route's stops as dots and a little bus driving
// along it to its live position. Passed stops light up.
export default function TripProgress({ stops, lat, lng, label, className = "" }) {
  const p = useMemo(() => routeProgress(stops, lat, lng), [stops, lat, lng]);
  if (!p) return null;
  const n = p.stops.length;
  const pct = p.fraction * 100;
  const next = p.stops[p.nextIndex];

  return (
    <div className={`rounded-2xl border border-border bg-card px-4 pt-3 pb-3 ${className}`}>
      <div className="flex items-center justify-between gap-2 text-xs mb-1">
        <span className="text-muted-foreground truncate">{label || "Trip progress"}</span>
        {next && <span className="font-semibold text-primary truncate">Next: {next.name || `Stop ${p.nextIndex + 1}`}</span>}
      </div>
      <div className="relative h-12 mx-3">
        <div className="absolute left-0 right-0 bottom-2.5 h-1 rounded-full bg-muted" />
        <div className="absolute left-0 bottom-2.5 h-1 rounded-full bg-primary transition-[width] duration-1000 ease-out" style={{ width: `${pct}%` }} />
        {p.stops.map((s, i) => {
          const passed = i / (n - 1) <= p.fraction + 0.001;
          return (
            <span
              key={i}
              title={s.name}
              className={`absolute bottom-1.5 w-3 h-3 -ml-1.5 rounded-full border-2 transition-colors duration-500 ${passed ? "bg-primary border-primary" : "bg-card border-muted-foreground/40"}`}
              style={{ left: `${(i / (n - 1)) * 100}%` }}
            />
          );
        })}
        <div className="absolute bottom-4 -ml-6 transition-[left] duration-1000 ease-out" style={{ left: `${pct}%` }}>
          <div style={{ transform: "scaleX(-1)" }}>
            <AnimatedBus mode="drive" width={48} />
          </div>
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
        <span className="truncate max-w-[45%]">{p.stops[0].name || "Start"}</span>
        <span className="truncate max-w-[45%] text-right">{p.stops[n - 1].name || "End"}</span>
      </div>
    </div>
  );
}
