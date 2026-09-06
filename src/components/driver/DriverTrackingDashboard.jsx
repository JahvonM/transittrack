import React, { useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { haversineKm } from "@/lib/geo";
import {
  GPS_INTERVAL_MS,
  PROXIMITY_TRIGGER_M,
  SPEEDING_THRESHOLD_KMH,
  TRAIL_MAX,
} from "@/lib/mapbox";
import MapboxMap from "@/components/MapboxMap";
import StaffRouteList from "@/components/driver/StaffRouteList";
import SosButton from "@/components/driver/SosButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrafficCone, Navigation, Radio } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function DriverTrackingDashboard({ vehicle, user }) {
  const { toast } = useToast();
  const [staff, setStaff] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [nearbyStaff, setNearbyStaff] = useState([]);
  const [alertedStaff, setAlertedStaff] = useState(new Set());
  const [liveVehicle, setLiveVehicle] = useState(vehicle);

  const watchId = useRef(null);
  const lastUpdate = useRef(0);
  const vehicleRef = useRef(vehicle);
  const trailRef = useRef(vehicle?.trail || []);
  const staffRef = useRef([]);
  const alertedRef = useRef(new Set());
  const speedingLoggedRef = useRef(false);
  const audioRef = useRef(null);

  vehicleRef.current = liveVehicle;

  // Load staff for this company
  useEffect(() => {
    const loadStaff = async () => {
      const users = await base44.entities.User.list();
      const companyStaff = users.filter(
        (u) => u.role === "staff" && u.company_id === vehicle.company_id
      );
      staffRef.current = companyStaff;
      setStaff(companyStaff);
    };
    loadStaff();
    const unsub = base44.entities.Vehicle.subscribe((event) => {
      if (event.data?.id === vehicle.id) {
        setLiveVehicle(event.data);
        vehicleRef.current = event.data;
      }
    });
    return () => unsub();
  }, [vehicle.id]);

  // Proximity sound: short beep using WebAudio
  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "square";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      /* ignore */
    }
  }, []);

  const handlePosition = useCallback(
    async (lat, lng, speed) => {
      const now = Date.now();
      const v = vehicleRef.current;
      if (!v) return;

      // Throttle DB writes to 30s
      if (now - lastUpdate.current < GPS_INTERVAL_MS) return;
      lastUpdate.current = now;

      const nextTrail = [...trailRef.current, { lat, lng, t: new Date().toISOString() }].slice(-TRAIL_MAX);
      trailRef.current = nextTrail;

      // Speeding detection
      const speedKmh = (speed || 0) * 3.6;
      let status = "on_trip";
      if (speedKmh > SPEEDING_THRESHOLD_KMH) {
        status = "speeding";
        if (!speedingLoggedRef.current) {
          speedingLoggedRef.current = true;
          await base44.entities.Incident.create({
            vehicle_id: v.id,
            vehicle_name: v.name,
            company_id: v.company_id,
            company_name: v.company_name,
            driver_name: user?.full_name || user?.email,
            driver_email: user?.email,
            type: "speeding",
            details: `Speed recorded at ${Math.round(speedKmh)} km/h`,
            occurred_at: new Date().toISOString(),
          });
          toast({ title: "Speeding logged", description: "You exceeded the 100 km/h limit.", variant: "destructive" });
        }
      } else {
        speedingLoggedRef.current = false;
      }

      await base44.entities.Vehicle.update(v.id, {
        current_lat: lat,
        current_lng: lng,
        heading: undefined,
        speed: speed || 0,
        status,
        last_location_update: new Date().toISOString(),
        trail: nextTrail,
      });
      setLiveVehicle((prev) => prev ? { ...prev, current_lat: lat, current_lng: lng, speed: speed || 0, status, trail: nextTrail } : prev);

      // Proximity check per staff
      const nearby = [];
      staffRef.current.forEach((s) => {
        if (s.skip_pickup_today || s.home_lat == null) return;
        const distM = haversineKm(lat, lng, s.home_lat, s.home_lng) * 1000;
        if (distM <= PROXIMITY_TRIGGER_M) {
          nearby.push(s.id);
          if (!alertedRef.current.has(s.id)) {
            alertedRef.current.add(s.id);
            playBeep();
            // Email the staff member that the bus is near (Gmail notification)
            base44.functions.invoke('notifyStaffPickup', {
              to_email: s.email,
              staff_name: s.full_name || '',
              vehicle_name: v.name,
              driver_name: user?.full_name || user?.email || '',
              company_name: v.company_name || '',
            }).catch(() => {});
          }
        }
      });
      setNearbyStaff(nearby);
    },
    [playBeep, toast, user]
  );

  const startTracking = () => {
    if (!navigator.geolocation || watchId.current != null) return;
    setSharing(true);
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        // Reject low-accuracy fixes to prevent erratic pin jumps
        if (p.coords.accuracy != null && p.coords.accuracy > 20) return;
        handlePosition(p.coords.latitude, p.coords.longitude, p.coords.speed);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast({ title: "Location permission denied", variant: "destructive" });
          setSharing(false);
        }
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const stopTracking = async () => {
    setSharing(false);
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    const v = vehicleRef.current;
    if (v) {
      await base44.entities.Vehicle.update(v.id, { status: "idle" });
      setLiveVehicle((prev) => prev ? { ...prev, status: "idle" } : prev);
    }
  };

  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  const markAttended = (staffId) => {
    setNearbyStaff((prev) => prev.filter((id) => id !== staffId));
    toast({ title: "Attendance marked", description: "Staff member picked up." });
  };

  return (
    <div className="space-y-4">
      {/* Traffic banner */}
      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <TrafficCone className="w-5 h-5 text-amber-400 shrink-0" />
        <span className="text-sm text-amber-100">Live tracking active — navigate safely and obey traffic rules.</span>
      </div>

      {/* Vehicle status card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{liveVehicle.name}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={sharing ? "default" : "secondary"}>
                {sharing ? (
                  <><Radio className="w-3 h-3 mr-1 animate-pulse" /> Tracking</>
                ) : "Paused"}
              </Badge>
              {liveVehicle.status === "speeding" && <Badge variant="destructive">Speeding</Badge>}
              {liveVehicle.status === "emergency" && <Badge variant="destructive">SOS</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground mb-3">
            {liveVehicle.company_name} · {liveVehicle.plate_number}
          </div>
          {sharing ? (
            <Button variant="outline" onClick={stopTracking}>
              <Navigation className="w-4 h-4 mr-2" /> Stop tracking
            </Button>
          ) : (
            <Button onClick={startTracking}>
              <Navigation className="w-4 h-4 mr-2" /> Start tracking
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Map */}
      <div className="rounded-2xl overflow-hidden border h-[45vh]">
        <MapboxMap
          vehicles={liveVehicle.current_lat != null ? [liveVehicle] : []}
          pins={staff
            .filter((s) => s.home_lat != null && !s.skip_pickup_today)
            .map((s) => ({ lat: s.home_lat, lng: s.home_lng, color: "#34d399", label: s.full_name }))}
        />
      </div>

      {/* Staff route list */}
      <StaffRouteList
        staff={staff}
        vehicle={liveVehicle}
        nearbyStaff={nearbyStaff}
        onAttend={markAttended}
      />

      {/* SOS */}
      <SosButton vehicle={liveVehicle} user={user} />
    </div>
  );
}