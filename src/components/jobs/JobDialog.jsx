import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Segmented, StatusChip } from "@/components/admin/kit";
import PlaceField from "@/components/jobs/PlaceField";
import ClientDialog from "@/components/jobs/ClientDialog";
import TrackingLinks from "@/components/jobs/TrackingLinks";
import { JOB_ICONS } from "@/components/jobs/JobTypeIcon";
import { orderedJobPlaces } from "@/lib/jobPlaces";
import {
  CURRENCIES, JOB_TYPES, addMinutesToInput, defaultMinutes, findClashes, fromLocalInput, isAirportJob, jobTypeOf, toLocalInput,
} from "@/lib/jobs";
import { STATUS_LABEL } from "@/lib/trip";
import { errorData } from "@/lib/requestError";

const NONE = "__none";
const placeOf = (t, side) => (t?.[`${side}_name`] ? {
  name: t[`${side}_name`], address: t[`${side}_address`] || "", lat: t[`${side}_lat`] ?? null, lng: t[`${side}_lng`] ?? null,
  ...(side === "pickup" && t.route_id ? { route_id: t.route_id, route_name: t.route_name } : {}),
} : null);
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

// A new job filled in from a website ride request (BookingRequests.jsx).
export function draftFromRequest(r) {
  const type = JOB_TYPES.some((t) => t.id === r.service) ? r.service : "transfer";
  const text = (name) => (name ? { name, address: "", lat: null, lng: null } : null);
  const note = [r.notes, r.email ? `Booked on the website by ${r.email}` : ""].filter(Boolean).join("\n");
  return {
    job_type: type, scheduled_time: r.requested_time, pickup: text(r.pickup), dropoff: text(r.dropoff),
    flight_number: r.flight_number || "", guests: r.guests ?? "", luggage: r.luggage ?? "",
    passenger_name: r.name || "", passenger_phone: r.phone || "", notes: note,
  };
}

function blankForm(day, job, draft) {
  if (!job && draft) {
    const start = toLocalInput(draft.scheduled_time);
    return {
      ...blankForm(day, null),
      job_type: draft.job_type, start, end: start ? addMinutesToInput(start, defaultMinutes(draft.job_type)) : "",
      flight_number: draft.flight_number || "", pickup: draft.pickup, dropoff: draft.dropoff,
      guests: draft.guests ?? "", luggage: draft.luggage ?? "", passenger_name: draft.passenger_name || "",
      passenger_phone: draft.passenger_phone || "", notes: draft.notes || "",
    };
  }
  if (job) {
    const type = jobTypeOf(job);
    return {
      job_type: type, client_id: job.client_id || "", vehicle_id: job.vehicle_id || "",
      start: toLocalInput(job.scheduled_time), end: toLocalInput(job.end_time), endTouched: !!job.end_time,
      flight_number: job.flight_number || "", flight_time: toLocalInput(job.flight_time),
      pickup: placeOf(job, "pickup"), dropoff: placeOf(job, "dropoff"), stops: (job.stops || []).map((s) => ({ ...s })),
      guests: job.guests ?? "", luggage: job.luggage ?? "", passenger_name: job.passenger_name || "", passenger_phone: job.passenger_phone || "",
      notes: job.notes || "", price: job.price ?? "", currency: job.currency || "XCD",
    };
  }
  const start = day ? `${day}T09:00` : "";
  return {
    job_type: "airport_pickup", client_id: "", vehicle_id: "", start, end: start ? addMinutesToInput(start, defaultMinutes("airport_pickup")) : "", endTouched: false,
    flight_number: "", flight_time: "", pickup: null, dropoff: null, stops: [], guests: "", luggage: "",
    passenger_name: "", passenger_phone: "", notes: "", price: "", currency: "XCD",
  };
}

// Create or change a job: what kind, for whom, which bus, when, where, and
// what the driver should know. Saving tells the bus's tablet within a minute.
export default function JobDialog({ open, onOpenChange, job, draft = null, day, vehicles = [], places = [], clients = [], trips = [], onSaved, onPlaceSaved, onClientSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => blankForm(day, job, draft));
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [newClients, setNewClients] = useState([]);

  useEffect(() => {
    if (!open) return;
    setForm(blankForm(day, job, draft));
    setConfirmCancel(false);
    setNewClients([]);
  }, [open, job, day, draft]);

  const allClients = useMemo(() => {
    const ids = new Set(clients.map((c) => c.id));
    return [...clients, ...newClients.filter((c) => !ids.has(c.id))].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [clients, newClients]);
  const airport = orderedJobPlaces(places).find((p) => p.kind === "airport");
  const airportPlace = airport ? { name: airport.name, address: airport.address || "", lat: airport.lat ?? null, lng: airport.lng ?? null, notes: airport.notes || "" } : null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const setType = (job_type) => setForm((f) => ({
    ...f, job_type,
    end: f.endTouched || !f.start ? f.end : addMinutesToInput(f.start, defaultMinutes(job_type)),
    pickup: f.pickup || (job_type === "airport_pickup" ? airportPlace : null),
    dropoff: f.dropoff || (job_type === "airport_dropoff" ? airportPlace : null),
  }));
  // The airport is filled in for a new airport pickup (also when places load
  // after the form opened). Checked against the form as it is now, not as it
  // was when another job was last open.
  useEffect(() => {
    if (!open || job || !airportPlace) return;
    setForm((f) => (f.job_type === "airport_pickup" && !f.pickup ? { ...f, pickup: airportPlace } : f));
  }, [open, job, airport?.id]);
  const setStart = (start) => setForm((f) => ({ ...f, start, end: f.endTouched ? f.end : addMinutesToInput(start, defaultMinutes(f.job_type)) }));
  const setClient = (value) => {
    const client_id = value === NONE ? "" : value;
    const client = allClients.find((c) => c.id === client_id);
    setForm((f) => ({ ...f, client_id, currency: f.price === "" && client?.currency ? client.currency : f.currency }));
  };

  const vehicle = vehicles.find((v) => v.id === form.vehicle_id);
  // A job not yet given to a bus still belongs to a company; with one
  // company among the buses that is clear.
  const companies = [...new Set(vehicles.map((v) => v.company_id).filter(Boolean))];
  const companyId = vehicle?.company_id || job?.company_id || (companies.length === 1 ? companies[0] : "");
  const companyName = vehicle?.company_name || job?.company_name || vehicles.find((v) => v.company_id === companyId)?.company_name || "";
  const scheduled = fromLocalInput(form.start);
  const endIso = fromLocalInput(form.end);
  const tour = form.job_type === "hotel_tour";
  const clashes = findClashes({ id: job?.id, vehicle_id: form.vehicle_id, job_type: form.job_type, scheduled_time: scheduled, end_time: endIso }, trips);
  const problems = [
    !scheduled && "the pickup time",
    !form.pickup && "the pickup place",
    !form.dropoff && "the drop-off place",
    !companyId && "a bus",
    endIso && scheduled && Date.parse(endIso) <= Date.parse(scheduled) && "a finish time after the pickup",
    tour && form.stops.length === 0 && "at least one tour stop",
  ].filter(Boolean);
  const locked = job && ["completed", "cancelled"].includes(job.status);

  const save = async () => {
    setSaving(true);
    try {
      const place = (side, p) => ({ [`${side}_name`]: p.name, [`${side}_address`]: p.address || "", [`${side}_lat`]: p.lat ?? null, [`${side}_lng`]: p.lng ?? null });
      const data = {
        job_type: form.job_type, client_id: form.client_id || "",
        vehicle_id: vehicle?.id || "", vehicle_name: vehicle?.name || "", plate_number: vehicle?.plate_number || "",
        driver_email: vehicle?.driver_email || "", driver_name: vehicle?.driver_name || "",
        company_id: companyId, company_name: companyName,
        route_id: form.pickup.route_id || "", route_name: form.pickup.route_name || "",
        ...place("pickup", form.pickup), ...place("dropoff", form.dropoff),
        scheduled_time: scheduled, end_time: endIso,
        flight_number: isAirportJob(form.job_type) ? form.flight_number.trim().toUpperCase() : "",
        flight_time: isAirportJob(form.job_type) ? fromLocalInput(form.flight_time) : null,
        stops: tour ? form.stops.map(({ name, address, lat, lng, reached_at }) => ({ name, address: address || "", lat: lat ?? null, lng: lng ?? null, ...(reached_at ? { reached_at } : {}) })) : [],
        guests: form.guests === "" ? null : Number(form.guests), luggage: form.luggage === "" ? null : Number(form.luggage),
        passenger_name: form.passenger_name.trim(), passenger_phone: form.passenger_phone.trim(), notes: form.notes.trim(),
        price: form.price === "" ? null : Number(form.price), currency: form.currency,
      };
      const saved = job ? await base44.entities.Trip.update(job.id, data) : await base44.entities.Trip.create({ ...data, status: "scheduled" });
      if (!draft) toast({ title: job ? "Job updated" : "Job created", description: vehicle ? `${vehicle.name}'s tablet shows it within a minute.` : "Give it a bus when you're ready." });
      // A job made from a website request: the caller confirms it and tells the
      // customer (it reports its own problems; the job is saved either way).
      if (draft) await onSaved?.(saved); else onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Couldn't save the job", description: errorData(e).error || "Check the connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const cancelJob = async () => {
    setSaving(true);
    try {
      await base44.entities.Trip.update(job.id, { status: "cancelled", cancelled_at: new Date().toISOString() });
      toast({ title: "Job cancelled", description: job.vehicle_name ? `It comes off ${job.vehicle_name}'s tablet.` : undefined });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Couldn't cancel the job", description: errorData(e).error || "Check the connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const moveStop = (i, by) => set({ stops: (() => { const s = [...form.stops]; const [x] = s.splice(i, 1); s.splice(i + by, 0, x); return s; })() });
  const near = form.pickup?.lat != null ? { lat: form.pickup.lat, lng: form.pickup.lng } : undefined;
  const num = (key, label, max) => (
    <div className="space-y-1.5">
      <Label htmlFor={`job-${key}`}>{label}</Label>
      <Input id={`job-${key}`} type="number" inputMode="numeric" min={0} max={max} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {job ? "Edit job" : draft ? "Make a job from this request" : "New job"}
            {job && <StatusChip status={job.status}>{STATUS_LABEL[job.status] || job.status}</StatusChip>}
          </DialogTitle>
          <DialogDescription>
            {locked ? "This job is finished; it can't be changed." : draft ? "Check the details, choose the bus and the price. Saving confirms the ride and emails the customer." : "The bus's tablet shows the job and any change within a minute."}
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={locked || saving} className="min-w-0 space-y-4">
          <Segmented label="Kind of job" value={form.job_type} onChange={setType} size="sm"
            options={JOB_TYPES.map((t) => ({ value: t.id, label: t.label, icon: JOB_ICONS[t.id] }))} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="job-client">Client</Label>
              <div className="flex gap-2">
                <Select value={form.client_id || NONE} onValueChange={setClient}>
                  <SelectTrigger id="job-client"><SelectValue placeholder="Choose a client" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No client</SelectItem>
                    {allClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setClientOpen(true)} aria-label="Add a client" title="Add a client">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-bus">Bus and driver</Label>
              <Select value={form.vehicle_id || NONE} onValueChange={(v) => set({ vehicle_id: v === NONE ? "" : v })}>
                <SelectTrigger id="job-bus"><SelectValue placeholder="Choose a bus" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not given to a bus yet</SelectItem>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} · {v.driver_name || "no driver"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="job-start">Pickup time</Label>
              <Input id="job-start" type="datetime-local" value={form.start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-end">{tour ? "Back by" : "Finished by"}</Label>
              <Input id="job-end" type="datetime-local" value={form.end} onChange={(e) => set({ end: e.target.value, endTouched: true })} />
            </div>
          </div>

          {isAirportJob(form.job_type) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="job-flight">Flight number</Label>
                <Input id="job-flight" value={form.flight_number} onChange={(e) => set({ flight_number: e.target.value })} placeholder="e.g. AA 1234" maxLength={20} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-flight-time">{form.job_type === "airport_pickup" ? "Lands at" : "Departs at"}</Label>
                <Input id="job-flight-time" type="datetime-local" value={form.flight_time} onChange={(e) => set({ flight_time: e.target.value })} />
              </div>
            </div>
          )}

          {clashes.length > 0 && (
            <div role="status" className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-body-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="font-semibold">{vehicle?.name || "This bus"} already has {clashes.length === 1 ? "a job" : `${clashes.length} jobs`} at this time</p>
                {clashes.slice(0, 3).map((c) => (
                  <p key={c.id} className="text-muted-foreground">{timeOf(c.scheduled_time)}: {c.pickup_name} to {c.dropoff_name}</p>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <PlaceField id="job-pickup" label={tour ? "Pick guests up at" : "Pickup"} value={form.pickup} onChange={(pickup) => set({ pickup })} places={places} onPlaceSaved={onPlaceSaved} proximity={near} />
            <div className="space-y-1">
              <PlaceField id="job-dropoff" label={tour ? "Bring guests back to" : "Drop-off"} value={form.dropoff} onChange={(dropoff) => set({ dropoff })} places={places} onPlaceSaved={onPlaceSaved} proximity={near} />
              {!form.dropoff && form.pickup && (
                <button type="button" className="text-caption font-semibold text-primary" onClick={() => set({ dropoff: { ...form.pickup } })}>Same as pickup</button>
              )}
            </div>
          </div>

          {tour && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-body-sm font-semibold">Tour stops, in order</p>
              {form.stops.length === 0 && <p className="text-caption text-muted-foreground">Add the places the tour visits.</p>}
              <ol className="space-y-1.5">
                {form.stops.map((s, i) => (
                  <li key={`${s.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-secondary/50 px-2 py-1.5">
                    <span className="w-5 text-center text-caption font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-body-sm">{s.name}{s.reached_at ? " · reached" : ""}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => moveStop(i, -1)} aria-label={`Move ${s.name} up`}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === form.stops.length - 1} onClick={() => moveStop(i, 1)} aria-label={`Move ${s.name} down`}><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-danger" onClick={() => set({ stops: form.stops.filter((_, j) => j !== i) })} aria-label={`Remove ${s.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </li>
                ))}
              </ol>
              {form.stops.length < 30 && (
                <PlaceField key={form.stops.length} id="job-stop" label="Add a stop" value={null} onChange={(p) => p && set({ stops: [...form.stops, p] })} places={places} routes={[]} proximity={near} />
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="job-guest">Lead guest</Label>
              <Input id="job-guest" value={form.passenger_name} onChange={(e) => set({ passenger_name: e.target.value })} placeholder="e.g. Mr and Mrs Smith" maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-phone">Guest phone</Label>
              <Input id="job-phone" type="tel" value={form.passenger_phone} onChange={(e) => set({ passenger_phone: e.target.value })} maxLength={40} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {num("guests", "Guests", 500)}
            {num("luggage", "Bags", 500)}
            <div className="space-y-1.5">
              <Label htmlFor="job-price">Price</Label>
              <Input id="job-price" type="number" inputMode="decimal" min={0} step="0.01" value={form.price} onChange={(e) => set({ price: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-currency">Currency</Label>
              <Select value={form.currency} onValueChange={(currency) => set({ currency })}>
                <SelectTrigger id="job-currency"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job-notes">Notes for the driver</Label>
            <Textarea id="job-notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Hold a sign with the guest's name; child seat needed" maxLength={2000} rows={2} />
          </div>
        </fieldset>

        {job && !locked && <TrackingLinks job={job} />}

        {!locked && (
          <div className="space-y-2">
            {problems.length > 0 && <p className="text-caption text-muted-foreground">Still needed: {problems.join(", ")}.</p>}
            <Button className="w-full" onClick={save} disabled={saving || problems.length > 0}>
              {saving ? "Saving…" : job ? "Save changes" : "Create job"}
            </Button>
            {job && (confirmCancel ? (
              <div className="flex gap-2">
                <Button variant="destructive" className="flex-1" onClick={cancelJob} disabled={saving}>Yes, cancel this job</Button>
                <Button variant="outline" className="flex-1" onClick={() => setConfirmCancel(false)} disabled={saving}>Keep it</Button>
              </div>
            ) : (
              <Button variant="ghost" className="w-full text-danger hover:text-danger" onClick={() => setConfirmCancel(true)} disabled={saving}>
                <XCircle className="h-4 w-4" /> Cancel job
              </Button>
            ))}
          </div>
        )}
        <ClientDialog open={clientOpen} onOpenChange={setClientOpen} onSaved={(c) => { setNewClients((prev) => [...prev, c]); setClient(c.id); onClientSaved?.(c); }} />
      </DialogContent>
    </Dialog>
  );
}
