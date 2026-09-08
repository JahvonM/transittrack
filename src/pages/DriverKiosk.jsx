import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import OfflineStatusBadge from "@/components/OfflineStatusBadge";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Bus, Navigation, MapPin, Loader2, AlertCircle, LocateFixed, Satellite } from "lucide-react";

const TRACK_INTERVAL_MS = 30000;

// Hide commercial POI icons/labels from the streets style for a clean driver view.
function hidePoiLayers(map) {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  style.layers.forEach((layer) => {
    const id = layer.id || "";
    if (id.includes("poi") || id.includes("transit") || id.includes("road-label")) {
      try {
        map.setLayoutProperty(id, "visibility", "none");
      } catch {
        /* some layers can't be toggled */
      }
    }
  });
}

export default function DriverKiosk() {
  const { user } = useAuth();
  const { online, pendingCount } = useOfflineSync();
  const [vehicle, setVehicle] = useState(null);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pos, setPos] = useState(null);
  const watchId = useRef(null);
  const lastPush = useRef(0);
  const mapRef = useRef(null);

  // Load the driver's assigned vehicle + route
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.email) return;
      try {
        const vehicles = await base44.entities.Vehicle.filter({ driver_email: user.email });
        if (cancelled) return;
        const v = vehicles[0];
        if (!v) {
          setError("No vehicle is assigned to your account.");
          setLoading(false);
          return;
        }
        setVehicle(v);
        if (v.route_id) {
          try {
            const r = await base44.entities.Route.get(v.route_id);
            if (!cancelled) setRoute(r);
          } catch {
            /* route may be missing */
          }
        }
        if (v.current_lat != null) {
          setPos({ lat: v.current_lat, lng: v.current_lng });
        }
      } catch {
        if (!cancelled) setError("Couldn't load your vehicle.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  // High-accuracy tracking loop — pushes coordinates every 30s.
  const pushLocation = useCallback(
    async (lat, lng) => {
      if (!vehicle?.id) return;
      try {
        await base44.entities.Vehicle.update(vehicle.id, {
          current_lat: lat,
          current_lng: lng,
          last_location_update: new Date().toISOString(),
          status: "on_trip",
        });
      } catch {
        /* offline — the offline queue isn't needed for updates (idempotent retry on next tick) */
      }
    },
    [vehicle?.id]
  );

  useEffect(() => {
    if (!vehicle?.id || !navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        if (p.coords.accuracy > 500) return; // ignore junk fixes
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        const now = Date.now();
        if (now - lastPush.current >= TRACK_INTERVAL_MS) {
          lastPush.current = now;
          pushLocation(p.coords.latitude, p.coords.longitude);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [vehicle?.id, pushLocation]);

  const nextStop = useMemo(() => {
    if (!route?.stops?.length) return null;
    const ordered = [...route.stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return ordered[0];
  }, [route]);

  const navUrl = nextStop
    ? `https://www.google.com/maps?q=${nextStop.lat},${nextStop.lng}`
    : pos
    ? `https://www.google.com/maps?q=${pos.lat},${pos.lng}`
    : "#";

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{error || "No vehicle assigned."}</p>
        </div>
      </div>
    );
  }

  const gpsStatus = !pos
    ? "searching"
    : pos.accuracy != null && pos.accuracy <= 50
    ? "locked"
    : "low";

  const recenter = () => {
    const map = mapRef.current;
    if (!map || !pos) return;
    map.flyTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
  };

  return (
    <div className="h-screen bg-background flex flex-col">
      <header className="h-12 border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2 font-heading font-semibold text-sm">
          <Bus className="w-4 h-4 text-primary" />
          {vehicle.name}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
              gpsStatus === "locked"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : gpsStatus === "low"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            <Satellite className="w-3 h-3" />
            {gpsStatus === "locked" ? "GPS locked" : gpsStatus === "low" ? "Low signal" : "Searching…"}
          </span>
          <OfflineStatusBadge online={online} pendingCount={pendingCount} />
        </div>
      </header>
      <div className="relative flex-1">
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          initialViewState={{
            longitude: pos?.lng ?? vehicle.current_lng ?? -61.7,
            latitude: pos?.lat ?? vehicle.current_lat ?? 12.05,
            zoom: 15,
          }}
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
          onLoad={(e) => hidePoiLayers(e.target)}
        >
          {vehicle?.trail?.length > 1 && (
            <Source
              id="driver-trail"
              type="geojson"
              data={{
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: vehicle.trail
                    .filter((p) => p.lat != null && p.lng != null)
                    .map((p) => [p.lng, p.lat]),
                },
              }}
            >
              <Layer
                id="driver-trail-line"
                type="line"
                paint={{ "line-color": "#38bdf8", "line-width": 4, "line-opacity": 0.5 }}
              />
            </Source>
          )}
          {pos && (
            <Marker longitude={pos.lng} latitude={pos.lat} anchor="bottom">
              <div className="w-10 h-10 rounded-full bg-primary border-2 border-white shadow-lg grid place-items-center">
                <Bus className="w-6 h-6 text-primary-foreground" />
              </div>
            </Marker>
          )}
          {nextStop && (
            <Marker longitude={nextStop.lng} latitude={nextStop.lat} anchor="center">
              <div className="w-5 h-5 rounded-full bg-emerald-500 border-2 border-white shadow" />
            </Marker>
          )}
        </Map>

        <div className="absolute top-4 left-4 right-4 z-10">
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl px-5 py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Next pickup destination
            </div>
            <div className="text-lg font-semibold">
              {nextStop?.name || "Awaiting route assignment"}
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-md">
          <Button asChild size="lg" className="w-full h-14 text-base bg-emerald-500 hover:bg-emerald-600 text-white">
            <a href={navUrl} target="_blank" rel="noreferrer">
              <Navigation className="w-5 h-5 mr-2" />
              Open turn-by-turn navigation
            </a>
          </Button>
        </div>

        <button
          type="button"
          onClick={recenter}
          className="absolute right-4 bottom-24 z-10 w-11 h-11 rounded-full bg-card/95 border border-border shadow-lg grid place-items-center hover:bg-accent transition-colors"
          title="Recenter on bus"
        >
          <LocateFixed className="w-5 h-5 text-primary" />
        </button>
      </div>
    </div>
  );
}