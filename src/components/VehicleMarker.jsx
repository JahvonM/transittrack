import React from "react";
import { Marker } from "react-map-gl";
import { Bus, Car } from "lucide-react";
import { statusColor } from "@/lib/vehicleStatus";
import useSmoothPosition from "@/hooks/useSmoothPosition";

/**
 * A single vehicle pin that glides smoothly to each new GPS position instead
 * of snapping. A dark rounded tile (vehicle photo if we have one, otherwise
 * an icon) whose border and icon carry the live status color, with a soft
 * glow while on a trip and a small tail so it reads as a placed pin.
 */
export default function VehicleMarker({ vehicle, onSelect }) {
  const pos = useSmoothPosition(vehicle.current_lat, vehicle.current_lng);
  if (!pos) return null;

  const ring = statusColor(vehicle.status);
  const Icon = vehicle.type === "taxi" ? Car : Bus;
  const active = vehicle.status === "on_trip";

  return (
    <Marker longitude={pos.lng} latitude={pos.lat} anchor="bottom">
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(vehicle); }}
        className="flex flex-col items-center focus:outline-none"
        title={`${vehicle.name} · ${vehicle.company_name || ""} · ${vehicle.status}`}
        aria-label={`${vehicle.name}, ${vehicle.status}`}
      >
        <div
          className="w-10 h-10 rounded-xl grid place-items-center shrink-0 overflow-hidden"
          style={{
            backgroundColor: "#1C1C1F",
            border: `2px solid ${ring}`,
            boxShadow: active
              ? `0 0 0 5px ${ring}2E, 0 6px 14px rgba(0,0,0,0.55)`
              : "0 6px 14px rgba(0,0,0,0.55)",
          }}
        >
          {vehicle.image_url ? (
            <img src={vehicle.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Icon style={{ width: 20, height: 20, color: ring }} />
          )}
        </div>
        <div
          className="w-3 h-2 -mt-px"
          style={{ backgroundColor: ring, clipPath: "polygon(50% 100%, 0 0, 100% 0)" }}
        />
      </button>
    </Marker>
  );
}
