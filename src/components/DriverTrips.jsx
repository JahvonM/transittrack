import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import React, { useEffect, useState } from "react";
import { StatusChip } from "@/components/admin/kit";
import { CheckCircle2, ChevronRight, Clock, Flag, PenLine, Play, Route } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import TripSignatureDialog from "@/components/TripSignatureDialog";
import { STATUS_LABEL } from "@/lib/trip";
import { blobToBase64 } from "@/lib/chatMedia";

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

// Booked trips assigned to this tablet's vehicle. Drivers have no login, so
// every change goes through the driverSession backend via `invoke`.
// compact: the Drive screen shows just the trip in progress (or the next one)
// with its one action button; the full list opens in a sheet.
export default function DriverTrips({ trips, invoke, startSharing, refresh, compact = false }) {
  const { toast } = useToast();
  const [dialog, setDialog] = useState(null);
  const [allOpen, setAllOpen] = useState(false);
  const [localTrips, setLocalTrips] = useState(trips);

  // Keep local view in sync when the parent re-fetches
  useEffect(() => {
    setLocalTrips(trips);
  }, [trips]);

  const patchTrip = (id, patch) =>
    setLocalTrips((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const setStatus = async (trip, status, patch) => {
    const prev = { ...trip };
    patchTrip(trip.id, { status, ...patch });
    try {
      await invoke("update_trip_status", { trip_id: trip.id, status });
    } catch {
      patchTrip(trip.id, prev);
      toast({ title: "Couldn't update the trip", description: "Check the connection and try again.", variant: "destructive" });
    }
    refresh?.();
  };

  const startTrip = (trip) => {
    startSharing?.();
    return setStatus(trip, "on_the_way", { started_at: new Date().toISOString() });
  };

  const markArrived = (trip) => setStatus(trip, "arrived", { arrived_at: new Date().toISOString() });

  // Throws on failure so the dialog stays open and shows its error.
  const signTrip = async (file, signedBy) => {
    if (!dialog) return;
    const { trip, mode } = dialog;
    const data_base64 = await blobToBase64(file);
    const res = await invoke("sign_trip", { trip_id: trip.id, mode, data_base64, mime_type: file.type || "image/png", signed_by: signedBy });
    if (res?.trip) patchTrip(trip.id, res.trip);
    refresh?.();
  };

  const todayStr = new Date().toDateString();
  const todays = localTrips.filter(
    (t) => !t.scheduled_time || new Date(t.scheduled_time).toDateString() === todayStr
  );
  const later = localTrips.filter((t) => !todays.includes(t));

  // The one action a trip needs next.
  const nextAction = (trip) => {
    if (trip.status === "scheduled") return { label: "Start trip", icon: Play, run: () => startTrip(trip) };
    if (trip.status === "on_the_way" && !trip.pickup_signature_url) return { label: "Confirm pickup", icon: PenLine, run: () => setDialog({ trip, mode: "pickup" }) };
    if (trip.status === "on_the_way") return { label: "Arrived at drop-off", icon: Flag, run: () => markArrived(trip), outline: true };
    if (trip.status === "arrived") return { label: "Confirm drop-off", icon: PenLine, run: () => setDialog({ trip, mode: "dropoff" }) };
    return null;
  };

  const renderTrip = (trip) => {
    const active = trip.status === "on_the_way" || trip.status === "arrived";
    return (
      <Card key={trip.id} className={active ? "border-primary" : undefined}>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">
              {trip.pickup_name} <span className="text-muted-foreground">→</span> {trip.dropoff_name}
            </div>
            <StatusChip status={trip.status}>{STATUS_LABEL[trip.status]}</StatusChip>
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
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  Pickup signed by {trip.pickup_signed_by} ({fmtDateTime(trip.pickup_signed_at)})
                </span>
              )}
              {trip.dropoff_signature_url && (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  Drop-off signed by {trip.dropoff_signed_by} ({fmtDateTime(trip.dropoff_signed_at)})
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const signatureDialog = (
    <TripSignatureDialog
      open={!!dialog}
      onOpenChange={(o) => !o && setDialog(null)}
      trip={dialog?.trip}
      mode={dialog?.mode}
      onSign={signTrip}
    />
  );

  if (compact) {
    const focus = localTrips.find((t) => t.status === "on_the_way" || t.status === "arrived")
      || todays.find((t) => t.status === "scheduled") || todays[0] || later[0] || null;
    const action = focus ? nextAction(focus) : null;
    const ActionIcon = action?.icon;
    return (
      <div className={`rounded-2xl border bg-card p-3 space-y-2 ${focus && (focus.status === "on_the_way" || focus.status === "arrived") ? "border-primary" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Route className="w-4 h-4 text-primary" /> Trips ({localTrips.length})</p>
          <Button variant="ghost" size="sm" className="h-8 -mr-1" onClick={() => setAllOpen(true)}>See all <ChevronRight className="w-4 h-4" /></Button>
        </div>
        {focus && (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-medium truncate flex-1">{focus.pickup_name} <span className="text-muted-foreground">→</span> {focus.dropoff_name}</p>
              <StatusChip status={focus.status}>{STATUS_LABEL[focus.status]}</StatusChip>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              {focus.scheduled_time ? new Date(focus.scheduled_time).toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE, hour: "2-digit", minute: "2-digit" }) : "No time set"}
              {focus.passenger_name ? ` · ${focus.passenger_name}` : ""}
            </p>
            {action && (
              <Button className="w-full h-11" variant={action.outline ? "outline" : "default"} onClick={action.run}>
                <ActionIcon className="w-4 h-4" /> {action.label}
              </Button>
            )}
          </>
        )}
        <Sheet open={allOpen} onOpenChange={setAllOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
            <SheetHeader><SheetTitle>Trips</SheetTitle></SheetHeader>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-3">
              {localTrips.length === 0 && <p className="text-sm text-muted-foreground">No trips assigned.</p>}
              {[...todays, ...later].map(renderTrip)}
            </div>
          </SheetContent>
        </Sheet>
        {signatureDialog}
      </div>
    );
  }

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
        onSign={signTrip}
      />
    </div>
  );
}