import React, { useMemo, useState } from "react";
import { haversineKm } from "@/lib/geo";
import { MapPin, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import StaffRouteListItem from "@/components/driver/StaffRouteListItem";
import useFitCount from "@/hooks/useFitCount";

// Staff route list — proximity styling still uses straight-line distance (it just
// needs to trigger the "close" alert quickly), but the "X away" text shown per
// staff member uses the actual driving ETA (see StaffRouteListItem).
// compact: fills its box on the Drive screen, nearest pickups first, showing
// only as many as fit; the full list opens in a sheet.
export default function StaffRouteList({ staff = [], vehicle, nearbyStaff = [], onAttend, compact = false }) {
  const [allOpen, setAllOpen] = useState(false);
  const [fitRef, fitCount] = useFitCount(66, { gap: 8, min: 1 });

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

  // Who's coming up next: people still to pick up, nearest first.
  const byNext = useMemo(
    () => [...enriched].sort((a, b) =>
      (a.skip_pickup_today ? 1 : 0) - (b.skip_pickup_today ? 1 : 0) || (a.dist ?? Infinity) - (b.dist ?? Infinity)),
    [enriched]
  );

  if (compact) {
    const shown = byNext.slice(0, fitCount);
    const hidden = byNext.length - shown.length;
    return (
      <div className="h-full min-h-0 flex flex-col rounded-2xl border bg-card p-3 gap-2">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <p className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" /> Pickups ({enriched.length})
          </p>
          {enriched.length > 0 && (
            <Button variant="ghost" size="sm" className="h-8 -mr-1" onClick={() => setAllOpen(true)}>
              {hidden > 0 ? `+${hidden} more` : "See all"} <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div ref={fitRef} className="flex-1 min-h-0 overflow-hidden space-y-2">
          {enriched.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No staff assigned to this route yet.</p>
          ) : (
            shown.map((s) => <StaffRouteListItem key={s.id} s={s} vehicle={vehicle} onAttend={onAttend} />)
          )}
        </div>
        <Sheet open={allOpen} onOpenChange={setAllOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
            <SheetHeader><SheetTitle>Staff on this route ({enriched.length})</SheetTitle></SheetHeader>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-3">
              {byNext.map((s) => <StaffRouteListItem key={s.id} s={s} vehicle={vehicle} onAttend={onAttend} />)}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

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
