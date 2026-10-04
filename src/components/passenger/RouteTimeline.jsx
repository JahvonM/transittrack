import React, { useMemo, useState } from "react";
import { Bus } from "lucide-react";
import { cn } from "@/lib/utils";
import { clock, timelineRows } from "./passengerState";

function busLine(kind, bus) {
  if (kind === "signal_lost") return bus.last_location_update ? `Last seen here at ${clock(bus.last_location_update)}` : "Last known position";
  if (kind === "not_started") return "Parked, not on its trip yet";
  if (kind === "problem") return "Out of service";
  const kmh = Math.round(bus.speed || 0);
  return kmh > 2 ? `Moving at ${kmh} km/h` : "Stopped";
}

/**
 * The trip as a vertical line: stops already passed (dim), the bus, the next
 * stop, your stop with its arrival time, and the last stop. Stop positions
 * come from the route and the bus's live position; nothing is scheduled.
 */
export default function RouteTimeline({ route, bus, kind, stopName, mins }) {
  const [showAll, setShowAll] = useState(false);
  const onTrip = kind === "live" || kind === "arriving" || kind === "signal_lost" || kind === "problem";
  const t = useMemo(
    () => timelineRows({ route, bus, stopName, placeBus: onTrip, showAllPassed: showAll }),
    [route, bus, stopName, onTrip, showAll],
  );
  if (!t) return null;

  const busRow = t.rows.findIndex((r) => r.type === "bus");
  const nextIsMine = t.nextIndex != null && t.stops[t.nextIndex]?.name === stopName;
  const headRight = !onTrip ? `${t.total} stops`
    : nextIsMine ? "Next stop is yours"
      : t.stopsToGo != null ? `${t.stopsToGo} stop${t.stopsToGo === 1 ? "" : "s"} to go`
        : null;
  const lost = kind === "signal_lost";

  return (
    <section className="px-6 pt-8 lg:px-0" aria-labelledby="tt-route-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="tt-route-title" className="truncate text-title-sm font-bold">{route.name || "Your route"}</h2>
        {headRight && <span className="shrink-0 text-body-sm text-muted-foreground">{headRight}</span>}
      </div>
      {t.hiddenBefore > 0 && !showAll && (
        <button type="button" onClick={() => setShowAll(true)} className="mb-1 ml-[46px] min-h-[36px] text-body-sm text-muted-foreground underline-offset-4 hover:underline">
          Show {t.hiddenBefore} earlier stop{t.hiddenBefore === 1 ? "" : "s"}
        </button>
      )}
      <ol className="m-0 list-none p-0">
        {t.rows.map((r, i) => {
          const travelledTop = busRow > -1 && onTrip && i <= busRow && i > 0;
          const travelledBottom = busRow > -1 && onTrip && i < busRow;
          const first = i === 0;
          const last = i === t.rows.length - 1;
          const rail = (
            <span className="relative" aria-hidden="true">
              {!first && <span className={cn("absolute left-[14px] top-0 h-1/2 w-1", travelledTop ? "bg-primary" : "bg-border")} />}
              {!last && <span className={cn("absolute bottom-0 left-[14px] top-1/2 w-1", travelledBottom ? "bg-primary" : "bg-border")} />}
              {r.type === "bus" ? (
                <span
                  className={cn(
                    "absolute left-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-[10px]",
                    lost || kind === "problem" || !onTrip
                      ? "border-2 border-dashed border-muted-foreground bg-background text-muted-foreground"
                      : "bg-primary text-primary-foreground shadow-[0_0_0_5px_hsl(var(--primary)/0.16)]",
                  )}
                >
                  <Bus className="h-[18px] w-[18px]" />
                </span>
              ) : r.mine ? (
                <span className="absolute left-[3px] top-1/2 grid h-[26px] w-[26px] -translate-y-1/2 place-items-center rounded-full bg-foreground">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
              ) : r.status === "passed" ? (
                <span className="absolute left-[10px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-primary/70" />
              ) : (
                <span className={cn("absolute left-[7px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full border-[3px] bg-background", r.status === "next" ? "border-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.16)]" : "border-border")} />
              )}
            </span>
          );

          if (r.type === "bus") {
            return (
              <li key="bus" className="grid min-h-[60px] grid-cols-[32px_minmax(0,1fr)] gap-x-3.5">
                {rail}
                <div className="flex flex-col justify-center py-2">
                  <p className="font-bold">{bus.name}</p>
                  <p className="text-body-sm text-muted-foreground">{busLine(kind, bus)}</p>
                </div>
              </li>
            );
          }
          const sub = r.mine ? (r.status === "next" ? "Your stop, next" : "Your stop")
            : r.status === "next" ? "Next stop"
              : r.status === "passed" ? "Passed"
                : r.last ? "Last stop" : null;
          return (
            <li key={`s${r.index}`} className={cn("grid min-h-[56px] grid-cols-[32px_minmax(0,1fr)_auto] gap-x-3.5", r.status === "passed" && "text-muted-foreground")}>
              {rail}
              <div className="flex min-w-0 flex-col justify-center py-2">
                <p className={cn("truncate", r.mine ? "text-title-sm font-bold" : "font-medium")}>{r.stop.name}</p>
                {sub && <p className={cn("text-body-sm", r.mine ? "font-semibold text-foreground" : "text-muted-foreground")}>{sub}</p>}
              </div>
              {r.mine && mins != null && onTrip && !lost && (
                <p className="flex items-baseline gap-1 self-center">
                  <span className="font-display text-headline font-semibold tabular-nums">{Math.max(1, Math.round(mins))}</span>
                  <span className="text-body-sm text-muted-foreground">min</span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {t.hiddenAfter > 0 && <p className="ml-[46px] mt-1 text-caption text-muted-foreground">{t.hiddenAfter} more stop{t.hiddenAfter === 1 ? "" : "s"} before the last stop</p>}
    </section>
  );
}
