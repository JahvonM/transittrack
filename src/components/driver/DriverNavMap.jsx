import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl";
import { MAPBOX_TOKEN, GPS_INTERVAL_MS } from "@/lib/mapbox";
import { Button } from "@/components/ui/button";
import OfflineStatusBadge from "@/components/OfflineStatusBadge";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { formatEta } from "@/lib/geo";
import useDrivingEta from "@/hooks/useDrivingEta";
import { Bus, Navigation, MapPin, LocateFixed, Satellite } from "lucide-react";

function hidePoiLayers(map) {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  style.layers.forEach((layer) => {
    const id = layer.id || "";
    if (id.includes("poi") || id.includes("transit") || id.includes("road-label")) {
      try { map.setLayoutProperty(id, "visibility", "none"); } catch { /* some layers can't be toggled */ }
    }
  });
}

export default function DriverNavMap({ session, invoke }) {
  const { online, pendingCount } = useOfflineSync();
  const [route, setRoute] = useState(session?.route || null);
  const [pos, setPos] = useState(
    session?.vehicle?.current_lat != null ? { lat: session.vehicle.current_lat, lng: session.vehicle.current_lng } : null
  );
  const [liveVehicle, setLiveVehicle] = useState(session?.vehicle || null);
  const watchId = useRef(null);
  const lastPush = useRef(0);
  const mapRef = useRef(null);

  const vehicle = session?.vehicle || liveVehicle;
  const vehicleId = vehicle?.id;

  useEffect(() => { if (session?.route) setRoute(session.route); }, [session?.route]);
  useEffect(() => { if (session?.vehicle) setLiveVehicle(session.vehicle); }, [session?.vehicle]);

  const pushLocation = useCallback(async (lat, lng) => {
    if (!vehicleId) return;
    try { await invoke("update_location", { lat, lng, status: "on_trip" }); } catch { /* offline — idempotent retry */ }
  }, [vehicleId, invoke]);

  useEffect(() => {
    if (!vehicleId || !navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        if (p.coords.accuracy != null && p.coords.accuracy > 100) return;
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        const now = Date.now();
        if (now - lastPush.current >= GPS_INTERVAL_MS) { lastPush.current = now; pushLocation(p.coords.latitude, p.coords.longitude); }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); };
  }, [vehicleId, pushLocation]);

  const nextStop = useMemo(() => {
    if (!route?.stops?.length) return null;
    const ordered = [...route.stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return ordered[0];
  }, [route]);

  const navUrl = nextStop ? `https://www.google.com/maps?q=${nextStop.lat},${nextStop.lng}` : pos ? `https://www.google.com/maps?q=${pos.lat},${pos.lng}` : "#";
  const gpsStatus = !pos ? "searching" : pos.accuracy != null && pos.accuracy <= 50 ? "locked" : "low";
  const recenter = () => { const map = mapRef.current; if (!map || !pos) return; map.flyTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 }); };
  const trail = liveVehicle?.trail || vehicle?.trail || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 font-heading font-semibold text-sm">
          <Bus className="w-4 h-4 text-primary" /> {vehicle?.name}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
            gpsStatus === "locked" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : gpsStatus === "low" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-muted text-muted-foreground border-border"
          }`}>
            <Satellite className="w-3 h-3" />
            {gpsStatus === "locked" ? "GPS locked" : gpsStatus === "low" ? "Low signal" : "Searching…"}
          </span>
          <OfflineStatusBadge online={online} pendingCount={pendingCount} />
        </div>
      </div>
      <div className="relative rounded-2xl overflow-hidden border h-[72vh]">
        <Map
          ref={mapRef} mapboxAccessToken={MAPBOX_TOKEN} mapStyle="mapbox://styles/mapbox/streets-v12"
          initialViewState={{ longitude: pos?.lng ?? vehicle?.current_lng ?? -61.7, latitude: pos?.lat ?? vehicle?.current_lat ?? 12.05, zoom: 15 }}
          style={{ width: "100%", height: "100%" }} attributionControl={false}
          onLoad={(e) => hidePoiLayers(e.target)}
        >
          {trail.length > 1 && (
            <Source id="driver-trail" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: trail.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lng, p.lat]) } }}>
              <Layer id="driver-trail-line" type="line" paint={{ "line-color": "#38bdf8", "line-width": 4, "line-opacity": 0.5 }} />
            </Source>
          )}
          {pos && (
            <Marker longitude={pos.lng} latitude={pos.lat} anchor="bottom">
              <div className="w-10 h-10 rounded-full bg-primary border-2 border-white shadow-lg grid place-items-center"><Bus className="w-6 h-6 text-primary-foreground" /></div>
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><MapPin className="w-3.5 h-3.5 text-primary" /> Next pickup destination</div>
            <div className="text-lg font-semibold">{nextStop?.name || "Awaiting route assignment"}</div>
          </div>
        </div>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-md">
          <Button asChild size="lg" className="w-full h-14 text-base bg-emerald-500 hover:bg-emerald-600 text-white">
            <a href={navUrl} target="_blank" rel="noreferrer"><Navigation className="w-5 h-5 mr-2" /> Open turn-by-turn navigation</a>
          </Button>
        </div>
        <button type="button" onClick={recenter} className="absolute right-4 bottom-24 z-10 w-11 h-11 rounded-full bg-card/95 border border-border shadow-lg grid place-items-center hover:bg-accent transition-colors" title="Recenter on bus">
          <LocateFixed className="w-5 h-5 text-primary" />
        </button>
      </div>
    </div>
  );
}