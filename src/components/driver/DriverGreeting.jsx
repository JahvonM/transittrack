import React from "react";
import { Bus, Hand } from "lucide-react";
import LiveClock from "@/components/LiveClock";
import WeatherWidget from "@/components/WeatherWidget";
import BusArtwork from "@/components/BusArtwork";

const greetingWord = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

// One-line header for the main driving screen: greeting, bus, weather, time.
// Keeps the map and controls on one screen instead of a tall banner.
export function DriverTopBar({ driverName, busName, left, right }) {
  const name = (driverName || "Driver").split("@")[0].split(" ")[0];
  return (
    <header className="flex items-center gap-3 px-3 sm:px-4 h-14 shrink-0 border-b border-border bg-card/80 backdrop-blur">
      {left}
      <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
        <Bus className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight truncate">{greetingWord()}, {name}</p>
        {busName && <p className="text-xs text-muted-foreground truncate">{busName}</p>}
      </div>
      {right}
      <div className="hidden sm:block"><WeatherWidget variant="chip" /></div>
      <LiveClock className="text-base font-mono tabular-nums" />
    </header>
  );
}

export default function DriverGreeting({ driverName, subtitle }) {
  const name = (driverName || "Driver").split("@")[0].split(" ")[0];
  const dateStr = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="p-5 pb-0 rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-primary mb-1">{dateStr}</p>
          <h2 className="text-2xl font-heading font-semibold">{greetingWord()}, {name} <Hand className="inline-block w-6 h-6 ml-1 -mt-1 text-primary tt-wave" aria-hidden="true" /></h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <WeatherWidget variant="chip" />
          <LiveClock className="text-lg font-mono" />
        </div>
      </div>
      <div
        className="-mx-5 mt-2"
        style={{ background: "radial-gradient(80% 100% at 50% 100%, hsl(var(--primary) / 0.18), transparent 70%)" }}
      >
        <div className="flex justify-center py-2"><BusArtwork width={220} /></div>
      </div>
    </div>
  );
}