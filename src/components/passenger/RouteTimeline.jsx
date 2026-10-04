import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { arrivalClock, timelineRows } from "./passengerState";

const fmtKm = (km) => (km == null ? null : km < 1 ? `${Math.round((km * 1000) / 50) * 50 || 50} m` : `${km.toFixed(1)} km`);

/**
 * The trip as a vertical line of the stops ahead: next stop, your stop
 * (highlighted, with its arrival clock time), then the rest. Each stop's
 * minutes come from the same ETA sources as the arrival time (see
 * useStopEtas); stops already passed fold away.
 */
export default function RouteTimeline({ route, bus, kind, stopName, mins, stopEtas = {}, now = Date.now() }) {
  const [showPassed, setShowPassed] = useState(false);
  const onTrip = kind === "live" || kind === "arriving" || kind === "signal_lost" || kind === "problem";
  const t = useMemo(
    () => timelineRows({ route, bus, stopName, placeBus: onTrip, showAllPassed: true }),
    [route, bus, stopName, onTrip],
  );
  if (!t) return null;

  const stopsOnly = t.rows.filter((r) => r.type === "stop");
  const passed = stopsOnly.filter((r) => r.status === "passed");
  const mineIndex = stopsOnly.find((r) => r.mine)?.index ?? -1;
  const ahead = stopsOnly.filter((r) => r.status !== "passed");
  // After your stop only the last one stays.
  const shownAhead = ahead.filter((r) => mineIndex < 0 || r.index <= mineIndex || r.last);
  const hiddenAfter = ahead.length - shownAhead.length;
  const rows = [...(showPassed ? passed : []), ...shownAhead];
  const timesLive = onTrip && kind !== "signal_lost" && kind !== "problem";
  const nextIsMine = t.nextIndex != null && t.stops[t.nextIndex]?.name === stopName;
  const headRight = !onTrip ? `${t.total} stops`
    : nextIsMine ? "Next stop is yours"
      : t.stopsToGo != null ? `${t.stopsToGo} stop${t.stopsToGo === 1 ? "" : "s"} to go` : null;

  return (
    <section className="px-6 pt-4 lg:px-0" aria-labelledby="tt-route-title">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="tt-route-title" className="truncate text-title-sm font-bold">{route.name || "Your route"}</h2>
        {headRight && <span className="shrink-0 text-body-sm text-muted-foreground">{headRight}</span>}
      </div>
      {passed.length > 0 && (
        <button type="button" onClick={() => setShowPassed((v) => !v)} className="mb-1 ml-[46px] min-h-[36px] text-body-sm text-muted-foreground underline-offset-4 hover:underline" aria-expanded={showPassed}>
          {showPassed ? "Hide earlier stops" : `Show ${passed.length} earlier stop${passed.length === 1 ? "" : "s"}`}
        </button>
      )}
      <ol className="m-0 list-none p-0" aria-label="Route stops">
        {rows.map((r, i) => {
          const isNext = onTrip && r.status === "next";
          const isPassed = r.status === "passed";
          const toMine = onTrip && !isPassed && mineIndex >= 0 && r.index < mineIndex;
          const first = i === 0;
          const last = i === rows.length - 1;
          const eta = r.mine && mins != null ? { mins, km: stopEtas[r.stop.name]?.km } : stopEtas[r.stop.name];
          const m = timesLive && eta?.mins != null ? Math.max(1, Math.round(eta.mins)) : null;
          const sub = r.mine ? (isNext ? "Your stop, next" : "Your stop") : isNext ? "Next stop" : isPassed ? "Passed" : r.last ? "Last stop" : null;
          const detail = m == null ? null : isNext ? fmtKm(eta.km) : r.mine ? arrivalClock(eta.mins, now) : null;
          return (
            <li
              key={r.index}
              className={cn(
                "grid min-h-[60px] grid-cols-[32px_minmax(0,1fr)_auto] gap-x-3.5 rounded-xl pr-3",
                r.mine && "bg-card ring-1 ring-border",
                isPassed && "text-muted-foreground",
              )}
            >
              <span className="relative" aria-hidden="true">
                {!first && <span className={cn("absolute left-[14px] top-0 h-1/2 w-1", toMine || (onTrip && r.mine) ? "bg-primary" : "bg-border")} />}
                {!last && <span className={cn("absolute bottom-0 left-[14px] top-1/2 w-1", toMine ? "bg-primary" : "bg-border")} />}
                {r.mine ? (
                  <span className="absolute left-[2px] top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border-[3px] border-primary bg-background">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  </span>
                ) : isPassed ? (
                  <span className="absolute left-[10px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-muted-foreground/50" />
                ) : (
                  <span className={cn("absolute left-[7px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full border-[3px] bg-background", isNext ? "border-primary" : "border-muted-foreground/60")} />
                )}
              </span>
              <div className="flex min-w-0 flex-col justify-center py-2">
                {sub && isNext && <p className="text-caption font-semibold text-muted-foreground">{sub}</p>}
                <p className={cn("truncate", r.mine ? "text-title-sm font-bold" : "font-semibold")}>{r.stop.name}</p>
                {sub && !isNext && <p className={cn("text-body-sm", r.mine ? "font-semibold text-foreground" : "text-muted-foreground")}>{sub}</p>}
              </div>
              {m != null && (
                <p className="flex flex-col items-end justify-center text-right">
                  <span className="whitespace-nowrap">
                    <span className={cn("font-display font-semibold tabular-nums", r.mine ? "text-headline" : "text-title-sm")}>{m}</span>
                    <span className="ml-1 text-body-sm text-muted-foreground">min</span>
                  </span>
                  {detail && <span className="text-caption text-muted-foreground">{detail}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {hiddenAfter > 0 && <p className="ml-[46px] mt-1 text-caption text-muted-foreground">{hiddenAfter} more stop{hiddenAfter === 1 ? "" : "s"} before the last stop</p>}
    </section>
  );
}
