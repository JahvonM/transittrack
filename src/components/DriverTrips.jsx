import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { StatusChip } from "@/components/admin/kit";
import { CheckCircle2, ChevronRight, Circle, Clock, CloudOff, Flag, IdCard, MapPin, Navigation, PenLine, Phone, Plane, Play, Route, StickyNote, Users } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import TripSignatureDialog from "@/components/TripSignatureDialog";
import JobTypeIcon from "@/components/jobs/JobTypeIcon";
import { STATUS_LABEL } from "@/lib/trip";
import { blobToBase64 } from "@/lib/chatMedia";
import { dropoffSigned, jobTypeLabel, pickupSigned } from "@/lib/jobs";
import { currentPosition, jobStep, markJobDone, pendingSteps, withPendingSteps } from "@/lib/driverJobs";
import { JOBS_EVENT } from "@/lib/offlineJobs";
import { errorData } from "@/lib/requestError";
import { setNavTarget } from "@/lib/navTarget";

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { timeZone: TRANSIT_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }) : "—";
const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { timeZone: TRANSIT_TIME_ZONE, hour: "2-digit", minute: "2-digit" }) : "";
const transitDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TRANSIT_TIME_ZONE });
const hasPoint = (lat, lng) => lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

// Jobs dispatch gave this tablet's bus. Drivers have no login, so every step
// goes through the driverSession backend via `invoke`; with no signal a step
// is kept on the tablet and sent later (lib/driverJobs).
// compact: the Drive screen shows just the job in progress (or the next one)
// with its one action button; the full list opens in a sheet.
// onNameSign(job): send the job's meet-and-greet sign to the bus's boarding tablet.
export default function DriverTrips({ trips, invoke, startSharing, refresh, vehicle, signingTablet = false, onNameSign, compact = false }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dialog, setDialog] = useState(null);
  const [allOpen, setAllOpen] = useState(false);
  const [localTrips, setLocalTrips] = useState(trips);
  const [steps, setSteps] = useState(() => pendingSteps());

  // Keep local view in sync when the parent re-fetches
  useEffect(() => {
    setLocalTrips(trips);
  }, [trips]);
  useEffect(() => {
    const update = () => setSteps(pendingSteps());
    window.addEventListener(JOBS_EVENT, update);
    return () => window.removeEventListener(JOBS_EVENT, update);
  }, []);

  const shown = withPendingSteps(localTrips, steps);
  const waiting = (id) => steps.some((p) => p.trip_id === id);
  const patchTrip = (id, patch) =>
    setLocalTrips((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // Throws on failure (the signature dialog shows its own error).
  const step = async (trip, action, fields, label) => {
    try {
      const { result, queued } = await jobStep(invoke, action, { trip_id: trip.id, ...fields }, label);
      if (result?.trip) patchTrip(trip.id, result.trip);
      if (queued) toast({ title: "Saved on this tablet", description: "There's no signal right now. It sends by itself when the signal is back." });
      return true;
    } catch (e) {
      toast({ title: `Couldn't save: ${label.toLowerCase()}`, description: errorData(e).error || "Check the connection and try again.", variant: "destructive" });
      throw e;
    } finally {
      refresh?.();
    }
  };
  const tryStep = (...args) => step(...args).catch(() => false);

  const startTrip = (trip) => {
    startSharing?.();
    if(!trip.driver_accepted_at)await invoke("accept_job",{trip_id:trip.id});
    return tryStep(trip, "update_trip_status", { status: "on_the_way" }, "Start job");
  };
  const markArrived = (trip) => tryStep(trip, "update_trip_status", { status: "arrived" }, "Arrived");
  const reachStop = (trip, index) => tryStep(trip, "reach_stop", { index }, "Tour stop");

  const signTrip = async (file, signedBy, guests, role) => {
    if (!dialog) return;
    const { trip, mode } = dialog;
    const data_base64 = await blobToBase64(file);
    const where = await currentPosition(vehicle);
    await step(trip, "sign_trip", { mode, data_base64, mime_type: "image/png", signed_by: signedBy, guests, signed_role: role, ...(where || {}) },
      mode === "pickup" ? "Pickup signature" : "Drop-off signature");
    if (mode === "dropoff") markJobDone(trip.id);
  };

  // In-app directions on the Drive screen to where the job goes next.
  const destination = (trip) => {
    if (trip.status === "scheduled" || (trip.status === "on_the_way" && !pickupSigned(trip)))
      return hasPoint(trip.pickup_lat, trip.pickup_lng) ? { name: trip.pickup_name, lat: trip.pickup_lat, lng: trip.pickup_lng } : null;
    if (trip.status !== "on_the_way") return null;
    const stop = (trip.stops || []).find((s) => !s.reached_at && hasPoint(s.lat, s.lng));
    if (stop) return { name: stop.name, lat: stop.lat, lng: stop.lng };
    return hasPoint(trip.dropoff_lat, trip.dropoff_lng) ? { name: trip.dropoff_name, lat: trip.dropoff_lat, lng: trip.dropoff_lng } : null;
  };
  const directions = (target) => {
    setNavTarget(target);
    setAllOpen(false);
    if (!pathname.startsWith("/driver/track")) navigate("/driver/track");
  };

  const today = transitDay(Date.now());
  const todays = shown.filter((t) => !t.scheduled_time || transitDay(t.scheduled_time) === today);
  const later = shown.filter((t) => !todays.includes(t));

  // The one action a job needs next.
  const nextAction = (trip) => {
    if (trip.status === "scheduled") return { label: "Start job", icon: Play, run: () => startTrip(trip) };
    if (trip.status === "on_the_way" && !pickupSigned(trip)) return { label: "Confirm pickup", icon: PenLine, run: () => setDialog({ trip, mode: "pickup" }) };
    if (trip.status === "on_the_way") return { label: "Arrived at drop-off", icon: Flag, run: () => markArrived(trip), outline: true };
    if (trip.status === "arrived" && !dropoffSigned(trip)) return { label: "Confirm drop-off", icon: PenLine, run: () => setDialog({ trip, mode: "dropoff" }) };
    return null;
  };

  const renderTrip = (trip) => {
    const active = trip.status === "on_the_way" || trip.status === "arrived";
    const action = nextAction(trip);
    const ActionIcon = action?.icon;
    const target = destination(trip);
    const canReach = trip.status === "on_the_way" && pickupSigned(trip);
    return (
      <Card key={trip.id} className={active ? "border-primary" : undefined}>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <JobTypeIcon trip={trip} className="h-3.5 w-3.5" /> {jobTypeLabel(trip)}{trip.client_name ? ` · ${trip.client_name}` : ""}
              </p>
              <div className="font-medium">
                {trip.pickup_name} <span className="text-muted-foreground">→</span> {trip.dropoff_name}
              </div>
            </div>
            <StatusChip status={trip.status}>{STATUS_LABEL[trip.status]}</StatusChip>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" /> Pickup: {fmtDateTime(trip.scheduled_time)}{trip.end_time ? ` · done by ${fmtTime(trip.end_time)}` : ""}
            </div>
            {trip.pickup_address && trip.pickup_address !== trip.pickup_name && (
              <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" /> {trip.pickup_address}</div>
            )}
            {trip.flight_number && (
              <div className="flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5 shrink-0" /> Flight {trip.flight_number}
                {trip.flight_time ? ` · ${trip.job_type === "airport_dropoff" ? "departs" : "lands"} ${fmtTime(trip.flight_time)}` : ""}
              </div>
            )}
            {(trip.passenger_name || trip.passenger_phone) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Users className="h-3.5 w-3.5 shrink-0" /> {trip.passenger_name || "Guest"}
                {trip.passenger_phone && <a href={`tel:${trip.passenger_phone}`} className="inline-flex items-center gap-1 font-semibold text-primary"><Phone className="h-3.5 w-3.5" /> {trip.passenger_phone}</a>}
              </div>
            )}
            {(trip.guests || trip.luggage) ? (
              <div>{[trip.guests ? `${trip.guests} guest${trip.guests === 1 ? "" : "s"}` : "", trip.luggage ? `${trip.luggage} bag${trip.luggage === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</div>
            ) : null}
          </div>
          {trip.notes && (
            <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm"><StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> {trip.notes}</p>
          )}
          {trip.stops?.length > 0 && (
            <ol className="space-y-1.5" aria-label="Tour stops">
              {trip.stops.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
                  {s.reached_at ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{i + 1}. {s.name}</span>
                  {s.reached_at ? <span className="text-xs text-muted-foreground">{fmtTime(s.reached_at)}</span>
                    : canReach && <Button size="sm" variant="outline" className="h-8" onClick={() => reachStop(trip, i)}>Reached</Button>}
                </li>
              ))}
            </ol>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {action && (
              <Button variant={action.outline ? "outline" : "default"} onClick={action.run}>
                <ActionIcon className="h-4 w-4" /> {action.label}{action.icon === PenLine ? " — signature" : ""}
              </Button>
            )}
            {target && (
              <Button variant="outline" onClick={() => directions(target)}>
                <Navigation className="h-4 w-4" /> Directions
              </Button>
            )}
            {onNameSign && !pickupSigned(trip) && (
              <Button variant="outline" onClick={() => { setAllOpen(false); onNameSign(trip); }}>
                <IdCard className="h-4 w-4" /> Name sign
              </Button>
            )}
          </div>
          {signingTablet && action?.icon === PenLine && (
            <p className="text-xs text-muted-foreground">The guests can sign on the bus's signing tablet; this updates when they do.</p>
          )}

          {(pickupSigned(trip) || dropoffSigned(trip)) && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {pickupSigned(trip) && (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Pickup signed by {trip.pickup_signed_by}{trip.pickup_signed_role === "reception" ? ", hotel front desk" : ""} ({fmtDateTime(trip.pickup_signed_at)})
                </span>
              )}
              {dropoffSigned(trip) && (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Drop-off signed by {trip.dropoff_signed_by}{trip.dropoff_signed_role === "reception" ? ", hotel front desk" : ""} ({fmtDateTime(trip.dropoff_signed_at)})
                </span>
              )}
            </div>
          )}
          {waiting(trip.id) && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning"><CloudOff className="h-3.5 w-3.5" /> Saved on this tablet; it sends when the signal is back.</p>
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
      askGuests
    />
  );

  if (compact) {
    const focus = shown.find((t) => t.status === "on_the_way" || t.status === "arrived")
      || todays.find((t) => t.status === "scheduled") || todays[0] || later[0] || null;
    const action = focus ? nextAction(focus) : null;
    const ActionIcon = action?.icon;
    return (
      <div className={`rounded-2xl border bg-card p-3 space-y-2 ${focus && (focus.status === "on_the_way" || focus.status === "arrived") ? "border-primary" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Route className="w-4 h-4 text-primary" /> Jobs ({shown.length})</p>
          <Button variant="ghost" size="sm" className="h-8 -mr-1" onClick={() => setAllOpen(true)}>See all <ChevronRight className="w-4 h-4" /></Button>
        </div>
        {focus && (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <JobTypeIcon trip={focus} className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="font-medium truncate flex-1">{focus.pickup_name} <span className="text-muted-foreground">→</span> {focus.dropoff_name}</p>
              <StatusChip status={focus.status}>{STATUS_LABEL[focus.status]}</StatusChip>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              {focus.scheduled_time ? fmtTime(focus.scheduled_time) : "No time set"}
              {focus.passenger_name ? ` · ${focus.passenger_name}` : ""}
              {focus.guests ? ` · ${focus.guests} guest${focus.guests === 1 ? "" : "s"}` : ""}
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
            <SheetHeader><SheetTitle>Jobs</SheetTitle></SheetHeader>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-3">
              {shown.length === 0 && <p className="text-sm text-muted-foreground">No jobs for this bus.</p>}
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
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Today's jobs</h3>
        <div className="space-y-2 mt-2">
          {todays.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center border rounded-2xl">
              No jobs for today.
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
      {signatureDialog}
    </div>
  );
}
