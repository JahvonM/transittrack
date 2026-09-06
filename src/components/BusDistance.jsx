import React from "react";
import { MapPin } from "lucide-react";
import { haversineKm, etaMinutes, formatEta } from "@/lib/geo";

/**
 * Shows how far away a vehicle is from the user's current location,
 * plus a rough ETA based on the vehicle's speed. Pure calculation, no AI.
 */
export default function BusDistance({ vehicle, userLocation }) {
  if (!userLocation || vehicle.current_lat == null) {
    return (
      <p className="text-xs text-muted-foreground pt-1">Location unavailable</p>
    );
  }
  const km = haversineKm(userLocation.lat, userLocation.lng, vehicle.current_lat, vehicle.current_lng);
  const speed = vehicle.speed && vehicle.speed > 0 ? vehicle.speed : 25;
  const mins = etaMinutes(km, speed);
  const distStr = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
      <MapPin className="w-3.5 h-3.5 text-primary" />
      <span><b className="text-foreground">{distStr}</b> away · about {formatEta(mins)}</span>
    </div>
  );
}