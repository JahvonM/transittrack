import React, { useEffect, useMemo, useState } from "react";
import { Route as RouteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { haversineKm, etaMinutes, formatEta, fetchDrivingRoute } from "@/lib/geo";
import useTravelTimes, { etaFromLearned } from "@/hooks/useTravelTimes";

export default function RouteExplorer({ routes, vehicles }) {
  const [open, setOpen] = useState(false);
  const [routeId, setRouteId] = useState("");
  const [drivingByOrder, setDrivingByOrder] = useState({});

  const route = routes.find((r) => r.id === routeId) || routes[0];
  const travelTimes = useTravelTimes();

  const rows = useMemo(() => {
    if (!route) return [];
    const onRoute = vehicles.filter((v) => v.route_id === route.id && v.current_lat != null);
    return (route.stops || []).map((stop, i) => {
      let best = null;
      onRoute.forEach((v) => {
        // Real trips first (only buses still heading to this stop), else a
        // straight-line guess that the road estimate below refines.
        const learned = etaFromLearned(travelTimes[route.id], route, v, stop);
        const mins = learned ? learned.mins : etaMinutes(haversineKm(v.current_lat, v.current_lng, stop.lat, stop.lng), v.speed || 25);
        if (mins != null && (best == null || mins < best.mins)) best = { v, mins, learned: !!learned };
      });
      return { stop, order: i, best };
    });
  }, [route, vehicles, travelTimes]);

  // Refine each straight-line "next bus" candidate above with the actual driving
  // ETA (following roads), falling back to the straight-line estimate meanwhile.
  useEffect(() => {
    let cancelled = false;
    const candidates = rows.filter((r) => r.best && !r.best.learned);
    if (candidates.length === 0) {
      setDrivingByOrder({});
      return;
    }
    Promise.all(
      candidates.map((r) =>
        fetchDrivingRoute([
          { lat: r.best.v.current_lat, lng: r.best.v.current_lng },
          { lat: r.stop.lat, lng: r.stop.lng },
        ]).then((res) => ({ order: r.order, res }))
      )
    ).then((results) => {
      if (cancelled) return;
      const map = {};
      results.forEach(({ order, res }) => {
        if (res) map[order] = res;
      });
      setDrivingByOrder(map);
    });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RouteIcon className="w-4 h-4" />
          Route explorer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Route explorer</DialogTitle>
        </DialogHeader>
        {routes.length === 0 ? (
          <p className="text-sm text-muted-foreground">This company has no routes yet.</p>
        ) : (
          <div className="space-y-3">
            {routes.length > 1 && (
              <Select value={route?.id} onValueChange={setRouteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a route" />
                </SelectTrigger>
                <SelectContent>
                  {routes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ol className="space-y-2">
              {rows.map(({ stop, order, best }) => {
                const driving = drivingByOrder[order];
                const mins = best?.learned ? best.mins : driving ? driving.durationMin : best?.mins;
                return (
                  <li key={order} className="flex items-center gap-3 p-2.5 rounded-xl border">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold shrink-0">
                      {order + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{stop.name}</span>
                      {best && (
                        <span className="block text-xs text-muted-foreground truncate">Next: {best.v.name}{best.learned ? " · from real trips" : ""}</span>
                      )}
                    </span>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {best ? formatEta(mins) : "No bus en route"}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-muted-foreground">
              Where buses have driven this route enough, times come from their real past trips at this time of day; otherwise from the driving distance to the stop.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
