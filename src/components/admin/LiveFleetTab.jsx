import React, { useEffect, useRef, useState } from "react";
import { Bus, History, Lock, Radar, Radio, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import MapboxMap from "@/components/MapboxMap";
import BusDistance from "@/components/BusDistance";
import useUserLocation from "@/hooks/useUserLocation";
import { useToast } from "@/components/ui/use-toast";
import { computeOccupancyByVehicle } from "@/lib/occupancy";
import LocationReplay from "@/components/replay/LocationReplay";

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
  const [occupancy, setOccupancy] = useState({});
  const withLocation = vehicles.filter((v) => v.current_lat != null);
  // Tapping a bus in the list centres the map on it.
  const [focus, setFocus] = useState({ id: null, n: 0 });
  const mapBox = useRef(null);
  // "live" = where buses are now, "history" = replay a past day.
  const [view, setView] = useState("live");
  const [historyId, setHistoryId] = useState("");
  const showHistory = (v) => {
    setView("history");
    setHistoryId(v.id);
    setFocus((f) => ({ id: v.id, n: f.n }));
    mapBox.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const showOnMap = (v) => {
    if (view === "history") { showHistory(v); return; }
    if (v.current_lat == null) { toast({ title: `${v.name} has no location yet` }); return; }
    setFocus((f) => ({ id: v.id, n: f.n + 1 }));
    mapBox.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // Every boarding/exit already lands in StaffCheckIn — this just aggregates
  // the latest record per person per vehicle into a live headcount, so
  // dispatch can see "14 aboard" without opening the sign-in log.
  useEffect(() => {
    const load = () => {
      base44.entities.StaffCheckIn.list("-created_date", 500).then((list) => {
        setOccupancy(computeOccupancyByVehicle(list));
      });
    };
    load();
    const unsub = base44.entities.StaffCheckIn.subscribe(() => load());
    return unsub;
  }, []);

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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40" role="tablist" aria-label="Map view">
          {[
            { id: "live", label: "Live", icon: Radio },
            { id: "history", label: "History", icon: History },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => {
                setView(id);
                if (id === "history" && !historyId) setHistoryId(focus.id || vehicles[0]?.id || "");
              }}
              className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-1.5 transition-colors ${view === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {view === "live"
            ? `${withLocation.length} of ${vehicles.length} vehicles with last known position`
            : "Pick a bus and a day to replay where it went"}
        </p>
      </div>
      <div ref={mapBox} className="scroll-mt-4">
        {view === "live" ? (
          <div className="rounded-2xl overflow-hidden border h-[50vh]">
            <MapboxMap vehicles={withLocation} userLocation={focus.id ? null : userLoc} height="100%" focusVehicleId={focus.id} focusKey={focus.n} />
          </div>
        ) : (
          <LocationReplay vehicles={vehicles} initialVehicleId={historyId} />
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {vehicles.map((v) => {
          const locked = !!v.remote_tracking_lock;
          const tracking = !!v.tracking_active;
          return (
            <div
              key={v.id}
              role="button"
              tabIndex={0}
              onClick={() => showOnMap(v)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showOnMap(v); } }}
              aria-label={view === "history" ? `Replay ${v.name}` : `Show ${v.name} on the map`}
              className={`p-3 rounded-xl border bg-card space-y-2 cursor-pointer transition-colors hover:border-primary/60 ${(view === "history" ? historyId : focus.id) === v.id ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm flex items-center gap-2">
                  <Bus className="w-4 h-4 text-primary" />
                  {v.name}
                </div>
                <div className="flex items-center gap-1.5">
                  {occupancy[v.id] > 0 && (
                    <Badge variant="outline" className="gap-1">
                      <Users className="w-3 h-3" /> {occupancy[v.id]}{v.capacity ? `/${v.capacity}` : ""}
                    </Badge>
                  )}
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
              <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" onClick={() => showHistory(v)}>
                  <History className="w-3.5 h-3.5 mr-1" /> Past trips
                </Button>
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