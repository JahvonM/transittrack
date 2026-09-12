import React from "react";
import { MapPin } from "lucide-react";
import { formatEta } from "@/lib/geo";
import useDrivingEta from "@/hooks/useDrivingEta";

/**
 * Shows how far away a vehicle is from the user's current location, following
 * actual roads (Mapbox Directions) rather than a straight line, plus an ETA.
 * Falls back to a straight-line estimate while the route loads or if the
 * Directions request fails.
 */
export default function BusDistance({ vehicle, userLocation }) {
  const destination = vehicle?.current_lat != null ? { lat: vehicle.current_lat, lng: vehicle.current_lng } : null;
  const speed = vehicle?.speed && vehicle.speed > 0 ? vehicle.speed : 25;
  const { km, mins, isDriving } = useDrivingEta(userLocation, destination, speed);

  if (!userLocation || vehicle.current_lat == null) {
    return (
      <p className="text-xs text-muted-foreground pt-1">Location unavailable</p>
    );
  }

  const distStr = km == null ? "—" : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
      <MapPin className="w-3.5 h-3.5 text-primary" />
      <span>
        <b className="text-foreground">{distStr}</b> {isDriving ? "by road" : "away"} · about {formatEta(mins)}
      </span>
    </div>
  );
}
