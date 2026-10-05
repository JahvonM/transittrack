import React from "react";
import { ChevronDown, Clock, SatelliteDish, Sparkles, Route as RouteIcon, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAge } from "@/components/system/status";
import BusArtwork from "@/components/BusArtwork";
import { arrivalClock, clock, lastSeen } from "./passengerState";

function LiveLine({ state, fresh }) {
  if (state.kind === "signal_lost") {
    return (
      <p className="flex items-center gap-2.5 text-body-sm text-muted-foreground">
        <SatelliteDish className="h-4 w-4 text-offline" aria-hidden="true" />
        <span><span className="font-semibold text-foreground">Signal lost</span>, last update {formatAge(fresh?.ageMs)}</span>
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
        <span><span className="font-semibold">Location delayed</span>, updated {formatAge(fresh.ageMs)}</span>
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

// The live signal beside the minutes, as transit apps show it.
function LiveArcs({ tone }) {
  return (
    <svg viewBox="0 0 14 14" className={cn("h-3.5 w-3.5", tone === "live" ? "tt-live-pulse text-primary" : "text-warning")} aria-hidden="true">
      <path d="M2 12a10 10 0 0 1 10-10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M2 12a5 5 0 0 1 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Stops between the bus and yours: the bus, up to four stops, then your stop.
function StopsTrack({ stopsAway }) {
  const between = Math.min(stopsAway, 4);
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex items-center" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-primary" />
        {Array.from({ length: between }, (_, i) => (
          <React.Fragment key={i}>
            <span className="h-0.5 w-3 bg-border" />
            <span className="h-2 w-2 rounded-full border-2 border-muted-foreground/60" />
          </React.Fragment>
        ))}
        <span className="h-0.5 w-3 bg-border" />
        <span className="h-3 w-3 rounded-full border-[3px] border-foreground" />
      </span>
      <span className="text-body-sm font-semibold">
        {stopsAway === 0 ? "Your stop is next" : `${stopsAway} stop${stopsAway === 1 ? "" : "s"} away`}
      </span>
    </div>
  );
}

const MINS = "font-display text-[3.25rem] font-semibold tabular-nums leading-[0.85] tracking-[-0.03em]";
const WORD = "font-display text-title font-semibold leading-tight";

/**
 * The arrival card: the one thing a passenger opens the app for. Says only
 * what TransitTrack knows (minutes, word states, how fresh the position is)
 * and never shows schedule status like "on time" or "late".
 */
export default function ArrivalHero({ state, stop, eta, trip, now = Date.now(), onChangeStop, routeName = "", stopsAway = null }) {
  const { kind, bus, fresh, mins } = state;
  const name = bus?.name || "Your bus";
  const roundMins = mins != null ? Math.max(1, Math.round(mins)) : null;
  const stale = fresh?.state === "stale";

  let answer;
  let detail = "";
  switch (kind) {
    case "live":
      answer = roundMins != null
        ? <span className="flex items-start gap-1"><span className={MINS}>{roundMins}</span><LiveArcs tone={stale ? "stale" : "live"} /></span>
        : <span className={WORD}>On its way</span>;
      detail = roundMins != null ? `min · ${arrivalClock(mins, now)}` : "";
      break;
    case "arriving":
      answer = <span className={cn(WORD, "text-primary")}>Arriving</span>;
      detail = "Head to the stop";
      break;
    case "signal_lost":
      answer = roundMins != null
        ? <span className={cn(MINS, "text-muted-foreground")}>{roundMins}</span>
        : <span className={cn(WORD, "text-muted-foreground")}>No time</span>;
      detail = bus?.last_location_update ? `Last estimate ${clock(bus.last_location_update)}` : "Last estimate";
      break;
    case "not_started":
      answer = <span className={cn(WORD, "text-muted-foreground")}>Not started</span>;
      detail = bus?.last_location_update ? `Last seen ${lastSeen(bus.last_location_update, now)}` : "";
      break;
    case "problem":
      answer = <span className={cn(WORD, "text-danger")}>Out of service</span>;
      break;
    default:
      answer = <span className={cn(WORD, "text-muted-foreground")}>No bus yet</span>;
      detail = "Shows when a bus starts its trip";
  }

  const spoken =
    kind === "live" && roundMins != null ? `${name} arrives at ${stop.name} in about ${roundMins} minutes, around ${arrivalClock(mins, now)}`
      : kind === "arriving" ? `${name} is arriving at ${stop.name}. Head to the stop.`
        : kind === "signal_lost" ? `${name} has lost its signal. ${detail}.`
          : kind === "not_started" ? `${name} hasn't started its trip`
            : kind === "problem" ? `${name} has been taken out of service`
              : `No bus serving ${stop.name} is on the road right now`;

  const onTrip = kind === "live" || kind === "arriving" || kind === "signal_lost";
  const dim = kind === "signal_lost" || kind === "problem" || kind === "not_started";
  const Source = eta?.mins != null ? (eta.isLearned ? Sparkles : eta.isDriving ? RouteIcon : Ruler) : null;
  const sourceText = eta?.isLearned ? "Learned from real trips on this route" : eta?.isDriving ? "Estimated by road from the bus's position" : "Rough estimate from straight-line distance";

  return (
    <section className="px-6 pb-6 pt-2 lg:px-0" aria-label="Your bus" aria-describedby="tt-arrival-sub">
      <p className="sr-only" aria-live="polite" id="tt-arrival-sub">{spoken}</p>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        {(onTrip || Source) && (
          <div className="mb-3 flex items-center justify-between gap-3">
            {onTrip ? <LiveLine state={state} fresh={fresh} /> : <span />}
            {Source && onTrip && (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground" title={sourceText}>
                <Source className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{sourceText}</span>
              </span>
            )}
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              {bus && kind !== "no_eta" && (
                <BusArtwork width={56} className={cn("-my-2 -ml-1 h-11 w-14 shrink-0", dim && "opacity-60 grayscale")} />
              )}
              <span className={cn(
                "inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-body-sm font-bold",
                onTrip && !dim ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
              )}>
                {bus ? name : "No bus"}
              </span>
              {routeName && <span className="truncate text-body-sm text-muted-foreground">{routeName}</span>}
            </div>
            <button
              type="button"
              onClick={onChangeStop}
              className="-ml-1 mt-2 flex min-h-[44px] max-w-full items-center gap-1 rounded-lg px-1 text-left text-title-sm font-bold leading-tight"
              aria-label={`Your stop: ${stop.name}. Change stop`}
            >
              <span className="break-words">to {stop.name}</span>
              <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
          <div className="shrink-0 text-right" aria-hidden="true">
            <div className="flex justify-end">{answer}</div>
            {detail && <p className="mt-1 text-caption font-semibold text-muted-foreground">{detail}</p>}
          </div>
        </div>
        {onTrip && stopsAway != null && (
          <div className="mt-3 border-t border-border pt-3"><StopsTrack stopsAway={stopsAway} /></div>
        )}
        {trip && (
          <p className="mt-3 border-t border-border pt-3 text-body-sm">
            <span className="font-semibold">Booked ride:</span> {[trip.vehicle_name || "your vehicle", trip.driver_name].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </section>
  );
}
