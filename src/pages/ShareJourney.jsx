import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bus, CheckCircle2, Clock, Loader2, MapPin, Navigation, TriangleAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { httpStatus } from "@/lib/requestError";
import Logo from "@/components/Logo";
import MapboxMap from "@/components/MapboxMap";
import { describeShare, nextShareCheckMs, readShareToken } from "@/lib/journeyShare";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";

// Public page for someone following a passenger's ride: /share#j=<key>.
// No sign-in. Shows only what journeyShare allows: that passenger's own ride,
// and their bus on a map only while they're on board.

const clock = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString(undefined, { timeZone: TRANSIT_TIME_ZONE, hour: "numeric", minute: "2-digit" }) : "";
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

export default function ShareJourney() {
  const [token] = useState(() => readShareToken(typeof window !== "undefined" ? window.location.hash : ""));
  const [view, setView] = useState(null);
  const [problem, setProblem] = useState(token ? "" : "invalid");
  const [offline, setOffline] = useState(false);
  const timer = useRef(null);

  const check = useCallback(async () => {
    clearTimeout(timer.current);
    let next = 30_000;
    try {
      const { data } = await base44.functions.invoke("journeyShare", { action: "view", token });
      setView(data);
      setProblem("");
      setOffline(false);
      next = nextShareCheckMs(data);
    } catch (error) {
      const status = httpStatus(error);
      if (status === 404) { setProblem("invalid"); return; }
      setOffline(true);
      next = status === 429 ? 30_000 : 20_000;
    }
    if (next != null && !document.hidden) timer.current = setTimeout(check, next);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    check();
    const onVisible = () => { if (!document.hidden) check(); else clearTimeout(timer.current); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer.current); document.removeEventListener("visibilitychange", onVisible); };
  }, [token, check]);

  useEffect(() => { document.title = "Shared journey · McSween Transport"; }, []);

  if (problem === "invalid") {
    return (
      <Shell>
        <Notice icon={TriangleAlert} title="This journey link has ended" text="Shared journeys end when the passenger gets off, after 3 hours, or when they stop sharing. Ask them to share again if you still need it." />
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-body-sm text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          {offline ? "Can't reach the server. Trying again…" : "Finding the journey…"}
        </div>
      </Shell>
    );
  }

  const ride = describeShare(view);
  const live = !!view.location && view.state === "on_board";
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
              vehicles={[{ id: "their-bus", name: view.vehicle_name || "Bus", type: "bus", status: "on_trip", current_lat: view.location.lat, current_lng: view.location.lng }]}
              center={[view.location.lng, view.location.lat]}
              height="260px"
              autoLocate={false}
            />
          </div>
        )}
        {live && view.location.updated_at && <p className="mt-2 text-xs text-muted-foreground">Bus position from {clock(view.location.updated_at)}</p>}
        <dl className="mt-5 space-y-3 text-body-sm">
          <div className="flex gap-3">
            <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div><dt className="text-muted-foreground">Heading to</dt><dd className="font-medium">{view.heading}</dd></div>
          </div>
          <div className="flex gap-3">
            <Bus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div><dt className="text-muted-foreground">Bus</dt><dd className="font-medium">{[view.vehicle_name, view.plate_number].filter(Boolean).join(" · ")}</dd></div>
          </div>
          {view.expires_at && view.state !== "ended" && (
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div><dt className="text-muted-foreground">Link works until</dt><dd className="font-medium">{clock(view.expires_at)}, or until they get off</dd></div>
            </div>
          )}
        </dl>
      </section>
      {offline && <p className="mt-3 text-center text-xs text-muted-foreground" role="status">Can't reach the server right now. Showing the last update; trying again…</p>}
      <p className="mt-6 text-center text-xs text-muted-foreground">Shared privately by the passenger. Only people with this link can see it.</p>
    </Shell>
  );
}
