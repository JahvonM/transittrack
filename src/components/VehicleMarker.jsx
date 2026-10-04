import React from "react";
import { Marker } from "react-map-gl";
import { statusColor } from "@/lib/vehicleStatus";
import useSmoothPosition from "@/hooks/useSmoothPosition";
import MapBusPin, { useBearing } from "@/components/MapBusPin";
import { modelIdFor } from "@/lib/vehicleModels";

/**
 * A single vehicle on the map: a small 3D bus (or taxi) that glides to each
 * new GPS position and turns to face its direction of travel, with a
 * status-coloured glow that pulses while it's on a trip.
 */
export default function VehicleMarker({ vehicle, onSelect, cameraBearing = 0 }) {
  const pos = useSmoothPosition(vehicle.current_lat, vehicle.current_lng);
  const heading = useBearing(vehicle.current_lat, vehicle.current_lng, vehicle.heading);
  if (!pos) return null;

  const ring = statusColor(vehicle.status);
  const driving = vehicle.status === "on_trip" || vehicle.status === "speeding";
  const alert = vehicle.status === "emergency";

  return (
    <Marker longitude={pos.lng} latitude={pos.lat} anchor="center">
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(vehicle); }}
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
        title={`${vehicle.name} · ${vehicle.company_name || ""} · ${vehicle.status}`}
        aria-label={`${vehicle.name}, ${vehicle.status}`}
      >
        <MapBusPin model={modelIdFor(vehicle)} color={ring} driving={driving} alert={alert} heading={heading - cameraBearing} />
      </button>
    </Marker>
  );
}
