import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Crosshair, MapPin, Pause, Play, RotateCcw } from "lucide-react";
import { loadReplayDay, latestReplayDay } from "@/lib/replayData";
import { base44 } from "@/api/base44Client";
import { snapTrackToRoads } from "@/lib/geo";
import { mapEngine, markFullMapFailed } from "@/lib/mapEngine";
import { buildTimeline, cleanPings, findStops, positionAt, tripKm, vtForTime } from "@/lib/replay";
import { stopLabel } from "@/components/replay/ReplayMarkers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BusLoader from "@/components/BusLoader";

const ReplayMapGL = lazy(() => import("@/components/replay/ReplayMapGL"));
const ReplayMapLite = lazy(() => import("@/components/replay/ReplayMapLite"));

const pad = (n) => String(n).padStart(2, "0");
// Calendar day in the viewer's own time zone (toISOString would give UTC,
// which is "tomorrow" for part of the evening in the Americas).
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDay = (day, n) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
};
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const SPEEDS = [
  { value: 30, label: "30× (½ min per sec)" },
  { value: 60, label: "60× (1 min per sec)" },
  { value: 120, label: "120× (2 min per sec)" },
  { value: 300, label: "300× (5 min per sec)" },
];

// Plays back where a bus went on a chosen day. Used by the Location timeline
// page and by Live fleet → History.
export default function LocationReplay({ vehicles = [], initialVehicleId = "" }) {
  const [vehicleId, setVehicleId] = useState(initialVehicleId || vehicles[0]?.id || "");
  const [day, setDay] = useState(() => localDay());
  const [pings, setPings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const latestAttempted = useRef("");
  const [line, setLine] = useState(null);
  const [snapping, setSnapping] = useState(false);
  const [vt, setVt] = useState(0);
  const vtRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [follow, setFollow] = useState(false);
  const [basic, setBasic] = useState(() => mapEngine() === "basic");

  useEffect(() => { if (initialVehicleId) setVehicleId(initialVehicleId); }, [initialVehicleId]);
  useEffect(() => { if (!vehicleId && vehicles[0]) setVehicleId(vehicles[0].id); }, [vehicles, vehicleId]);

  const seek = (x) => { vtRef.current = x; setVt(x); };

  useEffect(() => {
    if (!vehicleId) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setPings([]);
    setPlaying(false);
    setLine(null);
    seek(0);
    const tryLatest = day === localDay() && latestAttempted.current !== vehicleId;
    latestAttempted.current = vehicleId;
    loadReplayDay(base44.entities.LocationPing, vehicleId, day)
      .then(async (rows) => {
        if (cancelled) return;
        if (!rows.length && tryLatest) {
          const latest = await latestReplayDay(base44.entities.LocationPing, vehicleId);
          if (cancelled) return;
          if (latest && latest !== day) { setDay(latest); return; }
        }
        setPings(cleanPings(rows));
      })
      .catch(() => { if (!cancelled) setLoadError("Couldn't load this bus's location history. Try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [vehicleId, day, retry]);

  // Put the recorded points on the actual roads (and bridge offline gaps
  // along the likeliest road) instead of joining them with straight lines.
  useEffect(() => {
    if (pings.length < 2) return undefined;
    let cancelled = false;
    setSnapping(true);
    snapTrackToRoads(pings.map((p) => ({ lat: p.lat, lng: p.lng })))
      .then((l) => { if (!cancelled && l?.length >= 2) setLine(l); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSnapping(false); });
    return () => { cancelled = true; };
  }, [pings]);

  const tl = useMemo(() => buildTimeline(pings, line), [pings, line]);
  const stops = useMemo(() => findStops(pings), [pings]);
  const position = useMemo(() => (tl ? positionAt(tl, vt) : null), [tl, vt]);

  useEffect(() => {
    if (!playing || !tl) return undefined;
    let raf;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(now - last, 250);
      last = now;
      let next = vtRef.current + dt * speed;
      if (next >= tl.total) { next = tl.total; setPlaying(false); }
      seek(next);
      if (next < tl.total) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, tl]);

  const togglePlay = () => {
    if (!tl) return;
    if (!playing && vtRef.current >= tl.total) seek(0);
    setPlaying((p) => !p);
  };

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const today = localDay();
  const fitKey = `${vehicleId}|${day}|${pings.length}`;
  const MapView = basic ? ReplayMapLite : ReplayMapGL;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={vehicleId} onValueChange={(id) => { setDay(localDay()); setVehicleId(id); }}>
          <SelectTrigger className="w-[200px]" aria-label="Bus">
            <SelectValue placeholder="Choose a bus" />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="Day before" onClick={() => setDay((d) => shiftDay(d, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <input
            type="date"
            aria-label="Day"
            value={day}
            max={today}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-background border-border"
          />
          <Button size="icon" variant="outline" aria-label="Next day" disabled={day >= today} onClick={() => setDay((d) => shiftDay(d, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {day !== today && <Button size="sm" variant="ghost" onClick={() => setDay(today)}>Today</Button>}
        <Button size="sm" variant="outline" disabled={!vehicleId || loading} onClick={async () => {
          setLoadError("");
          try {
            const latest = await latestReplayDay(base44.entities.LocationPing, vehicleId);
            if (latest) { setDay(latest); setRetry(n => n + 1); }
            else setLoadError("No location points have been recorded for this bus yet.");
          } catch { setLoadError("Couldn't find this bus's latest history. Try again."); }
        }}>Latest recorded day</Button>
      </div>

      {loadError && <div role="alert" className="rounded-xl border p-3 text-sm">{loadError} <Button size="sm" variant="outline" onClick={() => setRetry(n => n + 1)}>Retry</Button></div>}
      {loading ? (
        <BusLoader className="py-8" />
      ) : !tl ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <MapPin className="w-6 h-6 mx-auto mb-2 opacity-60" />
            {loadError ? "History is unavailable right now." : vehicles.length === 0 ? "No buses are registered yet." : `No location points recorded for ${vehicle?.name || "this bus"} on this day. Choose Latest recorded day or use the arrows to look at another day.`}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-2xl overflow-hidden border h-[50vh] min-h-[300px] relative" data-testid="replay-map">
            <Suspense fallback={<div className="w-full h-full bg-muted/40 animate-pulse" />}>
              <MapView
                line={tl.line}
                traveled={position?.traveled}
                position={position}
                stops={stops}
                follow={follow}
                fitKey={fitKey}
                onEngineFail={() => { markFullMapFailed(); setBasic(true); }}
              />
            </Suspense>
            <div className="absolute top-3 right-3 z-[500] bg-card/95 backdrop-blur border border-border rounded-lg px-3 py-2 text-xs shadow pointer-events-none" data-testid="replay-clock">
              <span className="font-semibold tabular-nums">{position ? clock(position.time) : "—"}</span>
              {position?.kmh != null && <span className="ml-2 text-muted-foreground tabular-nums">{Math.round(position.kmh)} km/h</span>}
              {snapping && <span className="ml-2 text-muted-foreground">· matching to roads…</span>}
            </div>
          </div>

          <Card>
            <CardContent className="py-3 space-y-3">
              <div className="flex items-center gap-3">
                <Button size="icon" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} data-testid="replay-play">
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <input
                  type="range"
                  aria-label="Replay position"
                  min={0}
                  max={Math.max(1, Math.round(tl.total))}
                  step={1000}
                  value={Math.round(vt)}
                  onChange={(e) => { setPlaying(false); seek(Number(e.target.value)); }}
                  className="flex-1 accent-primary"
                />
                <Button size="icon" variant="ghost" aria-label="Back to start" onClick={() => { setPlaying(false); seek(0); }}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{hhmm(tl.t[0])} – {hhmm(tl.t[tl.t.length - 1])}</span>
                <span>· {tripKm(tl).toFixed(1)} km</span>
                <span>· {stops.length} {stops.length === 1 ? "stop" : "stops"} over 5 min</span>
                <div className="ml-auto flex items-center gap-2">
                  <Button size="sm" variant={follow ? "default" : "outline"} onClick={() => setFollow((f) => !f)} aria-pressed={follow}>
                    <Crosshair className="w-3.5 h-3.5 mr-1" /> Follow bus
                  </Button>
                  <Select value={String(speed)} onValueChange={(v) => setSpeed(Number(v))}>
                    <SelectTrigger className="h-8 w-[170px] text-xs" aria-label="Replay speed"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SPEEDS.map((s) => <SelectItem key={s.value} value={String(s.value)}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {stops.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {stops.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setPlaying(false); seek(vtForTime(tl, s.from)); }}
                      className="text-caption px-2 py-1 rounded-full border border-border bg-muted/40 hover:border-primary/60"
                    >
                      {stopLabel(s)}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-caption text-muted-foreground">
                Long parked stretches play in a few seconds. Grey line = whole day, coloured line = driven so far.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
