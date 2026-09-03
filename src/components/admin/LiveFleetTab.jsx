import React, { useState } from "react";
import { Bus, Map as MapIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import BusMap from "@/components/BusMap";

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "never";

export default function LiveFleetTab({ vehicles }) {
  const [showMap, setShowMap] = useState(false);
  const active = vehicles.filter((v) => v.status !== "offline" && v.current_lat != null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{active.length} of {vehicles.length} vehicles live</p>
        <Button variant={showMap ? "default" : "outline"} size="sm" onClick={() => setShowMap(!showMap)}>
          <MapIcon className="w-4 h-4" />{showMap ? "Hide map" : "Show map"}
        </Button>
      </div>
      {showMap && (
        <div className="rounded-2xl overflow-hidden border h-[50vh]">
          <BusMap vehicles={active} />
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        {vehicles.map((v) => (
          <div key={v.id} className="p-3 rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-sm flex items-center gap-2">
                <Bus className="w-4 h-4 text-primary" />
                {v.name}
              </div>
              <Badge variant={v.status === "on_trip" ? "default" : v.status === "idle" ? "secondary" : "outline"}>
                {v.status === "on_trip" ? "On trip" : v.status === "idle" ? "Idle" : "Offline"}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              <div>{v.company_name} · {v.plate_number}</div>
              <div>Driver: {v.driver_name || v.driver_email || "unassigned"}</div>
              <div>Last update: {fmtTime(v.last_location_update)}</div>
            </div>
          </div>
        ))}
        {vehicles.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center border rounded-2xl sm:col-span-2">
            No vehicles registered yet.
          </p>
        )}
      </div>
    </div>
  );
}