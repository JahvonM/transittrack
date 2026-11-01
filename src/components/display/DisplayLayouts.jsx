import React, { Suspense, lazy, useMemo } from "react";
import { ArrowRight, BatteryLow, CircleSlash, ClipboardX, Clock, MapPinOff, Plane, Radio, TabletSmartphone, TriangleAlert, Users, Wrench } from "lucide-react";
import { locationState } from "@/lib/fleetWorkspace";
import { formatAge } from "@/components/system/status";
import { JOB_STATUS, clock, dispatchColumns, displayAlerts, fleetCounts, fleetRows, progressText } from "@/lib/officeDisplay";
import { Chip, FitList, Panel, Stat } from "./DisplayParts";
import { cn } from "@/lib/utils";

const LiveTransitMap = lazy(() => import("@/components/map3d/LiveTransitMap"));

const Unavailable = ({ what }) => (
  <p className="flex items-center gap-2 py-2 text-[1rem] font-semibold text-warning">
    <TriangleAlert className="h-[1em] w-[1em]" aria-hidden="true" /> Couldn&apos;t load {what}. Trying again.
  </p>
);
const down = (feed, name) => (feed?.unavailable || []).includes(name);

export function WallMap({ feed, dark, now, className }) {
  const vehicles = useMemo(() => (feed?.vehicles || []).filter((v) => v.current_lat != null && v.current_lng != null), [feed?.vehicles]);
  const wallLabel = (v) => {
    const s = locationState(v, now);
    return { text: s.state === "live" ? v.name : `${v.name} · ${formatAge(now - Date.parse(s.at))}`, stale: s.state !== "live" };
  };
  return (
    <div className={cn("relative min-h-0 overflow-hidden rounded-2xl border border-border bg-muted", className)}>
      <Suspense fallback={<div className="h-full w-full bg-muted" />}>
        <LiveTransitMap variant="wall" dark={dark} vehicles={vehicles} wallLabel={wallLabel} label="Fleet map" className="absolute inset-0" />
      </Suspense>
      {down(feed, "vehicles") && <div className="absolute inset-x-4 top-4"><Unavailable what="bus positions" /></div>}
    </div>
  );
}

function LocationChip({ location, now }) {
  if (location.state === "live") return <Chip tone="live" icon={Radio}>Live</Chip>;
  if (location.state === "last_known") return <Chip tone="warning" icon={Clock}>Last known {formatAge(now - Date.parse(location.at))}</Chip>;
  return <Chip tone="offline" icon={MapPinOff}>No location</Chip>;
}

function BusRow({ row, now }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 px-3 py-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate font-display text-[1.4rem] font-bold leading-tight">
          {row.name}{row.plate && <span className="ml-2 text-[1rem] font-semibold text-muted-foreground">{row.plate}</span>}
        </p>
        {row.status === "emergency" ? <Chip tone="danger">SOS</Chip> : !row.inService ? <Chip tone="neutral" icon={CircleSlash}>Out of service</Chip> : <LocationChip location={row.location} now={now} />}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[1rem] text-muted-foreground">
        {row.job && <span className="flex min-w-0 items-center gap-1 text-foreground"><span className="font-semibold">{row.job.kind}</span>{row.job.to && <><ArrowRight className="h-[1em] w-[1em]" aria-hidden="true" /><span className="truncate">{row.job.to}</span></>}</span>}
        {row.driverName && <span className="truncate">{row.driverName}</span>}
        {row.onBoard != null && <span className="flex items-center gap-1"><Users className="h-[1em] w-[1em]" aria-hidden="true" />{row.onBoard} on board</span>}
        {row.shiftOpen && row.tablet && !row.tablet.ok && <span className="flex items-center gap-1 text-warning"><TabletSmartphone className="h-[1em] w-[1em]" aria-hidden="true" />Tablet {row.tablet.ageMs == null ? "not reporting" : `quiet ${formatAge(row.tablet.ageMs)}`}</span>}
        {row.tablet?.battery != null && row.tablet.battery <= 20 && !row.tablet.charging && <span className="flex items-center gap-1 text-warning"><BatteryLow className="h-[1em] w-[1em]" aria-hidden="true" />{row.tablet.battery}%</span>}
      </div>
    </div>
  );
}

export function FleetLayout({ feed, dark, now }) {
  const rows = useMemo(() => fleetRows(feed, now), [feed, now]);
  const alerts = useMemo(() => displayAlerts(feed, now), [feed, now]);
  const counts = fleetCounts(feed, now);
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(26rem,33%)] gap-4">
      <div className="flex min-h-0 flex-col gap-4">
        <WallMap feed={feed} dark={dark} now={now} className="flex-1" />
        {alerts.length > 0 && (
          <Panel title="Needs attention" count={alerts.length} tone="warning" className="h-[9.5rem] shrink-0" compact>
            <FitList row items={alerts} itemKey={(a) => a.key} render={(a) => <Chip tone={a.tone} className="text-[1rem]">{a.text}</Chip>} gap="gap-2" />
          </Panel>
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-4">
        <div className="grid shrink-0 grid-cols-3 gap-3">
          <Stat label="Live" value={counts.live} tone="live" />
          <Stat label="Last known" value={counts.lastKnown} tone={counts.lastKnown ? "warning" : undefined} />
          <Stat label="Under way" value={counts.underWay} />
        </div>
        {counts.pastTime > 0 && (
          <p className="flex shrink-0 items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2 text-[1.1rem] font-semibold text-warning">
            <Clock className="h-[1.1em] w-[1.1em]" aria-hidden="true" />
            {counts.pastTime} job{counts.pastTime === 1 ? " is" : "s are"} past {counts.pastTime === 1 ? "its" : "their"} time and not started
          </p>
        )}
        <Panel title="Buses" count={rows.length} className="flex-1">
          {down(feed, "vehicles") ? <Unavailable what="buses" /> : <FitList items={rows} render={(r) => <BusRow row={r} now={now} />} empty="No buses on this display." />}
        </Panel>
      </div>
    </div>
  );
}

function JobRow({ job, now, late }) {
  const status = JOB_STATUS[job.status] || JOB_STATUS.scheduled;
  const names = [job.guest_name, job.client_name].filter(Boolean).join(" · ");
  return (
    <div className={cn("grid grid-cols-[5.6rem_minmax(0,1fr)] items-start gap-3 rounded-xl border px-3 py-2", late ? "border-warning/40 bg-warning/5" : "border-border bg-background/40")}>
      <p className="font-display text-[1.9rem] font-bold leading-none tabular-nums">{clock(job.scheduled_time)}</p>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[1.1rem] font-semibold">{job.kind}{job.route_name ? ` · ${job.route_name}` : ""}</p>
          {late ? <Chip tone="warning" icon={Clock}>{formatAge(now - Date.parse(job.scheduled_time)).replace(" ago", "")} past</Chip> : <Chip tone={status.tone}>{status.label}</Chip>}
        </div>
        <p className="flex min-w-0 items-center gap-1 truncate text-[1rem]">
          <span className="truncate">{job.pickup_name || "Pickup not set"}</span>
          <ArrowRight className="h-[1em] w-[1em] shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{job.dropoff_name || "Drop-off not set"}</span>
        </p>
        <p className="flex flex-wrap gap-x-3 truncate text-[0.95rem] text-muted-foreground">
          <span className={job.vehicle_name ? "" : "font-semibold text-warning"}>{job.vehicle_name || "No bus assigned"}</span>
          {job.driver_name && <span>{job.driver_name}</span>}
          {job.guests != null && <span>{job.guests} guest{job.guests === 1 ? "" : "s"}</span>}
          {job.flight_number && <span className="flex items-center gap-1"><Plane className="h-[1em] w-[1em]" aria-hidden="true" />{job.flight_number}</span>}
          {progressText(job) && <span className="text-foreground">{progressText(job)}</span>}
          {names && <span className="truncate">{names}</span>}
        </p>
      </div>
    </div>
  );
}

export function DispatchLayout({ feed, now }) {
  const cols = useMemo(() => dispatchColumns(feed?.jobs || [], now), [feed?.jobs, now]);
  const jobsDown = down(feed, "jobs");
  const exceptions = feed?.exceptions || [];
  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
      <div className="grid min-h-0 grid-cols-3 gap-4">
        <Panel title="Past time, not started" count={cols.pastTime.length} tone={cols.pastTime.length ? "warning" : undefined}>
          {jobsDown ? <Unavailable what="jobs" /> : <FitList items={cols.pastTime} render={(j) => <JobRow job={j} now={now} late />} empty="Nothing waiting past its time." />}
        </Panel>
        <Panel title="Under way" count={cols.underWay.length} tone={cols.underWay.length ? "live" : undefined}>
          {jobsDown ? <Unavailable what="jobs" /> : <FitList items={cols.underWay} render={(j) => <JobRow job={j} now={now} />} empty="No jobs under way." />}
        </Panel>
        <Panel title="Next up" count={cols.next.length}>
          {jobsDown ? <Unavailable what="jobs" /> : <FitList items={cols.next} render={(j) => <JobRow job={j} now={now} />} empty="No more jobs today." />}
        </Panel>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
        <Panel title="Exceptions today" count={exceptions.length} tone={exceptions.length ? "info" : undefined} className="max-h-[11rem]" compact>
          {down(feed, "exceptions") ? <Unavailable what="exceptions" /> : (
            <FitList
              items={exceptions}
              itemKey={(e) => `${e.kind}:${e.vehicle_id}:${e.at}`}
              gap="gap-1"
              empty="None recorded today."
              render={(e) => (
                <p className="flex items-center gap-3 truncate text-[1rem]">
                  <span className="font-display text-[1.2rem] font-bold tabular-nums">{clock(e.at)}</span>
                  <span className="font-semibold">{e.label}</span>
                  <span className="text-muted-foreground">{[e.vehicle_name, e.person].filter(Boolean).join(" · ")}</span>
                </p>
              )}
            />
          )}
        </Panel>
        <div className="flex min-w-[12rem] flex-col justify-center rounded-2xl border border-border bg-card px-5">
          <p className="font-display text-[2.6rem] font-bold leading-none tabular-nums">{cols.done}</p>
          <p className="mt-1 text-[0.95rem] font-semibold text-muted-foreground">Done today</p>
        </div>
      </div>
    </div>
  );
}

const SEVERITY_TONE = { critical: "danger", high: "warning", medium: "info", low: "neutral" };
const SEVERITY_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

export function MaintenanceLayout({ feed }) {
  const m = feed?.maintenance || { faults: [], due: [], failed_inspections: [], unavailable: [] };
  const row = (title, sub, chip) => (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[1.15rem] font-semibold">{title}</p>
        {sub && <p className="truncate text-[0.95rem] text-muted-foreground">{sub}</p>}
      </div>
      {chip}
    </div>
  );
  return (
    <div className="grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-4">
      <Panel title="Open faults" count={m.faults.length} tone={m.faults.some((f) => ["critical", "high"].includes(f.severity)) ? "warning" : undefined}>
        {down(feed, "faults") ? <Unavailable what="faults" /> : (
          <FitList items={m.faults} empty="No open faults." render={(f) => row(f.title, [f.vehicle_name, f.repair_required ? "Repair required" : "", f.status === "in_progress" ? "Being worked on" : ""].filter(Boolean).join(" · "),
            <Chip tone={SEVERITY_TONE[f.severity] || "neutral"}>{SEVERITY_LABEL[f.severity] || "Fault"}</Chip>)} />
        )}
      </Panel>
      <Panel title="Service due" count={m.due.length} tone={m.due.some((s) => s.status === "overdue") ? "warning" : undefined}>
        {down(feed, "maintenance") ? <Unavailable what="service schedules" /> : (
          <FitList items={m.due} empty="No service due." render={(s) => row(s.service_type, [s.vehicle_name, s.last_service_date ? `Last done ${new Date(s.last_service_date).toLocaleDateString()}` : ""].filter(Boolean).join(" · "),
            <Chip tone={s.status === "overdue" ? "danger" : "warning"} icon={Wrench}>{s.status === "overdue" ? "Overdue" : "Due"}</Chip>)} />
        )}
      </Panel>
      <Panel title="Failed inspections, last 7 days" count={m.failed_inspections.length} tone={m.failed_inspections.length ? "warning" : undefined}>
        {down(feed, "inspections") ? <Unavailable what="inspections" /> : (
          <FitList items={m.failed_inspections} empty="No failed inspections this week." render={(i) => row(i.vehicle_name || "Bus", `${new Date(i.date).toLocaleDateString()}${i.needs_service ? " · Needs service" : ""}`,
            <Chip tone="warning" icon={ClipboardX}>Failed</Chip>)} />
        )}
      </Panel>
      <Panel title="Out of service" count={m.unavailable.length}>
        {down(feed, "vehicles") ? <Unavailable what="buses" /> : (
          <FitList items={m.unavailable} empty="Every bus is in service." render={(v) => row(v.name, "", <Chip tone="neutral" icon={CircleSlash}>Out of service</Chip>)} />
        )}
      </Panel>
    </div>
  );
}
