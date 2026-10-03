import React from "react";
import { MapPin, ChevronRight, UserRound } from "lucide-react";
import AnimatedBus from "@/components/AnimatedBus";
import TripProgress from "@/components/TripProgress";
import CrowdBadge from "@/components/staff/CrowdBadge";
import CountUp from "@/components/CountUp";

// The first thing staff see: which bus is coming to their stop and when.
export default function NextBusCard({ stop, bus, eta, route, crowdCount, trip, onChooseStop }) {
  if (!stop) {
    return (
      <button
        type="button"
        onClick={onChooseStop}
        className="w-full text-left rounded-3xl border border-primary/40 bg-primary/10 p-5 flex items-center gap-4 hover:bg-primary/15 transition-colors"
      >
        <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground grid place-items-center shrink-0">
          <MapPin className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-lg">Choose your pickup stop</p>
          <p className="text-sm text-muted-foreground">We'll show when your bus is coming and can alert you when it's one stop away.</p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>
    );
  }

  const mins = eta?.mins;
  const arriving = mins != null && mins <= 1;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card" aria-label="Your bus">
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-primary/15 blur-2xl pointer-events-none" />
      <div className="relative p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Your bus to</p>
            <button type="button" onClick={onChooseStop} className="font-semibold text-lg truncate max-w-full hover:underline text-left">
              {stop.name}
            </button>
          </div>
          {bus && <CrowdBadge count={crowdCount} capacity={bus.capacity} />}
        </div>

        {bus ? (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                {arriving ? (
                  <p className="text-4xl font-bold text-primary leading-none">Arriving</p>
                ) : mins != null ? (
                  <p className="leading-none">
                    <span className="text-6xl font-bold tabular-nums text-primary"><CountUp value={Math.round(mins)} /></span>
                    <span className="text-xl font-semibold ml-1.5">min</span>
                  </p>
                ) : (
                  <p className="text-2xl font-semibold leading-none">On its way</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {eta?.isLearned
                    ? `Based on ${eta.trips || "past"} real trip${eta.trips === 1 ? "" : "s"} on this route`
                    : eta?.isDriving ? "Live estimate by road" : "Approximate estimate"}
                </p>
              </div>
              <div className="shrink-0 -mb-1 tt-bus-bob">
                <AnimatedBus mode="drive" width={112} />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{bus.name} <span className="text-muted-foreground font-normal">· {bus.plate_number || "—"}</span></p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <UserRound className="w-3.5 h-3.5" /> {bus.driver_name || "Driver"}
                </p>
              </div>
            </div>

            {route?.stops?.length > 1 && (
              <TripProgress stops={route.stops} lat={bus.current_lat} lng={bus.current_lng} label={route.name} className="!bg-transparent !border-0 !px-0 !pb-0" />
            )}
          </>
        ) : (
          <div className="flex items-center gap-4">
            <div className="opacity-70"><AnimatedBus mode="still" width={96} /></div>
            <div>
              <p className="font-semibold">No bus on the way yet</p>
              <p className="text-sm text-muted-foreground">We'll show it here as soon as a bus serving this stop starts its trip.</p>
            </div>
          </div>
        )}

        {trip && (
          <p className="text-sm rounded-xl bg-primary/10 text-primary px-3 py-2">
            Your booked ride is on the way: {trip.vehicle_name} with {trip.driver_name || "your driver"}.
          </p>
        )}
      </div>
    </section>
  );
}
