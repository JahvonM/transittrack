import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl";
import { MAPBOX_TOKEN, MAPBOX_STYLE, GPS_INTERVAL_MS } from "@/lib/mapbox";
import { Button } from "@/components/ui/button";
import OfflineStatusBadge from "@/components/OfflineStatusBadge";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { formatEta, fetchDrivingRoute } from "@/lib/geo";
import useDrivingEta from "@/hooks/useDrivingEta";
import useSmoothPosition from "@/hooks/useSmoothPosition";
import AccuracyHalo from "@/components/AccuracyHalo";
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

  // Real driving distance/ETA to the next stop (falls back to straight-line while loading)
  const nextStopDest = nextStop ? { lat: nextStop.lat, lng: nextStop.lng } : null;
  const { km: nextStopKm, mins: nextStopMins, isDriving: nextStopIsDriving } = useDrivingEta(pos, nextStopDest);

  // Actual road path from the bus's current position to the next stop (not a straight line)
  const [pathToNextStop, setPathToNextStop] = useState(null);
  const pathSignature = pos && nextStop ? `${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}|${nextStop.lat},${nextStop.lng}` : null;

  useEffect(() => {
    let cancelled = false;
    if (!pos || !nextStop) {
      setPathToNextStop(null);
      return;
    }
    fetchDrivingRoute([{ lat: pos.lat, lng: pos.lng }, { lat: nextStop.lat, lng: nextStop.lng }]).then((res) => {
      if (!cancelled) setPathToNextStop(res?.geometry || null);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathSignature]);

  const navUrl = nextStop ? `https://www.google.com/maps?q=${nextStop.lat},${nextStop.lng}` : pos ? `https://www.google.com/maps?q=${pos.lat},${pos.lng}` : "#";
  const gpsStatus = !pos ? "searching" : pos.accuracy != null && pos.accuracy <= 50 ? "locked" : "low";
  const recenter = () => { const map = mapRef.current; if (!map || !pos) return; map.flyTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 }); };
  const trail = liveVehicle?.trail || vehicle?.trail || [];

  // Smoothly glide the bus icon between raw GPS pings instead of snapping
  // (shorter duration than the fleet map since watchPosition updates more often).
  const smoothPos = useSmoothPosition(pos?.lat, pos?.lng, { duration: 1000 });

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
          ref={mapRef} mapboxAccessToken={MAPBOX_TOKEN} mapStyle={MAPBOX_STYLE}
          initialViewState={{ longitude: pos?.lng ?? vehicle?.current_lng ?? -61.7, latitude: pos?.lat ?? vehicle?.current_lat ?? 12.05, zoom: 15 }}
          style={{ width: "100%", height: "100%" }} attributionControl={false}
          onLoad={(e) => hidePoiLayers(e.target)}
        >
          {trail.length > 1 && (
            <Source id="driver-trail" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: trail.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lng, p.lat]) } }}>
              <Layer id="driver-trail-line" type="line" paint={{ "line-color": "#38bdf8", "line-width": 4, "line-opacity": 0.5 }} />
            </Source>
          )}
          {pathToNextStop && (
            <Source id="path-to-next-stop" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: pathToNextStop } }}>
              <Layer id="path-to-next-stop-line" type="line" paint={{ "line-color": "#10b981", "line-width": 5, "line-opacity": 0.85 }} />
            </Source>
          )}
          {smoothPos && (
            <>
              <AccuracyHalo sourceId="driver-accuracy" lat={smoothPos.lat} lng={smoothPos.lng} accuracy={pos?.accuracy} color="#22c55e" />
              <Marker longitude={smoothPos.lng} latitude={smoothPos.lat} anchor="bottom">
                <div className="flex flex-col items-center">
                  <div className="w-11 h-11 rounded-full bg-white grid place-items-center" style={{ border: "3px solid #22c55e", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
                    <Bus className="w-5 h-5" style={{ color: "#22c55e" }} />
                  </div>
                  <div className="w-3 h-3 -mt-[6px]" style={{ backgroundColor: "#22c55e", clipPath: "polygon(50% 100%, 0 0, 100% 0)" }} />
                </div>
              </Marker>
            </>
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
            {nextStop && (
              <div className="text-sm text-muted-foreground mt-0.5">
                {nextStopKm != null ? (nextStopKm < 1 ? `${Math.round(nextStopKm * 1000)} m` : `${nextStopKm.toFixed(1)} km`) : "—"}
                {" · about "}{formatEta(nextStopMins)}
                {nextStopIsDriving ? " · by road" : ""}
              </div>
            )}
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