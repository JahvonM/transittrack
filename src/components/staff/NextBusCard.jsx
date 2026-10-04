import React, { useEffect, useState } from "react";
import { MapPin, ChevronRight, UserRound } from "lucide-react";
import BusArtwork from "@/components/BusArtwork";
import PassengerTimeline from "@/components/staff/PassengerTimeline";
import CrowdBadge from "@/components/staff/CrowdBadge";
import CountUp from "@/components/CountUp";

// The first thing staff see: which bus is coming to their stop and when.
export default function NextBusCard({ stop, bus, eta, route, crowdCount, trip, onChooseStop }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const updated = Date.parse(bus?.last_location_update || "");
  const age = Number.isFinite(updated) ? Math.max(0, Math.round((now - updated) / 1000)) : null;
  const fresh = age != null && age <= 120 && !eta?.stale;
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
    <section className="tt-arrival-card relative overflow-hidden rounded-3xl border border-border bg-card" aria-label="Your bus">
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-primary/15 blur-2xl pointer-events-none" />
      <div className="relative p-5 sm:p-6 space-y-5">
        {bus && <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><span className={`w-2 h-2 rounded-full ${fresh ? "bg-primary" : "bg-amber-500"}`} />{fresh ? `Live · updated ${age}s ago` : age != null ? `Location delayed · updated ${Math.max(1,Math.round(age / 60))} min ago` : "Waiting for a location update"}</p>}
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
                    <span className="text-7xl sm:text-8xl font-extrabold tracking-tighter tabular-nums text-foreground"><CountUp value={Math.round(mins)} /></span>
                    <span className="text-xl font-semibold ml-1.5">min</span>
                  </p>
                ) : (
                  <p className="text-2xl font-semibold leading-none">{eta?.stale ? "Location delayed" : eta?.loading ? "Calculating…" : "ETA unavailable"}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {eta?.stale ? "Waiting for a fresh bus location" : eta?.isLearned
                    ? `Based on ${eta.trips || "past"} real trip${eta.trips === 1 ? "" : "s"} on this route`
                    : eta?.isDriving ? "Road estimate via remaining stops · stop waits may add time" : "A reliable arrival time is not available yet"}
                </p>
              </div>
              <div className="shrink-0 -mb-1 tt-bus-bob">
                <BusArtwork width={150} className="max-w-[38vw]" />
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
              <PassengerTimeline route={route} bus={bus} stop={stop} eta={eta} />
            )}
          </>
        ) : (
          <div className="flex items-center gap-4">
            <div className="opacity-70"><BusArtwork width={110} /></div>
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
