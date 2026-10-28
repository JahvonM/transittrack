import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Building2, CalendarClock, ChevronLeft, ChevronRight, CircleCheck, Globe, MapPin, Navigation, Pencil, Plane, Plus, Trash2, Users,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState, Kpi, KpiRow, Panel, Row, LeadIcon, Segmented, StatusChip, Toolbar } from "@/components/admin/kit";
import JobDialog from "@/components/jobs/JobDialog";
import { draftFromRequest } from "@/lib/bookingSite";
import BookingRequests, { answerRequest } from "@/components/jobs/BookingRequests";
import JobTypeIcon from "@/components/jobs/JobTypeIcon";
import PlaceDialog, { PLACE_KINDS } from "@/components/jobs/PlaceDialog";
import ClientDialog, { CLIENT_KINDS } from "@/components/jobs/ClientDialog";
import { orderedJobPlaces } from "@/lib/jobPlaces";
import { ACTIVE_JOB_STATUSES, findClashes, formatMoney, jobTypeLabel, jobWindow } from "@/lib/jobs";
import { STATUS_LABEL } from "@/lib/trip";
import { errorData } from "@/lib/requestError";
import { localDayKey as dayKey, shiftDayKey as shiftDay } from "@/lib/localDay";

const timeOf = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const kindLabel = (list, value) => list.find((k) => k.value === value)?.label || "Other";

function JobCard({ job, clash, onOpen }) {
  const w = jobWindow(job);
  const details = [
    job.client_name,
    job.guests ? `${job.guests} guest${job.guests === 1 ? "" : "s"}` : "",
    job.flight_number ? `Flight ${job.flight_number}` : "",
    job.stops?.length ? `${job.stops.length} stop${job.stops.length === 1 ? "" : "s"}` : "",
    job.passenger_name,
  ].filter(Boolean).join(" · ");
  return (
    <button type="button" onClick={() => onOpen(job)} className="flex w-full items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:bg-accent/50">
      <span className="w-[4.5rem] shrink-0 pt-0.5 font-display text-body-sm font-semibold tabular-nums">
        {w ? timeOf(w.start) : "No time"}
        {w && <span className="block text-caption font-normal text-muted-foreground">to {timeOf(w.end)}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
          <JobTypeIcon trip={job} className="h-3.5 w-3.5" /> {jobTypeLabel(job)}
          {clash && <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Overlaps</span>}
        </span>
        <span className="block truncate font-semibold">{job.pickup_name || "—"} <span className="font-normal text-muted-foreground">to</span> {job.dropoff_name || "—"}</span>
        {details && <span className="block truncate text-body-sm text-muted-foreground">{details}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusChip status={job.status}>{STATUS_LABEL[job.status] || job.status}</StatusChip>
        {job.price != null && job.price !== "" && <span className="text-caption tabular-nums text-muted-foreground">{formatMoney(job.price, job.currency)}</span>}
      </span>
    </button>
  );
}

// Admin → Jobs: dispatch's day board. Every bus with its jobs for the day, in
// time order, plus jobs not yet given to a bus. The saved places and clients
// that jobs use are kept here too.
export default function JobsTab({ vehicles = [], routes = [], trips = [], completedTrips = [], places = [], clients = [], onChange }) {
  const { toast } = useToast();
  const [view, setView] = useState("board");
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [dialog, setDialog] = useState({ open: false, job: null, draft: null, request: null });
  const [placeDialog, setPlaceDialog] = useState({ open: false, place: null });
  const [clientDialog, setClientDialog] = useState({ open: false, client: null });

  // Rides asked for on the website, waiting for an answer.
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const loadRequests = useCallback(async () => {
    try {
      const rows = await base44.entities.BookingRequest.filter({ status: "new" }, "created_date", 100);
      setRequests(Array.isArray(rows) ? rows : []);
    } catch { /* keep what's shown; the next check tries again */ }
    finally { setRequestsLoading(false); }
  }, []);
  useEffect(() => {
    loadRequests();
    const timer = setInterval(() => { if (!document.hidden) loadRequests(); }, 60_000);
    return () => clearInterval(timer);
  }, [loadRequests]);
  const makeJobFrom = (r) => setDialog({ open: true, job: null, draft: draftFromRequest(r), request: r });
  // Requests whose job is saved but whose confirmation didn't go through:
  // "Confirm ride" retries with that job instead of making a second one.
  const [madeJobs, setMadeJobs] = useState({});
  const confirmWith = async (r, tripId) => {
    try {
      const res = await answerRequest("confirm", { request_id: r.id, trip_id: tripId });
      setMadeJobs((m) => { const { [r.id]: _done, ...rest } = m; return rest; });
      toast({
        title: "Ride confirmed",
        description: !res.emailed ? `The job is saved, but the email to ${r.name} didn't go out. Contact them yourself.`
          : res.tracking ? `${r.name} was emailed the details and a tracking link.` : `${r.name} was emailed. They get a tracking link once the job has a bus (open the job to send it).`,
      });
    } catch (e) {
      if (tripId) setMadeJobs((m) => ({ ...m, [r.id]: tripId }));
      toast({ title: "The job is saved, but the ride wasn't confirmed", description: errorData(e).error || "Open Requests and press Confirm ride.", variant: "destructive" });
    }
    loadRequests();
    onChange?.();
  };
  // The job was saved: confirm the request, which emails the customer.
  const confirmRequest = (saved) => confirmWith(dialog.request, saved?.id);

  const all = useMemo(() => {
    const byId = new Map();
    for (const t of [...completedTrips, ...trips]) byId.set(t.id, t);
    return [...byId.values()].filter((t) => t.status !== "cancelled");
  }, [trips, completedTrips]);
  const active = all.filter((t) => ACTIVE_JOB_STATUSES.includes(t.status));
  const today = dayKey(new Date());
  const dayJobs = all.filter((t) => t.scheduled_time && dayKey(new Date(t.scheduled_time)) === day)
    .sort((a, b) => Date.parse(a.scheduled_time) - Date.parse(b.scheduled_time));
  const undated = active.filter((t) => !t.scheduled_time);
  const lanes = [
    ...(dayJobs.some((t) => !t.vehicle_id) || undated.some((t) => !t.vehicle_id) ? [{ id: "", name: "Not given to a bus", driver: "" }] : []),
    ...[...vehicles].sort((a, b) => String(a.name).localeCompare(String(b.name))).map((v) => ({ id: v.id, name: v.name, driver: v.driver_name || "" })),
  ];
  const completedToday = all.filter((t) => t.status === "completed" && t.completed_at && dayKey(new Date(t.completed_at)) === today).length;
  const openJob = (job) => setDialog({ open: true, job, draft: null, request: null });
  const dayLabel = day === today ? "Today" : day === shiftDay(today, 1) ? "Tomorrow" : day === shiftDay(today, -1) ? "Yesterday"
    : new Date(`${day}T12:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });

  const remove = async (entity, row, what) => {
    if (!window.confirm(`Remove ${row.name} from your ${what}?${entity === "Client" ? " Jobs already done for them keep the name, but you won't be able to invoice them here." : ""}`)) return;
    try {
      await base44.entities[entity].delete(row.id);
      onChange?.();
    } catch (e) {
      toast({ title: `Couldn't remove ${row.name}`, description: errorData(e).error || "Try again.", variant: "destructive" });
    }
  };

  return (
    <div>
      <KpiRow>
        <Kpi label="Scheduled" value={active.filter((t) => t.status === "scheduled").length} icon={CalendarClock} />
        <Kpi label="On the way" value={active.filter((t) => t.status === "on_the_way").length} icon={Navigation} tone="info" />
        <Kpi label="Arrived" value={active.filter((t) => t.status === "arrived").length} icon={MapPin} />
        <Kpi label="Completed today" value={completedToday} icon={CircleCheck} tone="success" />
      </KpiRow>

      <Toolbar actions={view === "board" || view === "requests" ? <Button onClick={() => openJob(null)}><Plus className="h-4 w-4" /> New job</Button>
        : view === "places" ? <Button onClick={() => setPlaceDialog({ open: true, place: null })}><Plus className="h-4 w-4" /> Add place</Button>
          : <Button onClick={() => setClientDialog({ open: true, client: null })}><Plus className="h-4 w-4" /> Add client</Button>}>
        <Segmented label="Jobs view" value={view} onChange={setView} options={[
          { value: "board", label: "Day board", icon: CalendarClock },
          { value: "requests", label: "Requests", icon: Globe, count: requests.length },
          { value: "places", label: "Places", icon: MapPin, count: places.length },
          { value: "clients", label: "Clients", icon: Building2, count: clients.length },
        ]} />
      </Toolbar>

      {view === "board" && requests.length > 0 && (
        <button type="button" onClick={() => setView("requests")} className="mb-3 flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-left hover:bg-primary/15">
          <Globe className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1 font-semibold">{requests.length === 1 ? "1 ride request" : `${requests.length} ride requests`} {requests.some((r) => r.company_id) ? "to answer" : "from the website"}</span>
          <span className="text-body-sm text-primary">Answer</span>
        </button>
      )}

      {view === "requests" && (
        <BookingRequests requests={requests} loading={requestsLoading} madeJobs={madeJobs} onMakeJob={makeJobFrom} onConfirmMade={(r) => confirmWith(r, madeJobs[r.id])} onChanged={loadRequests} />
      )}

      {view === "board" && (
        <Panel
          title={dayLabel}
          icon={CalendarClock}
          actions={(
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setDay(shiftDay(day, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
              {day !== today && <Button variant="outline" onClick={() => setDay(today)}>Today</Button>}
              <Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-auto" aria-label="Day" />
              <Button variant="outline" size="icon" onClick={() => setDay(shiftDay(day, 1))} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        >
          {lanes.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No buses yet" className="border-0">Add a vehicle first, then give it jobs.</EmptyState>
          ) : (
            <div className="space-y-4">
              {lanes.map((lane) => {
                const jobs = dayJobs.filter((t) => (t.vehicle_id || "") === lane.id);
                const noTime = undated.filter((t) => (t.vehicle_id || "") === lane.id);
                return (
                  <section key={lane.id || "unassigned"} aria-label={lane.name}>
                    <h3 className="flex items-baseline gap-2 px-1 pb-1.5">
                      <span className="font-semibold">{lane.name}</span>
                      {lane.driver && <span className="text-caption text-muted-foreground">{lane.driver}</span>}
                      <span className="ml-auto text-caption text-muted-foreground">{jobs.length ? `${jobs.length} job${jobs.length === 1 ? "" : "s"}` : "Free"}</span>
                    </h3>
                    <div className="space-y-1.5">
                      {[...jobs, ...noTime].map((t) => (
                        <JobCard key={t.id} job={t} clash={ACTIVE_JOB_STATUSES.includes(t.status) && findClashes(t, active).length > 0} onOpen={openJob} />
                      ))}
                      {jobs.length + noTime.length === 0 && <p className="rounded-xl border border-dashed border-border px-3 py-2 text-caption text-muted-foreground">No jobs this day.</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {view === "places" && (
        <Panel title="Saved places" icon={MapPin} description="The airport, hotels and tour stops. They show first when you set a job's pickup and drop-off.">
          {places.length === 0 ? (
            <EmptyState icon={Plane} title="No saved places" className="border-0">Add the airport and the hotels you work with.</EmptyState>
          ) : (
            <div className="divide-y divide-border">
              {orderedJobPlaces(places).map((p) => (
                <Row key={p.id} lead={<LeadIcon icon={p.kind === "airport" ? Plane : p.kind === "hotel" ? Building2 : MapPin} />} title={p.name}
                  subtitle={[p.favorite ? "★ Favourite" : "", kindLabel(PLACE_KINDS, p.kind), p.address, p.notes].filter(Boolean).join(" · ")}
                  actions={<>
                    <Button variant="ghost" size="icon" onClick={() => setPlaceDialog({ open: true, place: p })} aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-danger hover:text-danger" onClick={() => remove("Place", p, "places")} aria-label={`Remove ${p.name}`}><Trash2 className="h-4 w-4" /></Button>
                  </>} />
              ))}
            </div>
          )}
        </Panel>
      )}

      {view === "clients" && (
        <Panel title="Clients" icon={Building2} description="Hotels, companies and people you do jobs for. Invoices go to the client.">
          {clients.length === 0 ? (
            <EmptyState icon={Users} title="No clients yet" className="border-0">Add the hotels and companies that book jobs.</EmptyState>
          ) : (
            <div className="divide-y divide-border">
              {clients.map((c) => (
                <Row key={c.id} lead={<LeadIcon icon={c.kind === "person" ? Users : Building2} />} title={c.name}
                  subtitle={[kindLabel(CLIENT_KINDS, c.kind), c.contact_name, c.phone, c.email].filter(Boolean).join(" · ")}
                  actions={<>
                    <Button variant="ghost" size="icon" onClick={() => setClientDialog({ open: true, client: c })} aria-label={`Edit ${c.name}`}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-danger hover:text-danger" onClick={() => remove("Client", c, "clients")} aria-label={`Remove ${c.name}`}><Trash2 className="h-4 w-4" /></Button>
                  </>} />
              ))}
            </div>
          )}
        </Panel>
      )}

      <JobDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        job={dialog.job}
        draft={dialog.draft}
        day={day}
        vehicles={vehicles}
        routes={routes}
        places={places}
        clients={clients}
        trips={all}
        onSaved={dialog.request ? confirmRequest : onChange}
        onPlaceSaved={onChange}
        onClientSaved={onChange}
      />
      <PlaceDialog open={placeDialog.open} onOpenChange={(open) => setPlaceDialog((d) => ({ ...d, open }))} place={placeDialog.place} onSaved={onChange} />
      <ClientDialog open={clientDialog.open} onOpenChange={(open) => setClientDialog((d) => ({ ...d, open }))} client={clientDialog.client} onSaved={onChange} />
    </div>
  );
}
