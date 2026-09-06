import React, { useMemo } from "react";
import { haversineKm, formatEta, etaMinutes } from "@/lib/geo";
import { waLink, PROXIMITY_TRIGGER_M } from "@/lib/mapbox";
import { Navigation, MessageCircle, MapPin, UserCheck, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Staff route list with proximity-based wa.me links and skip/late styling
export default function StaffRouteList({ staff = [], vehicle, nearbyStaff = [], onAttend }) {
  const enriched = useMemo(() => {
    return staff.map((s) => {
      const lat = s.home_lat;
      const lng = s.home_lng;
      const dist =
        lat != null && vehicle?.current_lat != null
          ? haversineKm(vehicle.current_lat, vehicle.current_lng, lat, lng) * 1000
          : null;
      const isNear = nearbyStaff.includes(s.id);
      return { ...s, dist, isNear };
    });
  }, [staff, vehicle, nearbyStaff]);

  const navTo = (lat, lng, name) => {
    if (lat == null) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank");
  };

  if (enriched.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No staff assigned to this route yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" /> Staff on this route ({enriched.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {enriched.map((s) => {
          const skipped = s.skip_pickup_today;
          const late = s.late_snooze_active;
          const close = s.dist != null && s.dist <= PROXIMITY_TRIGGER_M;
          const wa = waLink(
            s.phone,
            `Hi ${s.full_name || ""}, the staff bus is approaching your pickup point now. Please be ready.`
          );
          return (
            <div
              key={s.id}
              className={`flex items-center gap-2 p-2.5 rounded-xl border bg-card transition-colors ${
                skipped ? "opacity-40" : close ? "border-green-500/50 bg-green-500/5" : late ? "border-amber-500/50 bg-amber-500/5" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {s.full_name || s.email}
                  {skipped && <span className="ml-2 text-xs text-muted-foreground">(skipping)</span>}
                  {late && <span className="ml-2 text-xs text-amber-400">(running late)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.dist != null
                    ? close
                      ? "Within 500m — alert now"
                      : `${formatEta(etaMinutes(s.dist / 1000))} away`
                    : "No location pinned"}
                </div>
              </div>
              {close && !skipped && <Volume2 className="w-4 h-4 text-green-400 animate-pulse" />}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => navTo(s.home_lat, s.home_lng, s.full_name)}
                disabled={s.home_lat == null || skipped}
              >
                <Navigation className="w-4 h-4" />
              </Button>
              {close && !skipped && s.phone && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 rounded-md grid place-items-center bg-green-600 text-white hover:bg-green-700"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
              )}
              {!skipped && !close && s.isNear && (
                <Button size="sm" variant="outline" className="h-8" onClick={() => onAttend(s.id)}>
                  <UserCheck className="w-3.5 h-3.5" /> Mark
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}