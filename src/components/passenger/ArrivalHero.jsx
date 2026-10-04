import React, { Suspense, lazy } from "react";
import { ChevronDown, Clock, SatelliteDish, Sparkles, Route as RouteIcon, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAge } from "@/components/system/status";
import { arrivalClock, clock, lastSeen } from "./passengerState";

// The 3D model shares three.js with the live map, so it loads with it.
const BusModelView = lazy(() => import("@/components/map3d/BusModelView"));

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

// Where the minutes come from, as a small chip.
function SourceLine({ eta }) {
  if (!eta) return null;
  const Icon = eta.isLearned ? Sparkles : eta.isDriving ? RouteIcon : Ruler;
  const text = eta.isLearned ? "Learned ETA" : eta.isDriving ? "Road estimate" : "Rough estimate";
  const title = eta.isLearned
    ? `Based on ${eta.trips ? `${eta.trips} real trip${eta.trips === 1 ? "" : "s"}` : "real trips"} on this route`
    : eta.isDriving ? "Estimated by road from the bus's position" : "Estimated from straight-line distance";
  return (
    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-caption font-semibold text-muted-foreground" title={title}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {text}
      <span className="sr-only">: {title}</span>
    </p>
  );
}

const BIG = "font-display font-semibold tabular-nums leading-[0.8] tracking-[-0.03em] text-[clamp(5.5rem,26vw,7.5rem)]";
const WORD = "font-display font-semibold leading-none tracking-[-0.02em] text-[clamp(3rem,14vw,4.25rem)]";
// Longer word states stay on one line on a 360px phone.
const WORD_LONG = "font-display font-semibold leading-none tracking-[-0.02em] text-[clamp(2.25rem,10vw,3.25rem)]";

/**
 * The arrival area: the one thing a passenger opens the app for. Says only
 * what TransitTrack knows (minutes, word states, how fresh the position is)
 * and never shows schedule status like "on time" or "late".
 */
export default function ArrivalHero({ state, stop, eta, trip, now = Date.now(), onChangeStop, accent }) {
  const { kind, bus, fresh, mins } = state;
  const name = bus?.name || "Your bus";
  const roundMins = mins != null ? Math.max(1, Math.round(mins)) : null;

  let big = null;
  let sub = null;
  let note = null;
  switch (kind) {
    case "live":
      big = roundMins != null
        ? <><span className={BIG}>{roundMins}</span><span className="text-[2rem] font-medium text-muted-foreground">min</span></>
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
        ? <><span className={cn(BIG, "text-muted-foreground")}>{roundMins}</span><span className="text-[2rem] font-medium text-muted-foreground">min</span></>
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

  const showBus = bus && kind !== "no_eta";
  return (
    <section className="px-6 pb-6 pt-2 lg:px-0" aria-labelledby="tt-arrival-sub">
      <LiveLine state={state} fresh={fresh} />
      <p className="sr-only" aria-live="polite">{spoken}</p>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2" aria-hidden="true">{big}</div>
          <button
            type="button"
            onClick={onChangeStop}
            className="-ml-1 mt-3 flex min-h-[44px] max-w-full items-center gap-1 rounded-lg px-1 text-left text-title font-bold leading-tight"
            aria-label={`Your stop: ${stop.name}. Change stop`}
          >
            <span className="break-words">to {stop.name}</span>
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
        {showBus && (
          <div className="relative -mr-2 h-24 w-32 shrink-0 min-[400px]:h-28 min-[400px]:w-40 sm:h-32 sm:w-48" aria-hidden="true">
            <Suspense fallback={null}>
              <BusModelView className="h-full w-full" modelId={bus.model_3d || (bus.type === "taxi" ? "taxi" : "city_bus")} accent={accent} stale={kind === "signal_lost" || kind === "problem" || kind === "not_started"} label={bus.name} />
            </Suspense>
          </div>
        )}
      </div>
      <p id="tt-arrival-sub" className="mt-2 text-body font-semibold leading-snug">{sub}</p>
      {note}
      {trip && (
        <p className="mt-4 border-l-4 border-primary pl-3 text-body-sm">
          Your booked ride is on the way: {trip.vehicle_name || "your vehicle"} with {trip.driver_name || "your driver"}.
        </p>
      )}
    </section>
  );
}
