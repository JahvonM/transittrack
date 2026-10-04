import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarClock, CalendarPlus, CircleCheck, MapPin, Navigation, XCircle } from "lucide-react";
import { EmptyState, Kpi, KpiRow, Panel, StatusChip } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABEL } from "@/lib/trip";

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

  const today = new Date().toDateString();
  const completedToday = trips.filter((t) => t.status === "completed" && t.completed_at && new Date(t.completed_at).toDateString() === today).length;
  const byDay = upcoming.reduce((acc, t) => {
    const d = t.scheduled_time ? new Date(t.scheduled_time) : null;
    const key = d ? d.toDateString() : "No time";
    (acc[key] = acc[key] || []).push(t);
    return acc;
  }, {});
  const dayLabel = (key) => {
    if (key === "No time") return key;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (key === today) return "Today";
    if (key === tomorrow.toDateString()) return "Tomorrow";
    return new Date(key).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
  };
  const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—");
  const field = "space-y-1.5";

  return (
    <div>
      <KpiRow>
        <Kpi label="Scheduled" value={upcoming.filter((t) => t.status === "scheduled").length} icon={CalendarClock} />
        <Kpi label="On the way" value={upcoming.filter((t) => t.status === "on_the_way").length} icon={Navigation} tone="info" />
        <Kpi label="Arrived" value={upcoming.filter((t) => t.status === "arrived").length} icon={MapPin} />
        <Kpi label="Completed today" value={completedToday} icon={CircleCheck} tone="success" />
      </KpiRow>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Scheduled and active trips" icon={CalendarClock} bodyClassName="p-3 pt-1">
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarPlus} title="No scheduled trips" className="border-0">Assign one with the form.</EmptyState>
          ) : (
            Object.entries(byDay).map(([day, list]) => (
              <div key={day} className="mb-2">
                <h3 className="px-2 pb-1 pt-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground">{dayLabel(day)}</h3>
                <ul className="divide-y divide-border">
                  {list.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-3">
                      <span className="w-16 shrink-0 font-display text-title-sm font-semibold tabular-nums">{timeOf(t.scheduled_time)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {t.pickup_name} <span className="font-normal text-muted-foreground">to</span> {t.dropoff_name}
                        </p>
                        <p className="truncate text-body-sm text-muted-foreground">
                          {[t.passenger_name, t.vehicle_name && `${t.vehicle_name}${t.plate_number ? ` (${t.plate_number})` : ""}`, t.driver_name || "No driver"].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <StatusChip status={t.status}>{STATUS_LABEL[t.status]}</StatusChip>
                      {t.status === "scheduled" ? (
                        <Button variant="ghost" size="icon" onClick={() => cancelTrip(t.id)} aria-label={`Cancel trip ${t.pickup_name} to ${t.dropoff_name}`} title="Cancel trip" className="text-danger hover:text-danger">
                          <XCircle className="h-4 w-4" />
                        </Button>
                      ) : <span className="w-10" aria-hidden="true" />}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Assign a trip" icon={CalendarPlus} className="lg:sticky lg:top-24">
          <div className="space-y-3">
            <div className={field}>
              <Label htmlFor="trip-vehicle">Vehicle and driver</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger id="trip-vehicle"><SelectValue placeholder="Choose a vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} · {v.driver_name || "no driver"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={field}>
              <Label htmlFor="trip-guest">Guest or hotel name (optional)</Label>
              <Input id="trip-guest" value={passengerName} onChange={(e) => setPassengerName(e.target.value)} placeholder="e.g. Mr. Smith (Spice Hotel)" />
            </div>
            <div className={field}>
              <Label htmlFor="trip-pickup">Pickup point</Label>
              <Select value={pickupKey} onValueChange={setPickupKey}>
                <SelectTrigger id="trip-pickup"><SelectValue placeholder="Choose pickup" /></SelectTrigger>
                <SelectContent>
                  {stopOptions.map((st) => (
                    <SelectItem key={`${st.route_id}|${st.name}`} value={`${st.route_id}|${st.name}`}>
                      {st.name} ({st.route_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={field}>
              <Label htmlFor="trip-dropoff">Drop-off point</Label>
              <Select value={dropoffKey} onValueChange={setDropoffKey}>
                <SelectTrigger id="trip-dropoff"><SelectValue placeholder="Choose drop-off" /></SelectTrigger>
                <SelectContent>
                  {stopOptions.map((st) => (
                    <SelectItem key={`${st.route_id}|${st.name}`} value={`${st.route_id}|${st.name}`}>
                      {st.name} ({st.route_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={field}>
              <Label htmlFor="trip-time">Scheduled pickup time</Label>
              <Input id="trip-time" type="datetime-local" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
            <Button className="w-full" onClick={assign} disabled={saving || !vehicle || !pickup || !dropoff || !scheduledTime}>
              {saving ? "Assigning…" : "Assign trip"}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
