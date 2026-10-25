import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bus, CheckCircle2, Clock, Loader2, MapPin, Navigation, TriangleAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { httpStatus } from "@/lib/requestError";
import Logo from "@/components/Logo";
import MapboxMap from "@/components/MapboxMap";
import { describeRide, nextCheckMs, readTrackToken, rideClosed } from "@/lib/visitorTrack";

// Public page for a guest following their ride: /track#trip=<key>.
// No sign-in. Shows only what the visitorTracking function allows for this
// one ride, and the bus on a map while the ride is under way.

const when = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t)
    ? new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "";
};
const clock = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
};

function Shell({ children }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground safe-area-top safe-area-bottom">
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <header className="mb-5 flex items-center gap-2 font-semibold">
          <Logo className="h-9 w-9" />
          <span>McSween <span className="text-primary">Transport</span></span>
        </header>
        {children}
      </div>
    </div>
  );
}

function Notice({ icon: Icon, title, text }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5" role="status">
      <Icon className="mb-3 h-7 w-7 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-title-sm font-bold">{title}</h1>
      <p className="mt-2 text-body-sm text-muted-foreground">{text}</p>
    </section>
  );
}

export default function TrackRide() {
  const [token] = useState(() => readTrackToken(typeof window !== "undefined" ? window.location.hash : ""));
  const [view, setView] = useState(null);
  const [problem, setProblem] = useState(token ? "" : "invalid");
  const [offline, setOffline] = useState(false);
  const timer = useRef(null);

  const check = useCallback(async () => {
    clearTimeout(timer.current);
    let next = 30_000;
    try {
      const { data } = await base44.functions.invoke("visitorTracking", { action: "track", token });
      setView(data);
      setProblem("");
      setOffline(false);
      next = nextCheckMs(data);
    } catch (error) {
      const status = httpStatus(error);
      if (status === 404) { setProblem("invalid"); return; }
      // Busy or no connection: keep showing the last answer and try again.
      setOffline(true);
      next = status === 429 ? 30_000 : 20_000;
    }
    if (next != null && !document.hidden) timer.current = setTimeout(check, next);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    check();
    // Paused while the page is in the background; refreshed on return.
    const onVisible = () => { if (!document.hidden) check(); else clearTimeout(timer.current); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer.current); document.removeEventListener("visibilitychange", onVisible); };
  }, [token, check]);

  useEffect(() => { document.title = "Track your ride · McSween Transport"; }, []);

  if (problem === "invalid") {
    return (
      <Shell>
        <Notice icon={TriangleAlert} title="This tracking link isn't working" text="It may have expired, or a newer link was sent for this ride. Ask McSween Transport for a new link." />
      </Shell>
    );
  }

  if (!view) {
    return (
      <Shell>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-body-sm text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          {offline ? "Can't reach the server. Trying again…" : "Finding your ride…"}
        </div>
      </Shell>
    );
  }

  const ride = describeRide(view);
  const live = view.location && !rideClosed(view);

  return (
    <Shell>
      <section className="rounded-2xl border border-border bg-card p-5" aria-live="polite">
        <div className="flex items-start gap-3">
          {ride.tone === "live" ? (
            <span className="relative mt-1.5 flex h-3 w-3 shrink-0" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
          ) : ride.tone === "done" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <div>
            <h1 className="text-title-sm font-bold">{ride.title}</h1>
            {ride.note && <p className="mt-1 text-body-sm text-muted-foreground">{ride.note}</p>}
          </div>
        </div>

        {live && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <MapboxMap
              vehicles={[{ id: "your-bus", name: view.vehicle_name || "Your bus", type: "bus", status: "on_trip", current_lat: view.location.lat, current_lng: view.location.lng }]}
              center={[view.location.lng, view.location.lat]}
              height="260px"
              autoLocate={false}
            />
          </div>
        )}
        {live && view.location.updated_at && (
          <p className="mt-2 text-xs text-muted-foreground">Bus position from {clock(view.location.updated_at)}</p>
        )}

        <dl className="mt-5 space-y-3 text-body-sm">
          {view.pickup && (
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div><dt className="text-muted-foreground">Pickup</dt><dd className="font-medium">{view.pickup}{view.pickup_confirmed ? " · picked up" : ""}</dd></div>
            </div>
          )}
          {view.dropoff && (
            <div className="flex gap-3">
              <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div><dt className="text-muted-foreground">Drop-off</dt><dd className="font-medium">{view.dropoff}{view.dropoff_confirmed ? " · dropped off" : ""}</dd></div>
            </div>
          )}
          {when(view.scheduled_time) && (
            <div className="flex gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div><dt className="text-muted-foreground">Booked for</dt><dd className="font-medium">{when(view.scheduled_time)}</dd></div>
            </div>
          )}
          {(view.vehicle_name || view.plate_number) && (
            <div className="flex gap-3">
              <Bus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div><dt className="text-muted-foreground">Bus</dt><dd className="font-medium">{[view.vehicle_name, view.plate_number].filter(Boolean).join(" · ")}</dd></div>
            </div>
          )}
        </dl>
      </section>
      {offline && <p className="mt-3 text-center text-xs text-muted-foreground" role="status">Can't reach the server right now. Showing the last update; trying again…</p>}
      <p className="mt-6 text-center text-xs text-muted-foreground">Only people with this link can see this ride.</p>
    </Shell>
  );
}
