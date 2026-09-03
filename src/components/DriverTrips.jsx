import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Clock, Flag, PenLine, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import TripSignatureDialog from "@/components/TripSignatureDialog";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/trip";

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function DriverTrips({ trips, startSharing, refresh }) {
  const [dialog, setDialog] = useState(null);

  const startTrip = async (trip) => {
    await base44.entities.Trip.update(trip.id, {
      status: "on_the_way",
      started_at: new Date().toISOString(),
    });
    await base44.entities.Vehicle.update(trip.vehicle_id, { status: "on_trip" });
    startSharing();
    refresh();
  };

  const markArrived = async (trip) => {
    await base44.entities.Trip.update(trip.id, {
      status: "arrived",
      arrived_at: new Date().toISOString(),
    });
    refresh();
  };

  const saveSignature = async ({ file_url, signed_by, signed_at }) => {
    if (!dialog) return;
    const { trip, mode } = dialog;
    if (mode === "pickup") {
      await base44.entities.Trip.update(trip.id, {
        pickup_signature_url: file_url,
        pickup_signed_by: signed_by,
        pickup_signed_at: signed_at,
      });
    } else {
      await base44.entities.Trip.update(trip.id, {
        dropoff_signature_url: file_url,
        dropoff_signed_by: signed_by,
        dropoff_signed_at: signed_at,
        status: "completed",
        completed_at: new Date().toISOString(),
      });
      await base44.entities.Vehicle.update(trip.vehicle_id, { status: "idle" });
    }
    refresh();
  };

  const todayStr = new Date().toDateString();
  const todays = trips.filter(
    (t) => !t.scheduled_time || new Date(t.scheduled_time).toDateString() === todayStr
  );
  const later = trips.filter((t) => !todays.includes(t));

  const renderTrip = (trip) => {
    const active = trip.status === "on_the_way" || trip.status === "arrived";
    return (
      <Card key={trip.id} className={active ? "border-primary" : undefined}>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">
              {trip.pickup_name} <span className="text-muted-foreground">→</span> {trip.dropoff_name}
            </div>
            <Badge variant={STATUS_VARIANT[trip.status]}>{STATUS_LABEL[trip.status]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Pickup: {fmtDateTime(trip.scheduled_time)}
            </div>
            {trip.passenger_name && <div>Passenger: {trip.passenger_name}</div>}
            <div>Vehicle: {trip.vehicle_name} · {trip.plate_number}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {trip.status === "scheduled" && (
              <Button onClick={() => startTrip(trip)}>
                <Play className="w-4 h-4" /> Start trip
              </Button>
            )}
            {trip.status === "on_the_way" && !trip.pickup_signature_url && (
              <Button onClick={() => setDialog({ trip, mode: "pickup" })}>
                <PenLine className="w-4 h-4" /> Confirm pickup — signature
              </Button>
            )}
            {trip.status === "on_the_way" && trip.pickup_signature_url && (
              <Button variant="outline" onClick={() => markArrived(trip)}>
                <Flag className="w-4 h-4" /> Arrived at drop-off
              </Button>
            )}
            {trip.status === "arrived" && (
              <Button onClick={() => setDialog({ trip, mode: "dropoff" })}>
                <PenLine className="w-4 h-4" /> Confirm drop-off — signature
              </Button>
            )}
          </div>

          {(trip.pickup_signature_url || trip.dropoff_signature_url) && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {trip.pickup_signature_url && (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  Pickup signed by {trip.pickup_signed_by} ({fmtDateTime(trip.pickup_signed_at)})
                </span>
              )}
              {trip.dropoff_signature_url && (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  Drop-off signed by {trip.dropoff_signed_by} ({fmtDateTime(trip.dropoff_signed_at)})
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Today's trips</h3>
        <div className="space-y-2 mt-2">
          {todays.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center border rounded-2xl">
              No trips assigned for today.
            </p>
          )}
          {todays.map(renderTrip)}
        </div>
      </div>
      {later.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Upcoming</h3>
          <div className="space-y-2 mt-2">{later.map(renderTrip)}</div>
        </div>
      )}
      <TripSignatureDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        trip={dialog?.trip}
        mode={dialog?.mode}
        onSaved={saveSignature}
      />
    </div>
  );
}