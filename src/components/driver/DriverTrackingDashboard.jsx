import DriverPortraitDrive from "./DriverPortraitDrive";
import { getNavTarget, onNavTarget } from "@/lib/navTarget";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { haversineKm } from "@/lib/geo";
import { accountName } from "@/lib/userName";
import { GPS_INTERVAL_MS, PROXIMITY_TRIGGER_M, SPEEDING_THRESHOLD_KMH, TRAIL_MAX } from "@/lib/mapbox";
import DriverNavMap from "@/components/driver/DriverNavMap";
import { Button } from "@/components/ui/button";
import { Navigation, NavigationOff, Lock, Satellite, SatelliteDish, Wifi, WifiOff, CloudUpload, Radio, PauseCircle, Gauge, BellRing } from "lucide-react";
import { AttentionItem, DeckButton } from "@/components/driver/cockpit/CockpitParts";
import { useToast } from "@/components/ui/use-toast";
import { queueGpsPoint, queuedGpsCount, flushGpsQueue, gpsSyncError, GPS_QUEUE_EVENT } from "@/lib/gpsQueue";
import { noteGpsFix } from "@/lib/appHealth";
import { retryGps, GPS_RETRY_EVENT } from "@/lib/helperHealth";
import { roadStopsOf, busOnRoad, nextRoadStopIndex } from "@/lib/roadStops";

// The Drive screen, laid out like a cockpit: the turn-by-turn map, then one
// rail that reads top to bottom — status, next stop, people on board, things
// that need attention, today's trips and pickups, and the control deck.
// shiftControl: the shift half of the deck (its own start/end logic).
// panelTop: items that need attention now (e.g. a due inspection).
// panelBottom: today's booked trips.
// shiftActive: whether a shift is open, only to highlight the next step.
export default function DriverTrackingDashboard({ session, invoke, onReportIncident, panelTop = null, panelBottom = null, shiftControl = null, shiftActive = false, onOpenPassengers, onOpenMessages, onOpenStops, directionControl }) {
  const { toast } = useToast();
  const [mapOpen,setMapOpen]=useState(()=>{try{return (!!getNavTarget() && getNavTarget().navigate !== false) || sessionStorage.getItem("tt_nav_on")==="1";}catch{return false;}});
  const [mapLoaded,setMapLoaded]=useState(mapOpen);
  const openNavigation=()=>{setMapLoaded(true);setMapOpen(true);};
  useEffect(()=>onNavTarget(()=>{if(getNavTarget() && getNavTarget().navigate !== false)openNavigation();}),[]);
  useEffect(()=>{if(mapOpen)requestAnimationFrame(()=>window.dispatchEvent(new Event("resize")));},[mapOpen]);

  const [staff, setStaff] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [nearbyStaff, setNearbyStaff] = useState([]);
  const [liveVehicle, setLiveVehicle] = useState(session?.vehicle || null);

  const watchId = useRef(null);
  const lastUpdate = useRef(0);
  const vehicleRef = useRef(session?.vehicle);
  const sessionRef = useRef(session);
  sessionRef.current = session;
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
    noteGpsFix(now, lat, lng);
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
    // Which of this bus's stops on the drawn road is next, so passengers see
    // how many stops away the bus is and get a heads-up when theirs is next.
    let roadNext = null;
    try {
      const s = sessionRef.current;
      const roadStops = roadStopsOf(s);
      if (roadStops) roadNext = nextRoadStopIndex(roadStops, busOnRoad(s.route, lat, lng));
    } catch { /* stop position is optional */ }
    try {
      await invoke("update_location", { lat, lng, speed: speed || 0, status, trail: nextTrail, log_speeding: logSpeeding, recorded_at: new Date(extra.ts || now).toISOString(), ...(Number.isInteger(roadNext) ? { road_next: roadNext } : {}) });
      setLastSentAt(Date.now());
      // Back online: send anything saved while there was no connection.
      if (queuedGpsCount()) flushGpsQueue(invoke).catch(e=>setGpsProblem(e.message));
    } catch (e) {
      // No connection: keep the point on the tablet (with the time it was
      // taken) and upload it later, so the trip has no gap.
      if (!e?.response || [401,403,429].includes(e.response.status) || e.response.status>=500) {
        try { queueGpsPoint({ lat, lng, speed, heading: extra.heading, accuracy: extra.accuracy, t: extra.ts || now, binding:{expected_device_id:localStorage.getItem("tt_driver_device_id"),expected_company_id:v.company_id,expected_vehicle_id:v.id} }); }
        catch (storageError) { toast({ title: "GPS could not be saved", description: storageError.message, variant: "destructive" }); }
      }
    }
    setLiveVehicle((prev) => prev ? { ...prev, current_lat: lat, current_lng: lng, speed: speed || 0, status, trail: nextTrail } : prev);
    const nearby = [];
    staffRef.current.forEach((s) => {
      if (s.trip_direction === "to_home" || s.skip_pickup_today || s.home_lat == null) return;
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

  const beginWatch = () => {
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

  const startTracking = async () => {
    if (!navigator.geolocation || watchId.current != null) return;
    setSharing(true);
    try { await invoke("start_tracking"); } catch { /* tolerate */ }
    beginWatch();
  };

  // "Check GPS again": restart the location reading so a GPS module plugged
  // in after tracking started is picked up.
  useEffect(() => {
    const restart = () => {
      if (watchId.current == null || !navigator.geolocation) return;
      navigator.geolocation.clearWatch(watchId.current);
      setGpsProblem("");
      beginWatch();
    };
    window.addEventListener(GPS_RETRY_EVENT, restart);
    return () => window.removeEventListener(GPS_RETRY_EVENT, restart);
  });

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

  // Tracking belongs to the bus, not to this screen. If the server already
  // says this vehicle is sharing its location — the tablet was reloaded,
  // restarted or rebooted mid-shift — pick the GPS watch straight back up
  // instead of going quiet until someone taps Start again. This is also how
  // dispatch's remote lock turns tracking on.
  const lockNotified = useRef(false);
  useEffect(() => {
    const locked = !!liveVehicle?.remote_tracking_lock;
    if ((locked || liveVehicle?.tracking_active) && watchId.current == null) {
      startTracking();
      if (locked && !lockNotified.current) {
        lockNotified.current = true;
        toast({ title: "Tracking started by dispatch (locked)", description: "Location sharing is now enforced — stop disabled.", variant: "default" });
      }
    }
    if (!locked) lockNotified.current = false;
  }, [liveVehicle?.remote_tracking_lock, liveVehicle?.tracking_active]);

  useEffect(() => { return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); }; }, []);

  const staffPins = staff
    .filter((s) => s.home_lat != null && !s.skip_pickup_today)
    .map((s) => ({ lat: s.home_lat, lng: s.home_lng, color: "#34d399", label: accountName(s) }));
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

  // What the directions know (next stop, time left, GPS, connection).
  const [nav, setNav] = useState(null);
  const onNavStatus = useCallback((x) => setNav(x), []);

  const online = nav ? nav.online : typeof navigator === "undefined" || navigator.onLine !== false;
  const gpsItem = sharing
    ? (health?.tone === "ok" ? { tone: "success", icon: Satellite, label: "GPS live", detail: health.text.replace(/^GPS live · /, "") }
      : health?.tone === "warn" ? { tone: "warning", icon: SatelliteDish, label: "GPS problem", detail: health.text }
        : { tone: "neutral", icon: SatelliteDish, label: "Finding GPS", detail: "Waiting for first fix" })
    : nav?.gpsStatus === "locked" ? { tone: "success", icon: Satellite, label: "GPS ready" }
      : nav?.gpsStatus === "low" ? { tone: "warning", icon: SatelliteDish, label: "Weak GPS" }
        : { tone: "neutral", icon: SatelliteDish, label: "Finding GPS" };
  if (moduleGps && moduleGps.tone !== "ok") gpsItem.detail = `GPS module: ${moduleGps.text}`;
  // GPS module plugged in late, or no fix: a tap asks the helper to look for
  // the USB GPS again and restarts this page's location reading.
  if (gpsItem.tone !== "success" || (moduleGps && moduleGps.tone === "bad")) {
    gpsItem.onClick = () => {
      retryGps();
      toast({ title: "Looking for the GPS again…", description: "If the GPS module was just plugged in, it shows here within a few seconds." });
    };
    gpsItem.actionLabel = "Tap to check again";
  }
  const connItem = !online
    ? { tone: "warning", icon: WifiOff, label: "Offline", detail: queued ? `${queued} point${queued === 1 ? "" : "s"} saved` : "Saving on tablet" }
    : queued ? { tone: "info", icon: CloudUpload, label: "Uploading", detail: `${queued} saved point${queued === 1 ? "" : "s"}` }
      : { tone: "success", icon: Wifi, label: "Online" };
  const trackItem = sharing
    ? { tone: "live", icon: Radio, label: locked ? "Locked on" : "Tracking", detail: locked ? "By dispatch" : "Sharing" }
    : { tone: "neutral", icon: PauseCircle, label: "Not tracking", detail: "Not shared" };

  const attention = [];
  if (liveVehicle?.status === "speeding") attention.push(<AttentionItem key="speed" tone="danger" icon={Gauge} title="Slow down" detail="Speeding has been logged" />);
  if (nearbyStaff.length) {
    const names = staff.filter((p) => nearbyStaff.includes(p.id)).map((p) => accountName(p).split(" ")[0]).filter(Boolean);
    attention.push(
      <AttentionItem key="near" tone="info" icon={BellRing}
        title={`${nearbyStaff.length} pickup${nearbyStaff.length === 1 ? "" : "s"} within 500 m`}
        detail={names.length ? `${names.slice(0, 3).join(", ")} ${names.length === 1 ? "has" : "have"} been alerted` : "Passengers have been alerted"} />,
    );
  }

  const trackingPrimary = !!shiftActive && !sharing;
  const trackingButton = (
    <DeckButton
      icon={sharing ? (locked ? Lock : NavigationOff) : Navigation}
      state={sharing ? (locked ? "Locked on by dispatch" : "Sharing location") : "Location not shared"}
      action={sharing ? (locked ? "Locked by dispatch" : "End trip") : "Start trip"}
      onClick={sharing ? stopTracking : startTracking}
      disabled={sharing && locked}
      active={sharing}
      primary={trackingPrimary}
      danger={sharing && !locked}
      ariaLabel={sharing ? (locked ? "Tracking is locked on by dispatch" : "End tracking") : "Start tracking"}
    />
  );


  return <div className="h-full min-h-0">
    <div className="dk-navigation-screen" style={{display:mapOpen?"flex":"none"}} aria-hidden={!mapOpen}>
      <Button variant="outline" onClick={()=>setMapOpen(false)}>Back to journey</Button>
      <div className="dk-navigation-map" aria-label="Driver navigation map">
        {mapLoaded && <DriverNavMap key={(session?.vehicle?.id || "")+session?.trip_direction} session={session} invoke={invoke} fill pushLocation={false} pins={staffPins} showProgress={false} showStatus onStatus={onNavStatus}/>}
      </div>
    </div>
    {!mapOpen && <DriverPortraitDrive session={session} vehicle={lastFixAt?{...liveVehicle,last_location_update:new Date(lastFixAt).toISOString()}:liveVehicle} nav={nav} sharing={sharing}
      shiftActive={shiftActive} directionControl={directionControl} shiftControl={shiftControl} trackingButton={trackingButton}
      statusItems={[{key:"gps",...gpsItem},{key:"net",...connItem},{key:"track",...trackItem}]}
      attention={attention} panelTop={panelTop} panelBottom={panelBottom}
      onOpenNavigation={openNavigation} onOpenPassengers={onOpenPassengers} onOpenStops={onOpenStops}
      onOpenMessages={onOpenMessages} onReportIncident={onReportIncident} invoke={invoke}/>}
  </div>;
}
