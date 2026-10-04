import React, { useEffect, useRef, useState, useCallback } from "react";
import { haversineKm } from "@/lib/geo";
import { GPS_INTERVAL_MS, PROXIMITY_TRIGGER_M, SPEEDING_THRESHOLD_KMH, TRAIL_MAX } from "@/lib/mapbox";
import DriverNavMap from "@/components/driver/DriverNavMap";
import StaffRouteList from "@/components/driver/StaffRouteList";
import SosButton from "@/components/driver/SosButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navigation, Radio, Lock, Users, AlertTriangle, Satellite } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { queueGpsPoint, queuedGpsCount, flushGpsQueue, gpsSyncError, GPS_QUEUE_EVENT } from "@/lib/gpsQueue";
import { noteGpsFix } from "@/lib/appHealth";

// The Drive screen: turn-by-turn map + everything the driver needs beside
// it, sized to the screen (no page scrolling). panelTop / panelBottom let the
// app put the shift card, due inspections and trips into the side panel.
export default function DriverTrackingDashboard({ session, invoke, onReportIncident, panelTop = null, panelBottom = null }) {
  const { toast } = useToast();
  const [staff, setStaff] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [nearbyStaff, setNearbyStaff] = useState([]);
  const [liveVehicle, setLiveVehicle] = useState(session?.vehicle || null);
  const [occupancy, setOccupancy] = useState(0);

  const watchId = useRef(null);
  const lastUpdate = useRef(0);
  const vehicleRef = useRef(session?.vehicle);
  const trailRef = useRef(session?.vehicle?.trail || []);
  const staffRef = useRef([]);
  const alertedRef = useRef(new Set());
  const speedingLoggedRef = useRef(false);

  // Tracking health shown under the tracking buttons.
  const [lastFixAt, setLastFixAt] = useState(null);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [queued, setQueued] = useState(() => queuedGpsCount());
  const [gpsProblem, setGpsProblem] = useState("");
  const [, setTick] = useState(0);
  useEffect(() => {
    const onQueue = () => { setQueued(queuedGpsCount()); setGpsProblem(gpsSyncError()); };
    const onOnline = () => flushGpsQueue(invoke).then((n) => { if (n) setLastSentAt(Date.now()); }).catch(e=>setGpsProblem(e.message));
    window.addEventListener(GPS_QUEUE_EVENT, onQueue);
    window.addEventListener("online", onOnline);
    const t = setInterval(() => setTick((x) => x + 1), 15000);
    if (queuedGpsCount()) onOnline();
    return () => { window.removeEventListener(GPS_QUEUE_EVENT, onQueue); window.removeEventListener("online", onOnline); clearInterval(t); };
  }, [invoke]);

  useEffect(() => {
    if (session?.staff) { staffRef.current = session.staff; setStaff(session.staff); }
  }, [session?.staff]);

  useEffect(() => {
    if (session?.vehicle) {
      vehicleRef.current = session.vehicle;
      setLiveVehicle(session.vehicle);
      if (session.vehicle.trail) trailRef.current = session.vehicle.trail;
    }
  }, [session?.vehicle]);

  useEffect(() => { setOccupancy(session?.occupancy || 0); }, [session?.occupancy]);

  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = "square";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch { /* ignore */ }
  }, []);

  const handlePosition = useCallback(async (lat, lng, speed, extra = {}) => {
    const now = Date.now();
    setLastFixAt(now);
    noteGpsFix(now);
    setGpsProblem("");
    const v = vehicleRef.current;
    if (!v) return;
    setLiveVehicle((prev) => prev ? { ...prev, current_lat: lat, current_lng: lng, speed: speed || 0 } : prev);
    if (now - lastUpdate.current < GPS_INTERVAL_MS) return;
    lastUpdate.current = now;
    // The tail only covers the last half hour, so yesterday's drive (or the
    // previous trip) never shows up as a line on the maps.
    const cutoff = Date.now() - 30 * 60 * 1000;
    const recent = trailRef.current.filter((p) => p.t && Date.parse(p.t) > cutoff);
    const nextTrail = [...recent, { lat, lng, t: new Date(extra.ts || now).toISOString() }].slice(-TRAIL_MAX);
    trailRef.current = nextTrail;
    const speedKmh = (speed || 0) * 3.6;
    let status = "on_trip";
    let logSpeeding = false;
    if (speedKmh > SPEEDING_THRESHOLD_KMH) {
      status = "speeding";
      if (!speedingLoggedRef.current) {
        speedingLoggedRef.current = true;
        logSpeeding = true;
        toast({ title: "Speeding logged", description: "You exceeded the 100 km/h limit.", variant: "destructive" });
      }
    } else { speedingLoggedRef.current = false; }
    try {
      await invoke("update_location", { lat, lng, speed: speed || 0, status, trail: nextTrail, log_speeding: logSpeeding, recorded_at: new Date(extra.ts || now).toISOString() });
      setLastSentAt(Date.now());
      // Back online: send anything saved while there was no connection.
      if (queuedGpsCount()) flushGpsQueue(invoke).catch(e=>setGpsProblem(e.message));
    } catch (e) {
      // No connection: keep the point on the tablet (with the time it was
      // taken) and upload it later, so the trip has no gap.
      if (!e?.response || [401,403,429].includes(e.response.status) || e.response.status>=500) {
        try { queueGpsPoint({ lat, lng, speed, heading: extra.heading, accuracy: extra.accuracy, t: extra.ts || now }); }
        catch (storageError) { toast({ title: "GPS could not be saved", description: storageError.message, variant: "destructive" }); }
      }
    }
    setLiveVehicle((prev) => prev ? { ...prev, current_lat: lat, current_lng: lng, speed: speed || 0, status, trail: nextTrail } : prev);
    const nearby = [];
    staffRef.current.forEach((s) => {
      if (s.skip_pickup_today || s.home_lat == null) return;
      const distM = haversineKm(lat, lng, s.home_lat, s.home_lng) * 1000;
      if (distM <= PROXIMITY_TRIGGER_M) {
        nearby.push(s.id);
        if (!alertedRef.current.has(s.id)) {
          alertedRef.current.add(s.id);
          playBeep();
          invoke("notify_pickup", { to_email: s.email }).catch(() => {});
        }
      }
    });
    setNearbyStaff(nearby);
  }, [playBeep, toast, invoke]);

  const startTracking = async () => {
    if (!navigator.geolocation || watchId.current != null) return;
    setSharing(true);
    try { await invoke("start_tracking"); } catch { /* tolerate */ }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        if (p.coords.accuracy != null && p.coords.accuracy > 100) { setGpsProblem("Weak GPS signal"); return; }
        handlePosition(p.coords.latitude, p.coords.longitude, p.coords.speed, { heading: p.coords.heading, accuracy: p.coords.accuracy, ts: p.timestamp });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast({ title: "Location permission denied", description: "Allow location for this app in the tablet's settings.", variant: "destructive" });
          setGpsProblem("Location permission is off");
          setSharing(false);
        } else {
          setGpsProblem(err.code === err.POSITION_UNAVAILABLE ? "GPS is off or unavailable" : "Waiting for GPS signal");
        }
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const stopTracking = async () => {
    try {
      await invoke("stop_tracking");
    } catch (e) {
      const msg = e?.message || e?.error || "";
      if (msg.includes("locked")) {
        toast({ title: "Tracking is locked by dispatch", description: "Cannot stop while admin lock is active.", variant: "destructive" });
        return;
      }
    }
    setSharing(false);
    if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
    const v = vehicleRef.current;
    if (v) {
      try { await invoke("update_location", { lat: v.current_lat, lng: v.current_lng, speed: 0, status: "idle" }); } catch { /* ignore */ }
      setLiveVehicle((prev) => prev ? { ...prev, status: "idle" } : prev);
    }
  };

  // Auto-start GPS when admin forces lock on
  const lockNotified = useRef(false);
  useEffect(() => {
    const locked = !!liveVehicle?.remote_tracking_lock;
    if (locked && watchId.current == null) {
      startTracking();
      if (!lockNotified.current) {
        lockNotified.current = true;
        toast({ title: "Tracking started by dispatch (locked)", description: "Location sharing is now enforced — stop disabled.", variant: "default" });
      }
    }
    if (!locked) lockNotified.current = false;
  }, [liveVehicle?.remote_tracking_lock]);

  useEffect(() => { return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); }; }, []);

  const markAttended = (staffId) => {
    setNearbyStaff((prev) => prev.filter((id) => id !== staffId));
    toast({ title: "Attendance marked", description: "Staff member picked up." });
  };

  const staffPins = staff
    .filter((s) => s.home_lat != null && !s.skip_pickup_today)
    .map((s) => ({ lat: s.home_lat, lng: s.home_lng, color: "#34d399", label: s.full_name }));
  const locked = !!liveVehicle?.remote_tracking_lock;

  // One line of tracking health: GPS fix freshness, upload state, saved points.
  const ago = (ms) => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `${s}s` : `${Math.round(s / 60)} min`; };
  const staleFix = sharing && lastFixAt && Date.now() - lastFixAt > 60000;
  const health = !sharing
    ? (queued ? { tone: "warn", text: `${queued} saved GPS point${queued === 1 ? "" : "s"} waiting to upload` } : null)
    : gpsProblem ? { tone: "warn", text: gpsProblem }
    : staleFix ? { tone: "warn", text: `No GPS signal for ${ago(lastFixAt)}` }
    : queued ? { tone: "warn", text: `No connection · ${queued} GPS point${queued === 1 ? "" : "s"} saved on this tablet, will upload` }
    : lastSentAt ? { tone: "ok", text: `GPS live · sent ${ago(lastSentAt)} ago` }
    : { tone: "muted", text: "Waiting for first GPS fix…" };

  // The USB GPS module, if this tablet has one (reported by the TransitTrack
  // Helper app; refreshed every 15 s by the tick above).
  const moduleGps = (() => {
    const g = typeof window !== "undefined" ? window.__ttHelperHealth?.gps : null;
    if (!g) return null;
    const text = String(g);
    if (/^fix|connected|giving/i.test(text)) return { tone: "ok", text };
    if (/searching/i.test(text)) return { tone: "warn", text };
    if (/off|paused/i.test(text)) return { tone: "idle", text };
    return { tone: "bad", text };
  })();

  // Sized to the screen with nothing to scroll: landscape = map | panel,
  // portrait = map on top, two panel columns below. Lists show what fits and
  // open the rest in a sheet.
  return (
    <div className="h-full min-h-0 flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-3">
      <div className="flex-1 min-h-0 lg:h-full">
        <DriverNavMap session={session} invoke={invoke} fill pushLocation={false} pins={staffPins} />
      </div>

      <aside className="shrink-0 h-[44%] lg:h-full min-h-0 flex flex-col gap-2" aria-label="Driving controls">
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden grid gap-2 md:grid-cols-2 md:[grid-template-rows:minmax(0,1fr)] lg:flex lg:flex-col">
          <div className="flex flex-col gap-2 min-h-0 shrink-0">
            {panelTop}

            {/* passengers + tracking in one card */}
            <div className="p-3 rounded-2xl border bg-card space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <p className="flex-1 min-w-0 leading-tight">
                  <span className="text-xl font-bold">{occupancy}</span>
                  <span className="text-sm text-muted-foreground">{liveVehicle?.capacity ? ` / ${liveVehicle.capacity}` : ""} aboard</span>
                </p>
                <div className="flex items-center gap-1">
                  {liveVehicle?.status === "speeding" && <Badge variant="destructive">Speeding</Badge>}
                  {liveVehicle?.status === "emergency" && <Badge variant="destructive">SOS</Badge>}
                  <Badge variant={sharing ? "default" : "secondary"}>
                    {sharing ? (<><Radio className="w-3 h-3 mr-1 animate-pulse" /> Tracking</>) : "Paused"}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                {sharing ? (
                  <Button variant="outline" className="flex-1 h-11" onClick={stopTracking} disabled={locked}>
                    {locked ? <><Lock className="w-4 h-4 mr-2" /> Locked by dispatch</> : <><Navigation className="w-4 h-4 mr-2" /> Stop tracking</>}
                  </Button>
                ) : (
                  <Button className="flex-1 h-11" onClick={startTracking}><Navigation className="w-4 h-4 mr-2" /> Start tracking</Button>
                )}
                {onReportIncident && (
                  <Button variant="outline" className="h-11 px-3 text-destructive" onClick={onReportIncident} aria-label="Report an incident">
                    <AlertTriangle className="w-5 h-5" /><span className="hidden sm:inline ml-1.5">Report</span>
                  </Button>
                )}
              </div>
              {moduleGps && (
                <p className={`text-xs flex items-center gap-1.5 ${moduleGps.tone === "warn" ? "text-amber-600 dark:text-amber-400" : moduleGps.tone === "ok" ? "text-green-700 dark:text-green-400" : moduleGps.tone === "bad" ? "text-destructive" : "text-muted-foreground"}`}>
                  <Satellite className="w-3.5 h-3.5 shrink-0" /> GPS module: {moduleGps.text}
                </p>
              )}
              {health && (
                <p role="status" className={`text-xs flex items-center gap-1.5 ${health.tone === "warn" ? "text-amber-600 dark:text-amber-400" : health.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${health.tone === "warn" ? "bg-amber-500" : health.tone === "ok" ? "bg-green-500" : "bg-muted-foreground"}`} />
                  {health.text}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 min-h-[160px] md:min-h-0 lg:flex-1">
            {panelBottom}
            <div className="flex-1 min-h-[120px] md:min-h-0">
              <StaffRouteList staff={staff} vehicle={liveVehicle} nearbyStaff={nearbyStaff} onAttend={markAttended} compact />
            </div>
          </div>
        </div>

        <div className="shrink-0">
          <SosButton vehicle={liveVehicle} invoke={invoke} emergencyContacts={session?.emergency_contacts} compact />
        </div>
      </aside>
    </div>
  );
}
