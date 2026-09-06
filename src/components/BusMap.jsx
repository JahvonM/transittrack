import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import BusDistance from "@/components/BusDistance";

const DEFAULT_CENTER = [12.05, -61.75];

const vehicleIcon = (type) =>
  L.divIcon({
    html: `<div style="font-size:24px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))">${type === "taxi" ? "🚕" : "🚌"}</div>`,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

const stopIcon = L.divIcon({
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#0ea5e9;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const userIcon = L.divIcon({
  html: "📍",
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function FitBounds({ stops, vehicles, userLocation, center }) {
  const map = useMap();
  useEffect(() => {
    const pts = [];
    if (userLocation) pts.push([userLocation.lat, userLocation.lng]);
    stops?.forEach((s) => pts.push([s.lat, s.lng]));
    vehicles?.forEach((v) => v.current_lat != null && pts.push([v.current_lat, v.current_lng]));
    if (pts.length === 0 && center) map.setView(center, 13);
    else if (pts.length === 1) map.setView(pts[0], 14);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
  }, [stops, vehicles, userLocation, center]);
  return null;
}

export default function BusMap({
  vehicles = [],
  stops = [],
  userLocation,
  center = DEFAULT_CENTER,
}) {
  const poly = stops?.length ? stops.map((s) => [s.lat, s.lng]) : [];
  return (
    <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="&copy; Esri, Maxar, Earthstar Geographics"
        maxZoom={19}
      />
      <FitBounds stops={stops} vehicles={vehicles} userLocation={userLocation} center={center} />
      {vehicles.map((v) => {
        const tr = (v.trail || [])
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => [p.lat, p.lng]);
        return tr.length > 1 ? (
          <Polyline
            key={`trail-${v.id}`}
            positions={tr}
            pathOptions={{ color: "#38bdf8", weight: 3, opacity: 0.55 }}
          />
        ) : null;
      })}
      {poly.length > 1 && (
        <Polyline positions={poly} pathOptions={{ color: "#0ea5e9", weight: 3, opacity: 0.7, dashArray: "6 6" }} />
      )}
      {stops?.map((s, i) => (
        <Marker key={`s-${i}`} position={[s.lat, s.lng]} icon={stopIcon}>
          <Popup>
            <b>{s.name}</b>
          </Popup>
        </Marker>
      ))}
      {vehicles.map((v) =>
        v.current_lat != null ? (
          <Marker key={v.id} position={[v.current_lat, v.current_lng]} icon={vehicleIcon(v.type)}>
            <Popup>
              <b>{v.name}</b>
              <br />
              {v.company_name}
              <br />
              {v.type} · {v.status === "on_trip" ? "On trip" : "Idle"}
              <BusDistance vehicle={v} userLocation={userLocation} />
            </Popup>
          </Marker>
        ) : null
      )}
      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
          <Popup>You are here</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}