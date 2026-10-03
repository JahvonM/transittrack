import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAPBOX_TOKEN, mapAccentFor } from "@/lib/mapbox";
import { useIsDark } from "@/lib/useTheme";
import { stopLabel } from "@/components/replay/ReplayMarkers";

// Basic-map version of the trip replay map, for tablets without WebGL 2.
const tileUrl = (isDark) =>
  `https://api.mapbox.com/styles/v1/mapbox/${isDark ? "dark-v11" : "streets-v12"}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;

const ll = (line) => line.map(([lng, lat]) => [lat, lng]);

const iconCache = new Map();
function busIcon(color, rawHeading) {
  // Rounded so the icon is rebuilt only when the bus actually turns.
  const heading = rawHeading == null ? null : Math.round(rawHeading / 10) * 10;
  const key = `${color}|${heading}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const arrow = heading == null ? "" :
    `<div style="position:absolute;inset:-10px;transform:rotate(${heading}deg)"><div style="margin:0 auto;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid ${color}"></div></div>`;
  const icon = L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="position:relative;width:36px;height:36px">${arrow}<div style="width:36px;height:36px;border-radius:50%;background:#0B0B0D;border:3px solid ${color};box-shadow:0 2px 8px rgba(0,0,0,.45)"></div></div>`,
  });
  iconCache.set(key, icon);
  return icon;
}

const stopIcon = L.divIcon({
  className: "",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#f59e0b;border:2px solid #fff;display:grid;place-items:center;font:700 10px system-ui;color:#000">P</div>`,
});

function Fit({ line, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!line?.length) return;
    if (line.length === 1) map.setView([line[0][1], line[0][0]], 15);
    else map.fitBounds(ll(line), { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

function Follow({ position, follow }) {
  const map = useMap();
  useEffect(() => {
    if (follow && position) map.panTo([position.lat, position.lng], { animate: false });
  }, [follow, position, map]);
  return null;
}

export default function ReplayMapLite({ line, traveled, position, stops = [], follow, fitKey }) {
  const isDark = useIsDark();
  const accent = mapAccentFor(isDark);
  const start = line?.[0];
  return (
    <MapContainer center={start ? [start[1], start[0]] : [0, 0]} zoom={13} style={{ width: "100%", height: "100%" }} attributionControl={false}>
      <TileLayer key={isDark ? "dark" : "light"} url={tileUrl(isDark)} tileSize={512} zoomOffset={-1} maxZoom={19} />
      <Fit line={line} fitKey={fitKey} />
      <Follow position={position} follow={follow} />
      {line?.length > 1 && <Polyline positions={ll(line)} pathOptions={{ color: isDark ? "#94a3b8" : "#64748b", weight: 4, opacity: 0.45 }} />}
      {traveled?.length > 1 && <Polyline positions={ll(traveled)} pathOptions={{ color: accent, weight: 5 }} />}
      {stops.map((s, i) => <Marker key={`stop-${i}`} position={[s.lat, s.lng]} icon={stopIcon} title={stopLabel(s)} />)}
      {position && <Marker position={[position.lat, position.lng]} icon={busIcon(accent, position.heading)} />}
    </MapContainer>
  );
}
