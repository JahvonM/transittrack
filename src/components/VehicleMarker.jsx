import React from "react";
import { Marker } from "react-map-gl";
import { Bus, Car } from "lucide-react";
import { statusColor } from "@/lib/vehicleStatus";
import useSmoothPosition from "@/hooks/useSmoothPosition";

/**
 * A single vehicle pin that glides smoothly to each new GPS position instead
 * of snapping. Styled like a Life360-style member pin: a circular avatar
 * (vehicle photo if we have one, otherwise an icon) framed by a colored ring
 * that reflects live status, sitting on a small pointed tail so it reads as
 * a located pin rather than a floating badge.
 */
export default function VehicleMarker({ vehicle, onSelect }) {
  const pos = useSmoothPosition(vehicle.current_lat, vehicle.current_lng);
  if (!pos) return null;

  const ring = statusColor(vehicle.status);
  const Icon = vehicle.type === "taxi" ? Car : Bus;

  return (
    <Marker longitude={pos.lng} latitude={pos.lat} anchor="bottom">
      <button
        onClick={() => onSelect(vehicle)}
        className="flex flex-col items-center focus:outline-none"
        title={`${vehicle.name} · ${vehicle.company_name || ""} · ${vehicle.status}`}
      >
        <div
          className="w-9 h-9 rounded-full grid place-items-center shrink-0"
          style={{
            backgroundColor: "#fff",
            border: `2.5px solid ${ring}`,
            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
          }}
        >
          {vehicle.image_url ? (
            <img
              src={vehicle.image_url}
              alt=""
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18, color: ring }} />
          )}
        </div>
        {/* Small pointed tail beneath the avatar so it reads as a placed pin */}
        <div
          className="w-2.5 h-2.5 -mt-[5px]"
          style={{
            backgroundColor: ring,
            clipPath: "polygon(50% 100%, 0 0, 100% 0)",
          }}
        />
      </button>
    </Marker>
  );
}
