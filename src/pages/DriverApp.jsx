import React, { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import BusMap from "@/components/BusMap";
import DriverTrips from "@/components/DriverTrips";
import ProfileInfo from "@/components/ProfileInfo";
import { AlertCircle, BellRing, Map as MapIcon, Navigation } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DriverApp() {
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [trips, setTrips] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState(false);
  const { toast } = useToast();
  const watchId = useRef(null);
  const lastUpdate = useRef(0);
  const vehicleRef = useRef(null);
  const tripsRef = useRef([]);

  const load = async () => {
    const vs = await base44.entities.Vehicle.filter({ driver_email: user.email });
    const v = vs[0] || null;
    vehicleRef.current = v;
    setVehicle(v);
    const ts = await base44.entities.Trip.filter({ driver_email: user.email });
    const sorted = [...ts].sort((a, b) =>
      (a.scheduled_time || "").localeCompare(b.scheduled_time || "")
    );
    tripsRef.current = sorted;
    setTrips(sorted);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.Trip.subscribe((event) => {
      setTrips((prev) => {
        let next = prev;
        if (event.type === "delete") {
          next = prev.filter((t) => t.id !== event.id);
        } else {
          const rec = event.data;
          if (rec && rec.driver_email === user.email) {
            const idx = prev.findIndex((t) => t.id === event.id);
            next = idx === -1 ? [...prev, rec] : prev.map((t) => (t.id === event.id ? rec : t));
          }
        }
        next = [...next].sort((a, b) =>
          (a.scheduled_time || "").localeCompare(b.scheduled_time || "")
        );
        tripsRef.current = next;
        return next;
      });
    });
    return () => {
      unsub();
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  const updateLocation = async (lat, lng, speed) => {
    const now = Date.now();
    if (now - lastUpdate.current < 5000) return;
    lastUpdate.current = now;
    const v = vehicleRef.current;
    if (!v) return;
    const active = (tripsRef.current || []).some(
      (t) => t.status === "on_the_way" || t.status === "arrived"
    );
    const status = active ? "on_trip" : "idle";
    await base44.entities.Vehicle.update(v.id, {
      current_lat: lat,
      current_lng: lng,
      speed: speed || 0,
      status,
      last_location_update: new Date().toISOString(),
    });
    setVehicle((prev) =>
      prev ? { ...prev, current_lat: lat, current_lng: lng, speed: speed || 0, status } : prev
    );
  };

  const startSharing = () => {
    if (!navigator.geolocation || !vehicleRef.current || watchId.current != null) return;
    setSharing(true);
    navigator.geolocation.getCurrentPosition((p) =>
      updateLocation(p.coords.latitude, p.coords.longitude, p.coords.speed)
    );
    watchId.current = navigator.geolocation.watchPosition(
      (p) => updateLocation(p.coords.latitude, p.coords.longitude, p.coords.speed),
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
  };

  const stopSharing = async () => {
    setSharing(false);
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    const v = vehicleRef.current;
    if (v) {
      await base44.entities.Vehicle.update(v.id, { status: "offline" });
      setVehicle((prev) => (prev ? { ...prev, status: "offline" } : prev));
    }
  };

  const notifyStaff = async () => {
    if (!vehicle) return;
    setNotifying(true);
    try {
      await base44.entities.Broadcast.create({
        type: vehicle.type === "taxi" ? "taxi_arrived" : "bus_arrived",
        message: `${vehicle.name} has arrived`,
        vehicle_name: vehicle.name,
        company_id: vehicle.company_id,
        company_name: vehicle.company_name,
        driver_name: user?.full_name || user?.email,
        driver_email: user?.email,
      });
      toast({ title: "Staff notified", description: `${vehicle.name} arrival was sent to all staff.` });
    } catch (e) {
      toast({ title: "Couldn't notify staff", description: e.message, variant: "destructive" });
    } finally {
      setNotifying(false);
    }
  };

  // Stop broadcasting automatically once no trip is running
  useEffect(() => {
    if (!sharing) return;
    const active = trips.some((t) => t.status === "on_the_way" || t.status === "arrived");
    if (!active && trips.length > 0) stopSharing();
  }, [trips]);

  if (loading) return <AppLayout><p className="text-muted-foreground">Loading…</p></AppLayout>;
  // Anyone with a vehicle assigned to their email can use the Driver App, even if
  // their role label hasn't been set to "driver" yet.
  if (user && user.role !== "driver" && !vehicle) return <Navigate to="/" replace />;

  if (!vehicle) {
    return (
      <AppLayout title="Driver App">
        <div className="flex flex-col items-center py-20 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground max-w-md">
            No vehicle is assigned to your account ({user.email}). Ask your company to assign your email to a vehicle.
          </p>
        </div>
      </AppLayout>
    );
  }

  const hasLoc = vehicle.current_lat != null;

  return (
    <AppLayout title="Driver App">
      <div className="space-y-4 max-w-3xl">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{vehicle.name}</CardTitle>
              <Badge variant={vehicle.status === "on_trip" ? "default" : "secondary"}>
                {vehicle.status === "on_trip" ? "On trip" : vehicle.status === "idle" ? "Idle" : "Offline"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {vehicle.company_name} · {vehicle.plate_number}
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`w-2 h-2 rounded-full ${sharing ? "bg-green-500" : "bg-muted-foreground"}`} />
                {sharing ? "Sharing live GPS location" : "Location sharing off"}
              </div>
            </div>
            <div className="flex gap-2">
              {sharing ? (
                <Button variant="outline" size="sm" onClick={stopSharing}>Stop sharing</Button>
              ) : (
                <Button variant="outline" size="sm" onClick={startSharing}>
                  <Navigation className="w-4 h-4" /> Share location
                </Button>
              )}
              <Button variant={showMap ? "default" : "outline"} size="sm" onClick={() => setShowMap(!showMap)}>
                <MapIcon className="w-4 h-4" />{showMap ? "Hide map" : "Map"}
              </Button>
              <Button variant="outline" size="sm" onClick={notifyStaff} disabled={notifying}>
                <BellRing className="w-4 h-4" /> {notifying ? "Sending…" : "Notify staff"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {showMap && (
          <div className="rounded-2xl overflow-hidden border h-[45vh]">
            <BusMap vehicles={hasLoc ? [vehicle] : []} />
          </div>
        )}

        <DriverTrips trips={trips} startSharing={startSharing} refresh={load} />

        <ProfileInfo />
      </div>
    </AppLayout>
  );
}