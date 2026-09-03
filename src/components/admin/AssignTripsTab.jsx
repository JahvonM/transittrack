import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarPlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/trip";

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function AssignTripsTab({ vehicles, routes, trips, onChange }) {
  const stopOptions = useMemo(
    () =>
      routes.flatMap((r) =>
        (r.stops || []).map((s) => ({ ...s, route_id: r.id, route_name: r.name }))
      ),
    [routes]
  );

  const [vehicleId, setVehicleId] = useState("");
  const [passengerName, setPassengerName] = useState("");
  const [pickupKey, setPickupKey] = useState("");
  const [dropoffKey, setDropoffKey] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [saving, setSaving] = useState(false);

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const pickup = stopOptions.find((s) => `${s.route_id}|${s.name}` === pickupKey);
  const dropoff = stopOptions.find((s) => `${s.route_id}|${s.name}` === dropoffKey);

  const assign = async () => {
    if (!vehicle || !pickup || !dropoff || !scheduledTime) return;
    setSaving(true);
    await base44.entities.Trip.create({
      vehicle_id: vehicle.id,
      vehicle_name: vehicle.name,
      plate_number: vehicle.plate_number,
      driver_email: vehicle.driver_email,
      driver_name: vehicle.driver_name,
      route_id: pickup.route_id,
      route_name: pickup.route_name,
      company_id: vehicle.company_id,
      company_name: vehicle.company_name,
      passenger_name: passengerName,
      pickup_name: pickup.name,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      dropoff_name: dropoff.name,
      dropoff_lat: dropoff.lat,
      dropoff_lng: dropoff.lng,
      scheduled_time: new Date(scheduledTime).toISOString(),
      status: "scheduled",
    });
    setPassengerName("");
    setPickupKey("");
    setDropoffKey("");
    setScheduledTime("");
    setSaving(false);
    onChange();
  };

  const cancelTrip = async (id) => {
    await base44.entities.Trip.update(id, { status: "cancelled" });
    onChange();
  };

  const upcoming = trips
    .filter((t) => ["scheduled", "on_the_way", "arrived"].includes(t.status))
    .sort((a, b) => (a.scheduled_time || "").localeCompare(b.scheduled_time || ""));

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarPlus className="w-4 h-4" /> Assign a trip
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Vehicle &amp; driver</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Choose a vehicle" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} · {v.driver_name || "no driver"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Guest / hotel name (optional)</Label>
            <Input value={passengerName} onChange={(e) => setPassengerName(e.target.value)} placeholder="e.g. Mr. Smith (Spice Hotel)" />
          </div>
          <div className="space-y-1.5">
            <Label>Pickup point</Label>
            <Select value={pickupKey} onValueChange={setPickupKey}>
              <SelectTrigger><SelectValue placeholder="Choose pickup" /></SelectTrigger>
              <SelectContent>
                {stopOptions.map((s, i) => (
                  <SelectItem key={`${s.route_id}|${s.name}`} value={`${s.route_id}|${s.name}`}>
                    {s.name} ({s.route_name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Drop-off point</Label>
            <Select value={dropoffKey} onValueChange={setDropoffKey}>
              <SelectTrigger><SelectValue placeholder="Choose drop-off" /></SelectTrigger>
              <SelectContent>
                {stopOptions.map((s, i) => (
                  <SelectItem key={`${s.route_id}|${s.name}`} value={`${s.route_id}|${s.name}`}>
                    {s.name} ({s.route_name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Scheduled pickup time</Label>
            <Input type="datetime-local" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
          </div>
          <Button
            className="w-full"
            onClick={assign}
            disabled={saving || !vehicle || !pickup || !dropoff || !scheduledTime}
          >
            {saving ? "Assigning…" : "Assign trip"}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Scheduled &amp; active trips
        </h3>
        <div className="space-y-2">
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center border rounded-2xl">
              No scheduled trips. Assign one on the left.
            </p>
          )}
          {upcoming.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border bg-card">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {t.pickup_name} <span className="text-muted-foreground">→</span> {t.dropoff_name}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {fmtDateTime(t.scheduled_time)} · {t.driver_name || "no driver"} · {t.vehicle_name} ({t.plate_number})
                </div>
              </div>
              <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              {t.status === "scheduled" && (
                <Button variant="ghost" size="icon" onClick={() => cancelTrip(t.id)}>
                  <XCircle className="w-4 h-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}