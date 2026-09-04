import React from "react";
import { Bus, Car, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatEta } from "@/lib/geo";

export default function VehicleListItem({ v, mins }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
      <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
        {v.type === "taxi" ? <Car className="w-5 h-5" /> : <Bus className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{v.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {v.plate_number} · {v.status === "on_trip" ? "On trip" : "Waiting"}
        </div>
      </div>
      <div className="text-right shrink-0">
        {mins != null ? (
          <div className="flex items-center gap-1 font-medium justify-end">
            <Clock className="w-3.5 h-3.5" />
            {formatEta(mins)}
          </div>
        ) : (
          <Badge variant="secondary">{v.status}</Badge>
        )}
      </div>
    </div>
  );
}