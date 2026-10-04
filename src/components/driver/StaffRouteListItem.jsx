import React from "react";
import { formatEta } from "@/lib/geo";
import useDrivingEta from "@/hooks/useDrivingEta";
import { waLink, PROXIMITY_TRIGGER_M } from "@/lib/mapbox";
import { Navigation, MessageCircle, UserCheck, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// One row of the driver's staff pickup list. Split out from StaffRouteList so this
// component can call useDrivingEta once per staff member (hooks can't be called a
// variable number of times inside a .map(), but a per-item component is fine).
export default function StaffRouteListItem({ s, vehicle, onAttend }) {
  const skipped = s.skip_pickup_today;
  const late = s.late_snooze_active;
  const close = s.dist != null && s.dist <= PROXIMITY_TRIGGER_M;

  const origin = vehicle?.current_lat != null ? { lat: vehicle.current_lat, lng: vehicle.current_lng } : null;
  const destination = s.home_lat != null ? { lat: s.home_lat, lng: s.home_lng } : null;
  const { mins, isDriving } = useDrivingEta(origin, destination);

  const wa = waLink(
    s.phone,
    `Hi ${s.full_name || ""}, the staff bus is approaching your pickup point now. Please be ready.`
  );

  const navTo = () => {
    if (s.home_lat == null) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.home_lat},${s.home_lng}`, "_blank");
  };

  return (
    <div
      className={`flex items-center gap-2 p-2.5 rounded-xl border bg-card transition-colors ${
        skipped ? "bg-muted/40 text-muted-foreground" : close ? "border-green-500/50 bg-green-500/5" : late ? "border-amber-500/50 bg-amber-500/5" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {s.full_name || s.email}
          {skipped && <span className="ml-2 text-xs text-muted-foreground">(skipping)</span>}
          {late && <span className="ml-2 text-xs font-semibold text-warning">(running late)</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {s.dist != null
            ? close
              ? "Within 500m — alert now"
              : `${formatEta(mins)} away${isDriving ? " · by road" : ""}`
            : "No location pinned"}
        </div>
      </div>
      {close && !skipped && <Volume2 className="w-4 h-4 text-green-400 animate-pulse" aria-hidden="true" />}
      <Button size="icon" variant="ghost" className="h-11 w-11" onClick={navTo} disabled={s.home_lat == null || skipped} aria-label={`Directions to ${s.full_name || "pickup"}`}>
        <Navigation className="w-5 h-5" aria-hidden="true" />
      </Button>
      {close && !skipped && s.phone && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="h-11 w-11 rounded-lg grid place-items-center bg-green-600 text-white hover:bg-green-700"
          aria-label={`Message ${s.full_name || "passenger"} on WhatsApp`}
        >
          <MessageCircle className="w-5 h-5" aria-hidden="true" />
        </a>
      )}
      {!skipped && !close && s.isNear && (
        <Button size="sm" variant="outline" className="h-11" onClick={() => onAttend(s.id)}>
          <UserCheck className="w-3.5 h-3.5" /> Mark
        </Button>
      )}
    </div>
  );
}
