import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import Map, { Marker, Source, Layer, Popup, GeolocateControl, NavigationControl } from "react-map-gl";
import { MAPBOX_TOKEN, MAPBOX_STYLE } from "@/lib/mapbox";
import { Bus, LocateFixed, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Image } from "@/components/ui/image";
import BusDistance from "@/components/BusDistance";

// Status -> pin colour
const STATUS_COLORS = {
  on_trip: "#38bdf8",
  idle: "#94a3b8",
  speeding: "#f59e0b",
  emergency: "#ef4444",
  offline: "#64748b",
};

export function statusColor(status) {
  return STATUS_COLORS[status] || "#38bdf8";
}

const VEHICLE_ICON = (type) =>
  type === "taxi" ? "🚕" : "🚌";

/**
 * Reusable Mapbox streets map.
 * props:
 *  - vehicles: [{ current_lat, current_lng, status, name, type, trail }]
 *  - stops: [{ name, lat, lng }] (optional) — route stop markers
 *  - userLocation: { lat, lng } (optional) — user position marker
 *  - center: [lng, lat] | null  (auto-fit if omitted)
 *  - className, height
 */
export default function MapboxMap({
  vehicles = [],
  stops = [],
  userLocation = null,
  center = null,
  className = "",
  height = "50vh",
  interactive = true,
}) {
  const mapRef = useRef(null);
  const hasFitted = useRef(false);
  const geoRef = useRef(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  // Live coordinates from the native GeolocateControl — more accurate than the
  // manual hook and keeps BusDistance/ETA synced with the on-screen blue dot.
  const [liveLocation, setLiveLocation] = useState(null);
  const onGeolocate = (e) => {
    if (e?.coords) {
      setLiveLocation({ lat: e.coords.latitude, lng: e.coords.longitude });
    }
  };

  // Auto-trigger geolocation on mount so the blue dot appears without a manual click
  useEffect(() => {
    if (geoRef.current) geoRef.current.trigger();
  }, []);

  // Build the full point list for auto-fit bounds
  const allPoints = [
    ...vehicles
      .filter((v) => v.current_lat != null)
      .map((v) => ({ lng: v.current_lng, lat: v.current_lat, color: statusColor(v.status), label: v.name })),
    ...(stops || [])
      .filter((s) => s.lat != null)
      .map((s) => ({ lng: s.lng, lat: s.lat, color: "#0ea5e9", label: s.name })),
  ];
  if (userLocation) allPoints.push({ lng: userLocation.lng, lat: userLocation.lat, color: "#34d399", label: "You are here" });

  // Re-fit the map to all visible points (vehicles, stops, user).
  const fitToBounds = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [
      ...allPoints,
      ...(liveLocation ? [{ lng: liveLocation.lng, lat: liveLocation.lat }] : []),
    ];
    if (pts.length === 0) return;
    const bounds = pts.reduce(
      (b, p) => b.extend([p.lng, p.lat]),
      new mapboxgl.LngLatBounds([pts[0].lng, pts[0].lat], [pts[0].lng, pts[0].lat])
    );
    map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
  };

  // Fit to bounds only once on first load — re-fitting on every GPS tick causes jitter.
  useEffect(() => {
    if (center || hasFitted.current || allPoints.length === 0) return;
    fitToBounds();
    hasFitted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPoints.length, center]);

  // Recenter on the user's live location.
  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const loc = liveLocation || userLocation;
    if (!loc) return;
    map.flyTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
  };

  const initViewport = center
    ? { longitude: center[0], latitude: center[1], zoom: 14 }
    : { longitude: -61.7, latitude: 12.05, zoom: 11 };

  // Route polyline from stops (if any)
  const routeCoords =
    stops && stops.length > 1 ? stops.filter((s) => s.lat != null).map((s) => [s.lng, s.lat]) : [];

  // Per-vehicle trails
  const vehicleTrails = vehicles
    .filter((v) => v.trail && v.trail.length > 1)
    .map((v) => ({
      id: `trail-${v.id}`,
      coords: v.trail.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lng, p.lat]),
    }))
    .filter((t) => t.coords.length > 1);

  return (
    <div className={`relative ${className}`} style={{ height }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAPBOX_STYLE}
        initialViewState={initViewport}
        style={{ width: "100%", height: "100%" }}
        interactive={interactive}
        attributionControl={false}
      >
        {/* Route stop polyline */}
        {routeCoords.length > 1 && (
          <Source id="route" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: routeCoords } }}>
            <Layer
              id="route-line"
              type="line"
              paint={{ "line-color": "#0ea5e9", "line-width": 3, "line-opacity": 0.7, "line-dasharray": [2, 2] }}
            />
          </Source>
        )}

        {/* Per-vehicle trails */}
        {vehicleTrails.map((t) => (
          <Source
            key={t.id}
            id={t.id}
            type="geojson"
            data={{ type: "Feature", geometry: { type: "LineString", coordinates: t.coords } }}
          >
            <Layer
              id={`${t.id}-line`}
              type="line"
              paint={{ "line-color": "#38bdf8", "line-width": 3, "line-opacity": 0.55 }}
            />
          </Source>
        ))}

        {/* Route stop markers */}
        {(stops || []).filter((s) => s.lat != null).map((s, i) => (
          <Marker key={`stop-${i}`} longitude={s.lng} latitude={s.lat} anchor="center">
            <div
              className="w-3.5 h-3.5 rounded-full border-2 border-white shadow"
              style={{ backgroundColor: "#0ea5e9" }}
              title={s.name}
            />
          </Marker>
        ))}

        {/* Vehicle markers — tappable little bus icons */}
        {vehicles
          .filter((v) => v.current_lat != null)
          .map((v) => (
            <Marker key={`v-${v.id}`} longitude={v.current_lng} latitude={v.current_lat} anchor="bottom">
              <button
                onClick={() => setSelectedVehicle(v)}
                className="flex flex-col items-center focus:outline-none"
                title={`${v.name} · ${v.company_name || ""} · ${v.status}`}
              >
                <div
                  className="w-7 h-7 rounded-full border-2 border-white shadow-md grid place-items-center"
                  style={{ backgroundColor: statusColor(v.status) }}
                >
                  <Bus className="w-4 h-4 text-white" />
                </div>
              </button>
            </Marker>
          ))}

        {/* (selected vehicle panel rendered as overlay below to keep the map visible) */}

        {/* Native high-accuracy geolocation: blue dot + accuracy halo + tracking */}
        <GeolocateControl
          ref={geoRef}
          positionOptions={{ enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }}
          trackUserLocation
          showUserLocation
          showAccuracyCircle
          onGeolocate={onGeolocate}
        />

        {/* Compass + zoom controls (compass re-orients north) */}
        <NavigationControl position="bottom-right" showCompass visualizePitch />
      </Map>

      {/* Selected vehicle details — floating panel keeps the map fully visible & interactive */}
      {selectedVehicle && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-16 z-20 w-[280px] max-w-[92%]">
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden">
            <div className="relative">
              {selectedVehicle.image_url ? (
                <Image
                  src={selectedVehicle.image_url}
                  alt={selectedVehicle.name}
                  fittingType="fill"
                  className="w-full h-20"
                />
              ) : (
                <div className="w-full h-20 grid place-items-center bg-gradient-to-br from-primary/70 to-primary/20">
                  <Bus className="w-9 h-9 text-white" />
                </div>
              )}
              <button
                type="button"
                onClick={() => setSelectedVehicle(null)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/40 hover:bg-black/60 grid place-items-center text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-3 space-y-2">
              <div>
                <div className="font-semibold text-sm leading-tight">{selectedVehicle.name}</div>
                <div className="text-xs text-muted-foreground">{selectedVehicle.company_name || ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor(selectedVehicle.status) }} />
                  {selectedVehicle.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">{VEHICLE_ICON(selectedVehicle.type)} {selectedVehicle.type}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div>
                  <div className="text-muted-foreground">Plate</div>
                  <div className="font-medium">{selectedVehicle.plate_number || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Driver</div>
                  <div className="font-medium truncate">{selectedVehicle.driver_name || "—"}</div>
                </div>
              </div>
              <BusDistance vehicle={selectedVehicle} userLocation={liveLocation || userLocation} />
            </div>
          </div>
        </div>
      )}

      {/* Recenter on my location */}
      <button
        type="button"
        onClick={recenter}
        className="absolute left-3 bottom-3 z-10 w-10 h-10 rounded-full bg-background/90 border border-border shadow-md grid place-items-center hover:bg-accent transition-colors"
        title="Recenter on my location"
      >
        <LocateFixed className="w-5 h-5 text-primary" />
      </button>
    </div>
  );
}