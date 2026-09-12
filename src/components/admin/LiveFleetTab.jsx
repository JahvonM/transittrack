import React, { useState } from "react";
import { Bus, Lock, Radar, Radio, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import MapboxMap from "@/components/MapboxMap";
import BusDistance from "@/components/BusDistance";
import useUserLocation from "@/hooks/useUserLocation";
import { useToast } from "@/components/ui/use-toast";

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "never";

function timeAgo(iso) {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
}

export default function LiveFleetTab({ vehicles, onVehicleUpdate }) {
  const { toast } = useToast();
  const { location: userLoc } = useUserLocation();
  const [busy, setBusy] = useState(null);
  const withLocation = vehicles.filter((v) => v.current_lat != null);

  const remoteStart = async (v) => {
    setBusy(v.id);
    try {
      await base44.entities.Vehicle.update(v.id, { remote_tracking_lock: true, tracking_active: true });
      onVehicleUpdate?.({ ...v, remote_tracking_lock: true, tracking_active: true });
      toast({ title: "Tracking enforced", description: `${v.name} — driver tablet will auto-start on next heartbeat.` });
    } catch {
      toast({ title: "Failed to start tracking", variant: "destructive" });
    } finally { setBusy(null); }
  };

  const releaseLock = async (v) => {
    setBusy(v.id);
    try {
      await base44.entities.Vehicle.update(v.id, { remote_tracking_lock: false });
      onVehicleUpdate?.({ ...v, remote_tracking_lock: false });
      toast({ title: "Lock released", description: `${v.name} can now stop tracking manually.` });
    } catch {
      toast({ title: "Failed to release lock", variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{withLocation.length} of {vehicles.length} vehicles with last known position</p>
      </div>
      <div className="rounded-2xl overflow-hidden border h-[50vh]">
        <MapboxMap vehicles={withLocation} userLocation={userLoc} height="100%" />
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {vehicles.map((v) => {
          const locked = !!v.remote_tracking_lock;
          const tracking = !!v.tracking_active;
          return (
            <div key={v.id} className="p-3 rounded-xl border bg-card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm flex items-center gap-2">
                  <Bus className="w-4 h-4 text-primary" />
                  {v.name}
                </div>
                <div className="flex items-center gap-1.5">
                  {locked && <Badge variant="destructive"><Lock className="w-3 h-3 mr-1" />Locked</Badge>}
                  {tracking && !locked && <Badge variant="default"><Radio className="w-3 h-3 mr-1 animate-pulse" />Tracking</Badge>}
                  {!tracking && !locked && <Badge variant="secondary">Not tracking</Badge>}
                  {v.status === "emergency" && <Badge variant="destructive">SOS</Badge>}
                  {v.status === "speeding" && <Badge variant="destructive">Speeding</Badge>}
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>{v.company_name} · {v.plate_number}</div>
                <div>Driver: {v.driver_name || v.driver_email || "unassigned"}</div>
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {v.current_lat != null ? `Last seen ${timeAgo(v.last_location_update)}` : "No location yet"}
                </div>
              </div>
              {v.current_lat != null && userLoc && <BusDistance vehicle={v} userLocation={userLoc} />}
              <div className="flex gap-2">
                {!tracking && (
                  <Button size="sm" variant="default" disabled={busy === v.id} onClick={() => remoteStart(v)}>
                    <Radar className="w-3.5 h-3.5 mr-1" /> Start tracking
                  </Button>
                )}
                {locked && (
                  <Button size="sm" variant="outline" disabled={busy === v.id} onClick={() => releaseLock(v)}>
                    Release lock
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {vehicles.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center border rounded-2xl sm:col-span-2">
            No vehicles registered yet.
          </p>
        )}
      </div>
    </div>
  );
}