import React from "react";
import { Bus } from "lucide-react";
import { routeProgress } from "@/components/TripProgress";

export default function PassengerTimeline({ route, bus, stop, eta }) {
  const stops = [...(route?.stops || [])].sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  if (stops.length < 2) return null;
  const progress = routeProgress(stops, bus?.current_lat, bus?.current_lng);
  return <div className="space-y-2" aria-label="Route stops">
    <p className="text-xs text-muted-foreground mb-3">{route.name}</p>
    <ol>{stops.map((s,i) => {
      const selected = s.name === stop?.name;
      const passed = progress && i < progress.nextIndex;
      const next = progress && i === progress.nextIndex;
      return <li key={s.id || `${s.name}-${i}`} className={`relative flex items-center gap-4 min-h-[58px] px-3 rounded-xl ${selected ? "bg-primary/10" : ""}`}>
        {i < stops.length - 1 && <span aria-hidden="true" className={`absolute left-[23px] top-8 bottom-[-24px] w-0.5 ${passed ? "bg-primary" : "bg-muted-foreground/30"}`} />}
        <span className={`relative z-10 grid place-items-center shrink-0 w-6 h-6 rounded-full border-2 ${selected ? "border-primary bg-background text-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.1)]" : passed || next ? "border-primary bg-background" : "border-muted-foreground/60 bg-background"}`}>
          {selected ? <Bus className="w-3.5 h-3.5" /> : <span className={`w-2 h-2 rounded-full ${passed ? "bg-primary" : ""}`} />}
        </span>
        <div className="flex-1 min-w-0 py-2"><p className={`text-sm ${selected ? "font-bold" : "font-medium"}`}>{s.name}</p>
          <p className="text-xs text-muted-foreground">{selected ? "Your pickup" : next ? "Next stop" : passed ? "Behind the bus" : "Upcoming stop"}</p>
        </div>
        {selected && eta?.mins != null && !eta.stale && <span className="text-sm font-bold tabular-nums">{Math.round(eta.mins)} min</span>}
      </li>;
    })}</ol>
  </div>;
}
