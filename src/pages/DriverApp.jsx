import React, { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import BusMap from "@/components/BusMap";
import { Play, Square, Navigation, AlertCircle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DriverApp() {
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [route, setRoute] = useState(null);
  const [trip, setTrip] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(true);
  const watchId = useRef(null);
  const lastUpdate = useRef(0);

  const load = async () => {
    const list = await base44.entities.Vehicle.filter({ driver_email: user.email });
    const v = list[0];
    setVehicle(v || null);
    if (v?.route_id) {
      const r = await base44.entities.Route.get(v.route_id).catch(() => null);
      setRoute(r);
    }
    if (v) {
      const trips = await base44.entities.Trip.filter({ vehicle_id: v.id, status: "active" });
      setTrip(trips[0] || null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  if (user && user.role !== "driver") return <Navigate to="/" replace />;

  const updateLocation = async (lat, lng, speed) => {
    const now = Date.now();
    if (now - lastUpdate.current < 4000) return;
    lastUpdate.current = now;
    const status = trip ? "on_trip" : "idle";
    await base44.entities.Vehicle.update(vehicle.id, {
      current_lat: lat,
      current_lng: lng,
      speed: speed || 0,
      status,
      last_location_update: new Date().toISOString(),
    });
    setVehicle((prev) => (prev ? { ...prev, current_lat: lat, current_lng: lng, speed, status } : prev));
  };

  const startSharing = () => {
    if (!navigator.geolocation || !vehicle) return;
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

  const stopSharing = () => {
    setSharing(false);
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    if (vehicle && !trip) base44.entities.Vehicle.update(vehicle.id, { status: "offline" });
  };

  const startTrip = async () => {
    if (!vehicle) return;
    const t = await base44.entities.Trip.create({
      vehicle_id: vehicle.id,
      vehicle_name: vehicle.name,
      route_id: vehicle.route_id || route?.id,
      route_name: route?.name,
      company_id: vehicle.company_id,
      company_name: vehicle.company_name,
      status: "active",
      started_at: new Date().toISOString(),
    });
    setTrip(t);
    await base44.entities.Vehicle.update(vehicle.id, { status: "on_trip" });
    setVehicle((prev) => (prev ? { ...prev, status: "on_trip" } : prev));
  };

  const endTrip = async () => {
    if (!trip) return;
    await base44.entities.Trip.update(trip.id, {
      status: "completed",
      ended_at: new Date().toISOString(),
    });
    setTrip(null);
    if (vehicle) {
      const status = sharing ? "idle" : "offline";
      await base44.entities.Vehicle.update(vehicle.id, { status });
      setVehicle((prev) => (prev ? { ...prev, status } : prev));
    }
  };

  if (loading) return <AppLayout><p className="text-muted-foreground">Loading…</p></AppLayout>;

  if (!vehicle)
    return (
      <AppLayout>
        <div className="flex flex-col items-center py-20 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground max-w-md">
            No vehicle is assigned to your account ({user.email}). Ask your company to assign your email to a vehicle.
          </p>
        </div>
      </AppLayout>
    );

  const stops = route?.stops || [];
  const hasLoc = vehicle.current_lat != null;

  return (
    <AppLayout title="Driver App">
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="rounded-2xl overflow-hidden border h-[55vh] lg:h-[calc(100vh-7.5rem)]">
          <BusMap
            vehicles={hasLoc ? [vehicle] : []}
            stops={stops}
            center={hasLoc ? [vehicle.current_lat, vehicle.current_lng] : undefined}
          />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>{vehicle.name}</CardTitle>
                <Badge variant={vehicle.status === "on_trip" ? "default" : "secondary"}>
                  {vehicle.status === "on_trip" ? "On trip" : vehicle.status === "idle" ? "Idle" : "Offline"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <div>{vehicle.company_name} · {vehicle.plate_number}</div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${sharing ? "bg-green-500" : "bg-muted-foreground"}`} />
                {sharing ? "Sharing live location" : "Location sharing off"}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            {trip ? (
              <Button variant="destructive" className="flex-1" onClick={endTrip}>
                <Square className="w-4 h-4 mr-1.5" /> End trip
              </Button>
            ) : (
              <Button className="flex-1" onClick={startTrip}>
                <Play className="w-4 h-4 mr-1.5" /> Start trip
              </Button>
            )}
            {sharing ? (
              <Button variant="outline" onClick={stopSharing}>Stop sharing</Button>
            ) : (
              <Button variant="outline" onClick={startSharing}>
                <Navigation className="w-4 h-4 mr-1.5" /> Share location
              </Button>
            )}
          </div>

          {route && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> {route.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {stops.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-medium">
                        {i + 1}
                      </span>
                      {s.name}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}