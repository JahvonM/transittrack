import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import Map, { Marker, Source, Layer } from "react-map-gl";
import { MAPBOX_TOKEN, MAPBOX_STYLE } from "@/lib/mapbox";

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

/**
 * Reusable Mapbox streets map.
 * props:
 *  - vehicles: [{ current_lat, current_lng, status, name, ... }]
 *  - trail: [{ lat, lng }] (optional) — draws a polyline
 *  - pins: [{ lat, lng, color, label }] (optional) — extra markers
 *  - center: [lng, lat] | null  (auto-fit if omitted)
 *  - follow: vehicle id to keep centered
 *  - className, height
 */
export default function MapboxMap({
  vehicles = [],
  trail = [],
  pins = [],
  center = null,
  className = "",
  height = "50vh",
  interactive = true,
}) {
  const mapRef = useRef(null);

  const allPoints = [
    ...vehicles
      .filter((v) => v.current_lat != null)
      .map((v) => ({ lng: v.current_lng, lat: v.current_lat, color: statusColor(v.status), label: v.name })),
    ...pins.filter((p) => p.lat != null).map((p) => ({ lng: p.lng, lat: p.lat, color: p.color || "#34d399", label: p.label })),
  ];

  useEffect(() => {
    const map = mapRef.current;
    if (!map || center) return;
    if (allPoints.length === 0) return;
    const bounds = allPoints.reduce(
      (b, p) => b.extend([p.lng, p.lat]),
      new mapboxgl.LngLatBounds([allPoints[0].lng, allPoints[0].lat], [allPoints[0].lng, allPoints[0].lat])
    );
    map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
  }, [allPoints.length, center]);

  const initViewport = center
    ? { longitude: center[0], latitude: center[1], zoom: 14 }
    : { longitude: -61.7, latitude: 12.05, zoom: 11 };

  const trailCoords =
    trail.length > 0 ? trail.map((t) => [t.lng, t.lat]) : [];

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
        {trailCoords.length > 1 && (
          <Source id="trail" type="geojson" data={{ type: "Feature", geometry: { type: "LineString", coordinates: trailCoords } }}>
            <Layer
              id="trail-line"
              type="line"
              paint={{ "line-color": "#38bdf8", "line-width": 3, "line-opacity": 0.7 }}
            />
          </Source>
        )}

        {allPoints.map((p, i) => (
          <Marker key={i} longitude={p.lng} latitude={p.lat} anchor="bottom">
            <div
              className="w-5 h-5 rounded-full border-2 border-white shadow-lg"
              style={{ backgroundColor: p.color }}
              title={p.label}
            />
          </Marker>
        ))}
      </Map>
    </div>
  );
}