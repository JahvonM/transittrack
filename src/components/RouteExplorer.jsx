import React, { useMemo, useState } from "react";
import { Route as RouteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { haversineKm, etaMinutes, formatEta } from "@/lib/geo";

export default function RouteExplorer({ routes, vehicles }) {
  const [open, setOpen] = useState(false);
  const [routeId, setRouteId] = useState("");

  const route = routes.find((r) => r.id === routeId) || routes[0];

  const rows = useMemo(() => {
    if (!route) return [];
    const onRoute = vehicles.filter((v) => v.route_id === route.id && v.current_lat != null);
    return (route.stops || []).map((stop, i) => {
      let best = null;
      onRoute.forEach((v) => {
        const mins = etaMinutes(haversineKm(v.current_lat, v.current_lng, stop.lat, stop.lng), v.speed || 25);
        if (mins != null && (best == null || mins < best.mins)) best = { v, mins };
      });
      return { stop, order: i, best };
    });
  }, [route, vehicles]);

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
              {rows.map(({ stop, order, best }) => (
                <li key={order} className="flex items-center gap-3 p-2.5 rounded-xl border">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold shrink-0">
                    {order + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{stop.name}</span>
                    {best && (
                      <span className="block text-xs text-muted-foreground truncate">Next: {best.v.name}</span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground shrink-0">
                    {best ? formatEta(best.mins) : "No bus en route"}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              Times are estimates based on each vehicle's current position and speed.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}