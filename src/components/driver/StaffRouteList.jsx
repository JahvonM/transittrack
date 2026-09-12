import React, { useMemo } from "react";
import { haversineKm } from "@/lib/geo";
import { PROXIMITY_TRIGGER_M } from "@/lib/mapbox";
import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StaffRouteListItem from "@/components/driver/StaffRouteListItem";

// Staff route list — proximity styling still uses straight-line distance (it just
// needs to trigger the "close" alert quickly), but the "X away" text shown per
// staff member uses the actual driving ETA (see StaffRouteListItem).
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
        {enriched.map((s) => (
          <StaffRouteListItem key={s.id} s={s} vehicle={vehicle} onAttend={onAttend} />
        ))}
      </CardContent>
    </Card>
  );
}
