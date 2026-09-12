import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import mapboxgl from "mapbox-gl";
import Map, { Marker, Source, Layer, Popup, NavigationControl } from "react-map-gl";
import { MAPBOX_TOKEN, MAPBOX_STYLE } from "@/lib/mapbox";
import { Bus, LocateFixed, Maximize2, Minimize2, Satellite, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Image } from "@/components/ui/image";
import BusDistance from "@/components/BusDistance";
import VehicleMarker from "@/components/VehicleMarker";
import AccuracyHalo from "@/components/AccuracyHalo";
import { fetchDrivingRoute } from "@/lib/geo";
import { statusColor } from "@/lib/vehicleStatus";

// Re-exported for backwards compatibility — the canonical definition now lives
// in lib/vehicleStatus so VehicleMarker can use it without importing this file.
export { statusColor };

const VEHICLE_ICON = (type) =>
  type === "taxi" ? "🚕" : "🚌";

// Hides busy default-style clutter (POI icons, transit icons, small road labels)
// so the map reads cleaner — the routes/vehicles/stops stay the focus.
function declutterStyle(map) {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  style.layers.forEach((layer) => {
    const id = layer.id || "";
    if (id.includes("poi") || id.includes("transit") || id.includes("road-label")) {
      try { map.setLayoutProperty(id, "visibility", "none"); } catch { /* some layers can't be toggled */ }
    }
  });
}

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
  height = "45vh",
  interactive = true,
}) {
  const mapRef = useRef(null);
  const hasFitted = useRef(false);
  const hasUserCentered = useRef(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  const currentUserLocation = userLocation;

  // Build the full point list for auto-fit bounds
  const allPoints = [
    ...vehicles
      .filter((v) => v.current_lat != null)
      .map((v) => ({ lng: v.current_lng, lat: v.current_lat, color: statusColor(v.status), label: v.name })),
    ...(stops || [])
      .filter((s) => s.lat != null)
      .map((s) => ({ lng: s.lng, lat: s.lat, color: "#0ea5e9", label: s.name })),
  ];
  if (currentUserLocation) allPoints.push({ lng: currentUserLocation.lng, lat: currentUserLocation.lat, color: "#34d399", label: "You are here" });

  // Re-fit the map to all visible points (vehicles, stops, user).
  const fitToBounds = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [...allPoints];
    if (pts.length === 0) return;
    const bounds = pts.reduce(
      (b, p) => b.extend([p.lng, p.lat]),
      new mapboxgl.LngLatBounds([pts[0].lng, pts[0].lat], [pts[0].lng, pts[0].lat])
    );
    map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
  };

  // Fit to bounds only once on first load — re-fitting on every GPS tick causes jitter.
  useEffect(() => {
    if (!mapLoaded || center || hasFitted.current || hasUserCentered.current) return;
    if (allPoints.length === 0) return;
    fitToBounds();
    hasFitted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, allPoints.length, center]);

  // Once the user's position is known, fly to it so the map centers on them.
  useEffect(() => {
    if (!mapLoaded || !currentUserLocation || hasUserCentered.current) return;
    const map = mapRef.current;
    if (!map) return;
    hasUserCentered.current = true;
    map.flyTo({ center: [currentUserLocation.lng, currentUserLocation.lat], zoom: 15, duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, currentUserLocation]);

  // Recenter on the user's live location.
  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const loc = currentUserLocation;
    if (!loc) return;
    map.flyTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
  };

  const initViewport = center
    ? { longitude: center[0], latitude: center[1], zoom: 14 }
    : { longitude: -61.7, latitude: 12.05, zoom: 11 };

  // Route polyline from stops (if any) — straight-line fallback, used until/unless
  // the actual driving route (following roads) below is available.
  const routeCoords =
    stops && stops.length > 1 ? stops.filter((s) => s.lat != null).map((s) => [s.lng, s.lat]) : [];

  // Fetch the real driving route through the stops (roads, not a straight line).
  // Keyed on a stable signature so it only refetches when the stops actually change.
  const routeStopsSignature = routeCoords.map((c) => c.join(",")).join(";");
  const [drivingRouteGeom, setDrivingRouteGeom] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (routeCoords.length < 2) {
      setDrivingRouteGeom(null);
      return;
    }
    fetchDrivingRoute(routeCoords.map(([lng, lat]) => ({ lat, lng }))).then((res) => {
      if (!cancelled) setDrivingRouteGeom(res?.geometry || null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeStopsSignature]);

  const routeLineCoords = drivingRouteGeom || routeCoords;
  const routeFollowsRoads = Boolean(drivingRouteGeom);

  // Per-vehicle trails
  const vehicleTrails = vehicles
    .filter((v) => v.trail && v.trail.length > 1)
    .map((v) => ({
      id: `trail-${v.id}`,
      coords: v.trail.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lng, p.lat]),
    }))
    .filter((t) => t.coords.length > 1);

  const mapContent = (
    <>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={isSatellite ? "mapbox://styles/mapbox/satellite-streets-v12" : MAPBOX_STYLE}
        initialViewState={initViewport}
        style={{ width: "100%", height: "100%" }}
        interactive={interactive}
        attributionControl={false}
        onLoad={() => setMapLoaded(true)}
      >
        {/* Route polyline — follows actual roads once the driving route loads;
            falls back to a dashed straight line between stops until then / on failure */}
        {routeLineCoords.length > 1 && (
          <Source id="route" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: routeLineCoords } }}>
            <Layer
              id="route-line"
              type="line"
              paint={
                routeFollowsRoads
                  ? { "line-color": "#0ea5e9", "line-width": 4, "line-opacity": 0.85 }
                  : { "line-color": "#0ea5e9", "line-width": 3, "line-opacity": 0.7, "line-dasharray": [2, 2] }
              }
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

        {/* Vehicle markers — tappable little bus icons, gliding smoothly between GPS pings */}
        {vehicles
          .filter((v) => v.current_lat != null)
          .map((v) => (
            <VehicleMarker key={`v-${v.id}`} vehicle={v} onSelect={setSelectedVehicle} />
          ))}

        {/* (selected vehicle panel rendered as overlay below to keep the map visible) */}

        {/* User location — accuracy halo + pulsing blue dot */}
        {currentUserLocation && (
          <>
            {currentUserLocation.accuracy && (
              <Source
                id="user-accuracy"
                type="geojson"
                data={{
                  type: "Feature",
                  geometry: { type: "Point", coordinates: [currentUserLocation.lng, currentUserLocation.lat] },
                }}
              >
                <Layer
                  id="user-accuracy-circle"
                  type="circle"
                  paint={{
                    "circle-radius": currentUserLocation.accuracy,
                    "circle-color": "#3b82f6",
                    "circle-opacity": 0.12,
                    "circle-stroke-width": 1,
                    "circle-stroke-color": "#3b82f6",
                    "circle-stroke-opacity": 0.3,
                    "circle-pitch-alignment": "map",
                  }}
                />
              </Source>
            )}
            <Marker key="user-loc" longitude={currentUserLocation.lng} latitude={currentUserLocation.lat} anchor="center">
              <div className="relative">
                <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg" />
                <div className="absolute inset-0 w-4 h-4 rounded-full bg-blue-500 animate-ping opacity-40" />
              </div>
            </Marker>
          </>
        )}

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
              <BusDistance vehicle={selectedVehicle} userLocation={currentUserLocation} />
            </div>
          </div>
        </div>
      )}

      {/* Satellite / street view toggle */}
      <button
        type="button"
        onClick={() => setIsSatellite((s) => !s)}
        className={`absolute left-3 bottom-16 z-10 w-10 h-10 rounded-full border shadow-md grid place-items-center transition-colors ${isSatellite ? "bg-primary text-primary-foreground border-primary" : "bg-background/90 border-border hover:bg-accent"}`}
        title={isSatellite ? "Switch to street view" : "Switch to satellite view"}
      >
        <Satellite className="w-5 h-5" />
      </button>

      {/* Fullscreen toggle */}
      <button
        type="button"
        onClick={() => setIsFullscreen((f) => !f)}
        className="absolute right-3 top-3 z-10 w-10 h-10 rounded-full bg-background/90 border border-border shadow-md grid place-items-center hover:bg-accent transition-colors"
        title={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
      >
        {isFullscreen ? <Minimize2 className="w-5 h-5 text-primary" /> : <Maximize2 className="w-5 h-5 text-primary" />}
      </button>

      {/* Recenter on my location */}
      <button
        type="button"
        onClick={recenter}
        className="absolute left-3 bottom-3 z-10 w-10 h-10 rounded-full bg-background/90 border border-border shadow-md grid place-items-center hover:bg-accent transition-colors"
        title="Recenter on my location"
      >
        <LocateFixed className="w-5 h-5 text-primary" />
      </button>
    </>
  );

  // Fullscreen renders via portal at body level to escape parent overflow/transform clipping
  if (isFullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-background" style={{ height: "100vh" }}>
        {mapContent}
      </div>,
      document.body
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {mapContent}
    </div>
  );
}