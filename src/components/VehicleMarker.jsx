import React from "react";
import { Marker } from "react-map-gl";
import { Bus } from "lucide-react";
import { statusColor } from "@/lib/vehicleStatus";
import useSmoothPosition from "@/hooks/useSmoothPosition";

/**
 * A single vehicle pin that glides smoothly to each new GPS position instead
 * of snapping. Split into its own component so the animation's frequent
 * re-renders stay local to this marker rather than re-rendering the whole map.
 */
export default function VehicleMarker({ vehicle, onSelect }) {
  const pos = useSmoothPosition(vehicle.current_lat, vehicle.current_lng);
  if (!pos) return null;

  return (
    <Marker longitude={pos.lng} latitude={pos.lat} anchor="bottom">
      <button
        onClick={() => onSelect(vehicle)}
        className="flex flex-col items-center focus:outline-none"
        title={`${vehicle.name} · ${vehicle.company_name || ""} · ${vehicle.status}`}
      >
        <div
          className="w-7 h-7 rounded-full border-2 border-white shadow-md grid place-items-center"
          style={{ backgroundColor: statusColor(vehicle.status) }}
        >
          <Bus className="w-4 h-4 text-white" />
        </div>
      </button>
    </Marker>
  );
}
