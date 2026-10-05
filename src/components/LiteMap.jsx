import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed } from "lucide-react";
import { MAPBOX_TOKEN, mapAccentFor } from "@/lib/mapbox";
import { useIsDark } from "@/lib/useTheme";
import { statusColor } from "@/lib/vehicleStatus";
import { fetchDrivingRoute } from "@/lib/geo";

// Basic map for devices that can't run the full map engine (no WebGL 2).
// Same Mapbox street / dark styles, served as plain images through Leaflet,
// which works on practically any browser. Takes the same props as MapboxMap
// plus a few the driver's Navigate screen uses.

const tileUrl = (isDark) =>
  `https://api.mapbox.com/styles/v1/mapbox/${isDark ? "dark-v11" : "streets-v12"}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;

function busIcon(color, { size = 34, heading = null, label = "" } = {}) {
  const arrow = heading == null ? "" :
    `<div style="position:absolute;inset:-9px;transform:rotate(${heading}deg)"><div style="margin:0 auto;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid ${color}"></div></div>`;
  const html = `
    <div style="position:relative;width:${size}px;height:${size}px">
      ${arrow}
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:#0B0B0D;border:3px solid ${color};display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.45)">
        <img src="/images/transit-bus-3d.webp" alt="" style="width:${size+12}px;height:${size+12}px;max-width:none;object-fit:contain;filter:drop-shadow(0 2px 3px #0008)" />
      </div>
      ${label ? `<div style="position:absolute;top:${size + 2}px;left:50%;transform:translateX(-50%);white-space:nowrap;font:600 11px/1.2 system-ui,sans-serif;color:#fff;background:rgba(11,11,13,.8);padding:2px 6px;border-radius:999px">${label.replace(/[<>&"]/g, "")}</div>` : ""}
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

// Fits every point once, when the map first has something to show.
function FitOnce({ points, skip }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || skip || !points.length) return;
    done.current = true;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
  }, [points, skip, map]);
  return null;
}

// Keeps the camera on the user while following; a drag turns following off.
function Follow({ target, following, onDragStart }) {
  const map = useMap();
  const first = useRef(true);
  useMapEvents({ dragstart: () => onDragStart?.() });
  useEffect(() => {
    if (!following || !target) return;
    if (first.current) { first.current = false; map.setView([target.lat, target.lng], Math.max(map.getZoom(), 15)); }
    else map.panTo([target.lat, target.lng], { animate: true, duration: 0.8 });
  }, [following, target?.lat, target?.lng, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function LocateOnce({ target, skip }) {
  const map = useMap();
  const done = useRef(false);
  useMapEvents({ dragstart: () => { done.current = true; } });
  useEffect(() => {
    if (done.current || skip || !target) return;
    done.current = true;
    map.setView([target.lat, target.lng], 15);
  }, [target, skip, map]);
  return null;
}

// Leaflet measures its box once; re-measure if the box was hidden (e.g. an
// inactive tab) when the map was created.
function SizeWatch() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

// Fly to a vehicle picked outside the map (see focusVehicleId).
function FocusOn({ target, nonce }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.current_lat, target.current_lng], Math.max(map.getZoom(), 16), { duration: 0.9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, nonce]);
  return null;
}

export default function LiteMap({
  vehicles = [],
  stops = [],
  userLocation = null,
  center = null,
  className = "",
  height = "45vh",
  interactive = true,
  followUser = false,
  pins = [],
  // Extra lines [{ coords: [[lng, lat], …], color, width, opacity, dashed }]
  lines = [],
  showUserDot = true,
  showRecenter = true,
  onDragStart,
  fill = false, // fill the parent box instead of using `height`
  focusVehicleId = null,
  focusKey = 0,
}) {
  const isDark = useIsDark();
  const accent = mapAccentFor(isDark);
  const [following, setFollowing] = useState(followUser);
  useEffect(() => { setFollowing(followUser); }, [followUser]);

  const liveVehicles = vehicles.filter((v) => v.current_lat != null && v.current_lng != null);
  const stopPts = (stops || []).filter((s) => s.lat != null && s.lng != null);

  // Road-following route through the stops, like the full map.
  const stopSig = stopPts.map((s) => `${s.lng},${s.lat}`).join(";");
  const [routeGeom, setRouteGeom] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (stopPts.length < 2) { setRouteGeom(null); return undefined; }
    fetchDrivingRoute(stopPts.map((s) => ({ lat: s.lat, lng: s.lng }))).then((res) => { if (!cancelled) setRouteGeom(res?.geometry || null); });
    return () => { cancelled = true; };
  }, [stopSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const routeLine = (routeGeom || stopPts.map((s) => [s.lng, s.lat])).map(([lng, lat]) => [lat, lng]);

  const fitPoints = useMemo(() => [
    ...liveVehicles.map((v) => [v.current_lat, v.current_lng]),
    ...stopPts.map((s) => [s.lat, s.lng]),
    ...(pins || []).filter((p) => p.lat != null && p.lng != null).map((p) => [p.lat, p.lng]),
    ...(userLocation ? [[userLocation.lat, userLocation.lng]] : []),
  ], [liveVehicles.length, stopSig, pins?.length, !!userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = center ? [center[1], center[0]] : userLocation ? [userLocation.lat, userLocation.lng] : fitPoints[0] || [12.05, -61.7];

  return (
    <div className={`relative isolate ${className}`} style={fill ? { height: "100%" } : { height }}>
      <MapContainer
        center={start}
        zoom={center || userLocation ? 15 : 13}
        style={{ width: "100%", height: "100%", background: isDark ? "#0b0b0d" : "#e5e7eb" }}
        zoomControl={interactive}
        dragging={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        attributionControl={false}
      >
        <TileLayer key={isDark ? "dark" : "light"} url={tileUrl(isDark)} tileSize={512} zoomOffset={-1} maxZoom={19} />
        <SizeWatch />
        <FitOnce points={fitPoints} skip={!!center || !!userLocation || followUser || !!focusVehicleId} />
        <LocateOnce target={userLocation} skip={!!center || followUser || !!focusVehicleId} />
        <FocusOn target={liveVehicles.find((v) => v.id === focusVehicleId) || null} nonce={focusKey} />
        {followUser && (
          <Follow target={userLocation} following={following} onDragStart={() => { setFollowing(false); onDragStart?.(); }} />
        )}
        {routeLine.length > 1 && (
          <Polyline positions={routeLine} pathOptions={{ color: accent, weight: 4, opacity: routeGeom ? 0.9 : 0.7, dashArray: routeGeom ? null : "6 6" }} />
        )}
        {lines.filter((l) => l.coords?.length > 1).map((l, i) => (
          <Polyline key={`line-${i}`} positions={l.coords.map(([lng, lat]) => [lat, lng])} pathOptions={{ color: l.color || accent, weight: l.width || 4, opacity: l.opacity ?? 0.85, dashArray: l.dashed ? "6 6" : null }} />
        ))}
        {liveVehicles.filter((v) => v.trail?.length > 1).map((v) => (
          <Polyline key={`trail-${v.id}`} positions={v.trail.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lat, p.lng])} pathOptions={{ color: accent, weight: 3, opacity: 0.4 }} />
        ))}
        {(pins || []).filter((p) => p.lat != null && p.lng != null).map((p, i) => (
          <CircleMarker key={`pin-${i}`} center={[p.lat, p.lng]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: p.color || "#34d399", fillOpacity: 1 }} />
        ))}
        {stopPts.map((s, i) => (
          <CircleMarker key={`stop-${i}`} center={[s.lat, s.lng]} radius={8} pathOptions={{ color: "#0B0B0D", weight: 2.5, fillColor: s.color || accent, fillOpacity: 1 }}>
            {s.name && <Popup>{s.name}</Popup>}
          </CircleMarker>
        ))}
        {liveVehicles.map((v) => (
          <Marker
            key={`v-${v.id}`}
            position={[v.current_lat, v.current_lng]}
            icon={busIcon(v.marker_color || statusColor(v.status), { size: v.marker_size || 46, heading: v.marker_heading ?? null, label: v.marker_label ?? v.name })}
          >
            {v.name && (
              <Popup>
                <strong>{v.name}</strong>
                {v.status ? <div>{String(v.status).replace(/_/g, " ")}</div> : null}
              </Popup>
            )}
          </Marker>
        ))}
        {userLocation && showUserDot && (
          <CircleMarker center={[userLocation.lat, userLocation.lng]} radius={8} pathOptions={{ color: "#0B0B0D", weight: 3, fillColor: accent, fillOpacity: 1 }} />
        )}
      </MapContainer>
      {showRecenter && userLocation && followUser && !following && (
        <button
          type="button"
          onClick={() => setFollowing(true)}
          className="absolute left-3 bottom-3 z-[500] w-11 h-11 rounded-full border shadow-md grid place-items-center bg-primary border-primary animate-pulse"
          title="Tap to re-center and follow"
          aria-label="Re-center on my position"
        >
          <LocateFixed className="w-5 h-5 text-primary-foreground" />
        </button>
      )}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-[500] px-2 py-0.5 rounded-full bg-black/60 text-caption text-white/85 pointer-events-none">
        Basic map
      </div>
    </div>
  );
}
