import React from "react";
import { Clock, SatelliteDish, Sparkles, Route as RouteIcon, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAge } from "@/components/system/status";
import { arrivalClock, clock, lastSeen } from "./passengerState";

function LiveLine({ state, fresh }) {
  if (state.kind === "signal_lost") {
    return (
      <p className="flex items-center gap-2.5 text-body-sm text-muted-foreground">
        <SatelliteDish className="h-4 w-4 text-offline" aria-hidden="true" />
        Signal lost {formatAge(fresh?.ageMs)}
      </p>
    );
  }
  if (state.kind === "not_started") {
    return <p className="flex items-center gap-2.5 text-body-sm text-muted-foreground"><span className="h-2 w-2 rounded-full bg-muted-foreground" aria-hidden="true" />Not started yet</p>;
  }
  if (state.kind === "problem") {
    return <p className="flex items-center gap-2.5 text-body-sm text-danger"><span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" />Out of service</p>;
  }
  if (state.kind === "no_eta") return null;
  if (fresh?.state === "stale") {
    return (
      <p className="flex items-center gap-2.5 text-body-sm text-warning">
        <Clock className="h-4 w-4" aria-hidden="true" />
        Updated {formatAge(fresh.ageMs)}, location may be a little behind
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2.5 text-body-sm text-muted-foreground">
      <span className="tt-live-pulse h-2 w-2 rounded-full bg-primary text-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.16)]" aria-hidden="true" />
      Live{fresh?.ageMs != null ? `, updated ${formatAge(fresh.ageMs)}` : ""}
    </p>
  );
}

function SourceLine({ eta }) {
  if (!eta) return null;
  const Icon = eta.isLearned ? Sparkles : eta.isDriving ? RouteIcon : Ruler;
  const text = eta.isLearned
    ? `Based on ${eta.trips ? `${eta.trips} real trip${eta.trips === 1 ? "" : "s"}` : "real trips"} on this route`
    : eta.isDriving ? "Estimated by road from the bus's position" : "Rough estimate from distance";
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-body-sm text-muted-foreground">
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {text}
    </p>
  );
}

const BIG = "font-display font-semibold tabular-nums leading-[0.8] tracking-[-0.03em] text-[clamp(6.5rem,32vw,9.5rem)] lg:text-[9.5rem]";
const WORD = "font-display font-semibold leading-none tracking-[-0.02em] text-[clamp(3.5rem,17vw,5rem)]";
// Longer word states stay on one line on a 360px phone.
const WORD_LONG = "font-display font-semibold leading-none tracking-[-0.02em] text-[clamp(2.5rem,12vw,3.75rem)]";

/**
 * The arrival area: the one thing a passenger opens the app for. Says only
 * what TransitTrack knows (minutes, word states, how fresh the position is)
 * and never shows schedule status like "on time" or "late".
 */
export default function ArrivalHero({ state, stop, eta, trip, now = Date.now() }) {
  const { kind, bus, fresh, mins } = state;
  const name = bus?.name || "Your bus";
  const roundMins = mins != null ? Math.max(1, Math.round(mins)) : null;

  let big = null;
  let sub = null;
  let note = null;
  switch (kind) {
    case "live":
      big = roundMins != null
        ? <><span className={BIG}>{roundMins}</span><span className="text-[2.25rem] font-medium text-muted-foreground">min</span></>
        : <span className={WORD}>On its way</span>;
      sub = roundMins != null ? `${name} reaches ${stop.name} around ${arrivalClock(mins, now)}` : `${name} is on its way to ${stop.name}`;
      note = <SourceLine eta={eta} />;
      break;
    case "arriving":
      big = <span className={cn(WORD, "text-primary")}>Arriving</span>;
      sub = `${name} is about a minute from ${stop.name}. Head to the stop now.`;
      note = <SourceLine eta={eta} />;
      break;
    case "signal_lost":
      big = roundMins != null
        ? <><span className={cn(BIG, "text-muted-foreground")}>{roundMins}</span><span className="text-[2.25rem] font-medium text-muted-foreground">min</span></>
        : <span className={cn(WORD, "text-muted-foreground")}>No signal</span>;
      sub = bus?.last_location_update ? `Last estimate, from ${clock(bus.last_location_update)}` : "Last estimate";
      note = <p className="mt-1.5 text-body-sm text-muted-foreground">{name} hasn't sent its location since then. The time above may be out of date.</p>;
      break;
    case "not_started":
      big = <span className={WORD}>Not started</span>;
      sub = `${name} hasn't started its trip`;
      note = (
        <p className="mt-1.5 text-body-sm text-muted-foreground">
          {bus?.last_location_update ? `Last seen at ${lastSeen(bus.last_location_update, now)}. ` : ""}
          The arrival time appears as soon as the bus starts moving.
        </p>
      );
      break;
    case "problem":
      big = <span className={cn(WORD_LONG, "text-muted-foreground")}>No arrival time</span>;
      sub = `${name} has been taken out of service`;
      note = <p className="mt-1.5 text-body-sm text-muted-foreground">Times come back when the bus is on the road again.</p>;
      break;
    default:
      big = <span className={WORD}>No bus yet</span>;
      sub = `No bus serving ${stop.name} is on the road right now`;
      note = <p className="mt-1.5 text-body-sm text-muted-foreground">The arrival time shows here as soon as one starts its trip.</p>;
  }

  const spoken =
    kind === "live" && roundMins != null ? `${name} arrives at ${stop.name} in about ${roundMins} minutes`
      : kind === "arriving" ? `${name} is arriving at ${stop.name}`
        : sub;

  return (
    <section className="px-6 pb-8 pt-4 lg:px-0" aria-labelledby="tt-arrival-sub">
      <LiveLine state={state} fresh={fresh} />
      <p className="sr-only" aria-live="polite">{spoken}</p>
      <div className="mt-6 flex items-baseline gap-2.5" aria-hidden="true">{big}</div>
      <p id="tt-arrival-sub" className="mt-6 text-title-sm font-semibold leading-snug">{sub}</p>
      {note}
      {trip && (
        <p className="mt-4 border-l-4 border-primary pl-3 text-body-sm">
          Your booked ride is on the way: {trip.vehicle_name || "your vehicle"} with {trip.driver_name || "your driver"}.
        </p>
      )}
    </section>
  );
}
