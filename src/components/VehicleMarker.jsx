import React from "react";
import { Marker } from "react-map-gl";
import { Car } from "lucide-react";
import { statusColor } from "@/lib/vehicleStatus";
import useSmoothPosition from "@/hooks/useSmoothPosition";
import MapBusPin, { useFacingRight } from "@/components/MapBusPin";

/**
 * A single vehicle pin that glides smoothly to each new GPS position instead
 * of snapping. Buses show an animated side-view bus (wheels spinning while on
 * a trip, facing the direction of travel); taxis keep a simple car icon.
 */
export default function VehicleMarker({ vehicle, onSelect }) {
  const pos = useSmoothPosition(vehicle.current_lat, vehicle.current_lng);
  const faceRight = useFacingRight(vehicle.current_lng);
  if (!pos) return null;

  const ring = statusColor(vehicle.status);
  const driving = vehicle.status === "on_trip" || vehicle.status === "speeding";
  const alert = vehicle.status === "emergency";

  return (
    <Marker longitude={pos.lng} latitude={pos.lat} anchor="bottom">
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(vehicle); }}
        className="focus:outline-none"
        title={`${vehicle.name} · ${vehicle.company_name || ""} · ${vehicle.status}`}
        aria-label={`${vehicle.name}, ${vehicle.status}`}
      >
        {vehicle.type === "taxi" ? (
          <div className="flex flex-col items-center">
            <div
              className="w-10 h-10 rounded-xl grid place-items-center"
              style={{ backgroundColor: "#1C1C1F", border: `2px solid ${ring}`, boxShadow: "0 6px 14px rgba(0,0,0,0.55)" }}
            >
              <Car style={{ width: 20, height: 20, color: ring }} />
            </div>
            <div className="w-3 h-2 -mt-px" style={{ backgroundColor: ring, clipPath: "polygon(50% 100%, 0 0, 100% 0)" }} />
          </div>
        ) : (
          <MapBusPin color={ring} driving={driving} alert={alert} faceRight={faceRight} imageUrl={vehicle.image_url} />
        )}
      </button>
    </Marker>
  );
}
