import React from "react";
import { Bus } from "lucide-react";
import LiveClock from "@/components/LiveClock";
import WeatherWidget from "@/components/WeatherWidget";

const greetingWord = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

// One-line header for the driving screens: the bus number large (it's what
// the driver and dispatch call the bus by), the driver, and the time.
export function DriverTopBar({ driverName, busName, left, right }) {
  const name = (driverName || "Driver").split("@")[0].split(" ")[0];
  const num = String(busName || "").match(/(\d+)\s*$/)?.[1];
  return (
    <header className="flex items-center gap-3 px-3 sm:px-4 h-14 shrink-0 border-b border-border bg-background">
      {left}
      <div className="min-w-[2.75rem] h-10 px-2 rounded-lg bg-primary text-primary-foreground grid place-items-center shrink-0" aria-hidden="true">
        {num ? <span className="font-display text-title font-bold tabular-nums leading-none">{num}</span> : <Bus className="w-5 h-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight truncate">{busName || "Your bus"}</p>
        <p className="text-body-sm text-muted-foreground truncate">{name}</p>
      </div>
      {right}
      <LiveClock seconds={false} mono={false} className="font-display text-title font-semibold" />
    </header>
  );
}

// The unlock screen's identity panel: which bus this tablet is, who's
// driving, and the time. Quiet on purpose; the PIN is the action.
export default function DriverGreeting({ driverName, subtitle }) {
  const name = (driverName || "Driver").split("@")[0].split(" ")[0];
  const dateStr = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const num = String(subtitle || "").match(/(\d+)\s*$/)?.[1];
  return (
    <section className="flex flex-col gap-6" aria-label="This tablet">
      <span className="grid h-20 min-w-[5rem] w-fit place-items-center rounded-2xl bg-primary px-4 text-primary-foreground" aria-hidden="true">
        {num ? <span className="font-display text-[2.75rem] font-bold leading-none tabular-nums">{num}</span> : <Bus className="h-9 w-9" />}
      </span>
      <div>
        <p className="text-body text-muted-foreground">{dateStr}</p>
        <h1 className="mt-1 text-display font-bold">{greetingWord()}, {name}</h1>
        {subtitle && <p className="mt-1 text-title-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <LiveClock seconds={false} mono={false} className="font-display text-headline font-semibold" />
        <WeatherWidget variant="chip" />
      </div>
    </section>
  );
}
