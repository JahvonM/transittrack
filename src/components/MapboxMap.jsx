import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import Map, { Marker, Source, Layer, Popup } from "react-map-gl";
import { MAPBOX_TOKEN, MAPBOX_STYLE } from "@/lib/mapbox";
import { Bus } from "lucide-react";
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
  const [selectedVehicle, setSelectedVehicle] = useState(null);

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

  // Fit to bounds only once on first load — re-fitting on every GPS tick causes jitter.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || center || hasFitted.current) return;
    if (allPoints.length === 0) return;
    const bounds = allPoints.reduce(
      (b, p) => b.extend([p.lng, p.lat]),
      new mapboxgl.LngLatBounds([allPoints[0].lng, allPoints[0].lat], [allPoints[0].lng, allPoints[0].lat])
    );
    map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
    hasFitted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPoints.length, center]);

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

        {/* Selected vehicle details + ask AI */}
        {selectedVehicle && (
          <Popup
            longitude={selectedVehicle.current_lng}
            latitude={selectedVehicle.current_lat}
            anchor="bottom"
            closeButton
            closeOnClick={false}
            onClose={() => setSelectedVehicle(null)}
          >
            <div className="space-y-1 min-w-[180px]">
              <div className="font-semibold text-sm">{selectedVehicle.name}</div>
              <div className="text-xs text-muted-foreground">{selectedVehicle.company_name || ""}</div>
              <div className="text-xs">Plate: {selectedVehicle.plate_number || "—"}</div>
              <div className="text-xs">Driver: {selectedVehicle.driver_name || "—"}</div>
              <div className="text-xs">Status: {selectedVehicle.status}</div>
              <BusDistance vehicle={selectedVehicle} userLocation={userLocation} />
            </div>
          </Popup>
        )}

        {/* User location marker */}
        {userLocation && (
          <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="bottom">
            <div className="text-2xl leading-none" title="You are here">📍</div>
          </Marker>
        )}
      </Map>
    </div>
  );
}