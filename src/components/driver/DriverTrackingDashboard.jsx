import React, { useEffect, useRef, useState, useCallback } from "react";
import { haversineKm } from "@/lib/geo";
import { GPS_INTERVAL_MS, PROXIMITY_TRIGGER_M, SPEEDING_THRESHOLD_KMH, TRAIL_MAX } from "@/lib/mapbox";
import MapboxMap from "@/components/MapboxMap";
import StaffRouteList from "@/components/driver/StaffRouteList";
import SosButton from "@/components/driver/SosButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrafficCone, Navigation, Radio, Lock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import BoardingPopup from "@/components/driver/BoardingPopup";

function timeAgo(iso) {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
}

export default function DriverTrackingDashboard({ session, invoke, driverName }) {
  const { toast } = useToast();
  const [staff, setStaff] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [nearbyStaff, setNearbyStaff] = useState([]);
  const [liveVehicle, setLiveVehicle] = useState(session?.vehicle || null);
  const [boardingPopup, setBoardingPopup] = useState(null);

  const watchId = useRef(null);
  const lastUpdate = useRef(0);
  const vehicleRef = useRef(session?.vehicle);
  const trailRef = useRef(session?.vehicle?.trail || []);
  const staffRef = useRef([]);
  const alertedRef = useRef(new Set());
  const speedingLoggedRef = useRef(false);
  const seenCheckIns = useRef(new Set());
  const firstCheckInLoad = useRef(true);

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

  useEffect(() => {
    const checkIns = session?.check_ins;
    if (!checkIns) return;
    if (firstCheckInLoad.current) {
      checkIns.forEach((c) => seenCheckIns.current.add(c.id));
      firstCheckInLoad.current = false;
      return;
    }
    checkIns.forEach((c) => {
      if (!seenCheckIns.current.has(c.id)) {
        seenCheckIns.current.add(c.id);
        setBoardingPopup({
          name: c.staff_name || "Staff member", picture: c.staff_picture_url || null,
          time: c.boarded_at ? new Date(c.boarded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
        });
      }
    });
  }, [session?.check_ins]);

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

  const handlePosition = useCallback(async (lat, lng, speed) => {
    const now = Date.now();
    const v = vehicleRef.current;
    if (!v) return;
    setLiveVehicle((prev) => prev ? { ...prev, current_lat: lat, current_lng: lng, speed: speed || 0 } : prev);
    if (now - lastUpdate.current < GPS_INTERVAL_MS) return;
    lastUpdate.current = now;
    const nextTrail = [...trailRef.current, { lat, lng, t: new Date().toISOString() }].slice(-TRAIL_MAX);
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
      await invoke("update_location", { lat, lng, speed: speed || 0, status, trail: nextTrail, log_speeding: logSpeeding });
    } catch { /* offline — next heartbeat syncs */ }
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
        if (p.coords.accuracy != null && p.coords.accuracy > 100) return;
        handlePosition(p.coords.latitude, p.coords.longitude, p.coords.speed);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) { toast({ title: "Location permission denied", variant: "destructive" }); setSharing(false); }
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

  return (
    <div className="space-y-4">
      <BoardingPopup data={boardingPopup} onClose={() => setBoardingPopup(null)} />
      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <TrafficCone className="w-5 h-5 text-amber-400 shrink-0" />
        <span className="text-sm text-amber-100">Live tracking active — navigate safely and obey traffic rules.</span>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{liveVehicle?.name}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={sharing ? "default" : "secondary"}>
                {sharing ? (<><Radio className="w-3 h-3 mr-1 animate-pulse" /> Tracking</>) : "Paused"}
              </Badge>
              {liveVehicle?.status === "speeding" && <Badge variant="destructive">Speeding</Badge>}
              {liveVehicle?.status === "emergency" && <Badge variant="destructive">SOS</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground mb-3">{liveVehicle?.company_name} · {liveVehicle?.plate_number}</div>
          {sharing ? (
            <Button variant="outline" onClick={stopTracking} disabled={!!liveVehicle?.remote_tracking_lock}>
              {liveVehicle?.remote_tracking_lock ? <><Lock className="w-4 h-4 mr-2" /> Locked by dispatch</> : <><Navigation className="w-4 h-4 mr-2" /> Stop tracking</>}
            </Button>
          ) : (
            <Button onClick={startTracking}><Navigation className="w-4 h-4 mr-2" /> Start tracking</Button>
          )}
        </CardContent>
      </Card>
      <div className="rounded-2xl overflow-hidden border h-[45vh]">
        <MapboxMap
          vehicles={liveVehicle?.current_lat != null ? [liveVehicle] : []}
          pins={staff.filter((s) => s.home_lat != null && !s.skip_pickup_today).map((s) => ({ lat: s.home_lat, lng: s.home_lng, color: "#34d399", label: s.full_name }))}
        />
      </div>
      <StaffRouteList staff={staff} vehicle={liveVehicle} nearbyStaff={nearbyStaff} onAttend={markAttended} />
      <SosButton vehicle={liveVehicle} invoke={invoke} />
    </div>
  );
}