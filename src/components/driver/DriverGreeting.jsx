import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import React from "react";
import { Bus } from "lucide-react";
import LiveClock from "@/components/LiveClock";
import WeatherWidget from "@/components/WeatherWidget";
import BusArtwork from "@/components/BusArtwork";

const greetingWord = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

// The unlock screen's identity panel: which bus this tablet is, who's
// driving, and the time. Quiet on purpose; the PIN is the action.
// `compact` is for tablets where the panel shares the screen with the PIN pad.
export default function DriverGreeting({ driverName, subtitle, compact = false }) {
  const name = (driverName || "Driver").split("@")[0].split(" ")[0];
  const dateStr = new Date().toLocaleDateString([], { timeZone: TRANSIT_TIME_ZONE, weekday: "long", month: "long", day: "numeric" });
  const num = String(subtitle || "").match(/(\d+)\s*$/)?.[1];
  return (
    <section className={`flex flex-col ${compact ? "gap-3" : "gap-6"}`} aria-label="This tablet">
      {/* On a phone (under 600px wide) the bus tile and the clock row go, so
          the PIN pad or the bus list fits one screen; the bus is in the subtitle. */}
      <div className={`flex items-center justify-between gap-4 ${compact ? "[@media(max-width:599px)]:hidden" : ""}`}>
        <span className={`grid w-fit place-items-center bg-primary text-primary-foreground ${compact ? "h-14 min-w-[3.5rem] rounded-xl px-3" : "h-20 min-w-[5rem] rounded-2xl px-4"}`} aria-hidden="true">
          {num
            ? <span className={`font-display font-bold leading-none tabular-nums ${compact ? "text-[2rem]" : "text-[2.75rem]"}`}>{num}</span>
            : <Bus className={compact ? "h-7 w-7" : "h-9 w-9"} />}
        </span>
        {!compact && <BusArtwork width={168} className="-my-6 h-auto max-w-[45%]" />}
      </div>
      <div>
        <p className={`text-muted-foreground ${compact ? "text-body-sm" : "text-body"}`}>{dateStr}</p>
        <h1 className={`mt-1 font-bold ${compact ? "text-title" : "text-display"}`}>{greetingWord()}, {name}</h1>
        {subtitle && <p className={`mt-1 text-muted-foreground ${compact ? "text-body-sm" : "text-title-sm"}`}>{subtitle}</p>}
      </div>
      <div className={`flex flex-wrap items-center gap-3 ${compact ? "[@media(max-width:599px)]:hidden" : ""}`}>
        <LiveClock seconds={false} mono={false} className={`font-display font-semibold ${compact ? "text-title" : "text-headline"}`} />
        <WeatherWidget variant="chip" />
      </div>
    </section>
  );
}