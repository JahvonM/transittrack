import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, CheckCircle2, Inbox, MapPin, Navigation, Plane, Plus, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { EmptyState, PageActions, Panel, StatusChip } from "@/components/admin/kit";
import JobTypeIcon from "@/components/jobs/JobTypeIcon";
import RequestJobDialog from "@/components/company/RequestJobDialog";
import { jobTypeLabel } from "@/lib/jobs";
import { STATUS_LABEL } from "@/lib/trip";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";
import { REQUEST_STATUS, busOnMap, jobGroups, serviceName } from "@/lib/companyPortal";
import { errorData } from "@/lib/requestError";

const LiveTransitMap = lazy(() => import("@/components/map3d/LiveTransitMap"));

const when = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleString([], { timeZone: TRANSIT_TIME_ZONE, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Time to be set";
};

// The company's requests, kept by the server per company.
export function useCompanyRequests() {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("bookingRequest", { action: "company_requests" });
      setRequests(res.data?.requests || []);
      setError("");
    } catch (e) {
      setError(errorData(e).error || "Couldn't load your requests.");
      setRequests((r) => r || []);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { requests, error, reload: load };
}

function JobCard({ job, bus }) {
  const live = bus && busOnMap(bus);
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
            <JobTypeIcon trip={job} className="h-3.5 w-3.5" /> {jobTypeLabel(job)}
          </p>
          <p className="mt-0.5 font-semibold">{when(job.scheduled_time)}</p>
          <p className="text-body-sm"><span className="font-medium">{job.pickup_name}</span> <span className="text-muted-foreground">to</span> <span className="font-medium">{job.dropoff_name}</span></p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-muted-foreground">
            {job.passenger_name && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" />{job.passenger_name}{job.guests ? ` · ${job.guests} guest${job.guests === 1 ? "" : "s"}` : ""}</span>}
            {job.flight_number && <span className="inline-flex items-center gap-1"><Plane className="h-3.5 w-3.5" aria-hidden="true" />Flight {job.flight_number}</span>}
            {job.vehicle_name && <span>{job.vehicle_name}{job.driver_name ? ` · ${job.driver_name}` : ""}</span>}
          </p>
        </div>
        <StatusChip status={job.status}>{STATUS_LABEL[job.status] || job.status}</StatusChip>
      </div>
      {live && <p className="mt-2 inline-flex items-center gap-1.5 text-body-sm font-semibold text-success"><Navigation className="h-4 w-4" aria-hidden="true" /> {bus.name} is on the map</p>}
    </li>
  );
}

function RequestRow({ r }) {
  const st = REQUEST_STATUS[r.status] || REQUEST_STATUS.new;
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="font-semibold">{serviceName(r.service)} · {when(r.requested_time)}</p>
        <p className="text-body-sm text-muted-foreground">{r.pickup} to {r.dropoff}{r.name ? ` · ${r.name}` : ""}</p>
        {r.status === "declined" && r.decline_reason && <p className="mt-1 text-body-sm">{r.decline_reason}</p>}
      </div>
      <StatusChip tone={st.tone}>{st.label}</StatusChip>
    </li>
  );
}

// Jobs for the company: ask for one, follow the ones under way on the map
// (the bus shows only until the job ends), and see what's coming and done.
export default function CompanyJobs({ company, trips, vehicles, routes = [] }) {
  const [asking, setAsking] = useState(false);
  const { requests, error, reload } = useCompanyRequests();
  const { live, upcoming, done } = jobGroups(trips);
  const busOf = (job) => vehicles.find((v) => v.id === job.vehicle_id);
  const liveBuses = vehicles.filter((v) => v.location_shared === "job" && busOnMap(v) && live.some((j) => j.vehicle_id === v.id));
  const open = (requests || []).filter((r) => r.status === "new" || (r.status === "declined" && Date.now() - Date.parse(r.created_date || "") < 14 * 86400_000));

  return (
    <div className="space-y-4">
      <PageActions>
        <Button onClick={() => setAsking(true)}><Plus className="h-4 w-4" /> Request a job</Button>
      </PageActions>
      <RequestJobDialog open={asking} onOpenChange={setAsking} company={company} onSent={reload} />

      <Panel title="On the way now" icon={Navigation} description="Your bus is on the map while the job is under way. It goes from the map when the job ends.">
        {live.length === 0 ? (
          <EmptyState icon={Navigation} title="No job under way" className="border-0">When the driver starts one of your jobs, the bus shows here.</EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <ul className="space-y-3">{live.map((j) => <JobCard key={j.id} job={j} bus={busOf(j)} />)}</ul>
            <div className="h-[360px] overflow-hidden rounded-xl border">
              <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
                <LiveTransitMap variant="page" className="h-full w-full" vehicles={liveBuses} routes={routes} label="Your job's bus" />
              </Suspense>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Your requests" icon={Inbox} description="Jobs you asked for that McSween Transport hasn't made yet, and any they couldn't take.">
        {error && <p role="alert" className="mb-2 text-body-sm text-danger">{error}</p>}
        {requests === null ? (
          <p role="status" className="py-4 text-center text-body-sm text-muted-foreground">Loading your requests…</p>
        ) : open.length === 0 ? (
          <EmptyState icon={CalendarPlus} title="Nothing waiting" className="border-0" action={<Button variant="outline" onClick={() => setAsking(true)}><Plus className="h-4 w-4" /> Request a job</Button>}>
            Ask for an airport pickup, a transfer or a tour. McSween Transport is emailed straight away.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">{open.map((r) => <RequestRow key={r.id} r={r} />)}</ul>
        )}
      </Panel>

      <Panel title="Coming up" icon={CalendarClock}>
        {upcoming.length === 0
          ? <EmptyState icon={CalendarClock} title="No jobs coming up" className="border-0">Confirmed jobs show here.</EmptyState>
          : <ul className="space-y-3">{upcoming.map((j) => <JobCard key={j.id} job={j} />)}</ul>}
      </Panel>

      {done.length > 0 && (
        <Panel title="Done" icon={CheckCircle2} description="The last 20 finished or cancelled jobs.">
          <ul className="space-y-3">{done.map((j) => <JobCard key={j.id} job={j} />)}</ul>
        </Panel>
      )}
      <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> You see a bus only while its driver's shift is open, or while one of your jobs is on the way.</p>
    </div>
  );
}
