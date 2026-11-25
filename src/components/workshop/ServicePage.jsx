import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/admin/kit";
import { STATE_LABEL, STATE_TONE, everyText, fleetDue, fromModelPage, lastText, reminderDaysFrom } from "@/lib/serviceDue";
import { Notice, ScreenBar, pluralize, useWorkshop } from "@/components/workshop/kit";
import { Bus, RefreshCw } from "lucide-react";

// Service across the fleet: every bus's services, the overdue first, then
// the ones due soon, then the rest, and the buses with none set up yet. Each
// opens its bus's Service section, where it is marked done or a job is
// started for it.

const GROUPS = [
  { key: "overdue", title: "Overdue" },
  { key: "due", title: "Due soon" },
  { key: "later", title: "Later" },
  { key: "unset", title: "Not set" },
];

export default function ServicePage() {
  const { vehicles, schedules, serviceSettings, facts, missing, reload } = useWorkshop();
  const due = fleetDue(schedules, vehicles, { reminderDays: reminderDaysFrom(serviceSettings) });
  const bare = vehicles.filter((v) => v.kind === "bus" && !schedules.some((s) => s.vehicle_id === v.id));
  const summary = missing.schedules ? "" : due.total
    ? [due.overdue.length && `${due.overdue.length} overdue`, due.due.length && `${due.due.length} due soon`].filter(Boolean).join(" · ") || "Nothing due"
    : "No services set up yet";

  return (
    <>
      <ScreenBar crumbs={[{ to: "/workshop", label: "Workshop" }, { label: "Service" }]} title="Service" subtitle={summary} />
      {missing.schedules && (
        <Notice tone="danger" action={<Button variant="outline" className="h-12 rounded-lg bg-card" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button>}>
          Couldn't load the services. Check the connection.
        </Notice>
      )}
      {!missing.schedules && due.total === 0 && (
        <Notice>No services set up yet. Open a bus below and add its services, or its model page's service intervals in one go.</Notice>
      )}

      {!missing.schedules && GROUPS.map((g) => due[g.key].length > 0 && (
        <section key={g.key} aria-labelledby={`svc-${g.key}`} className="mb-5">
          <h3 id={`svc-${g.key}`} className="mb-2 text-body font-semibold text-muted-foreground">{g.title} <span className="tabular-nums">({due[g.key].length})</span></h3>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {due[g.key].map((item) => (
              <li key={item.schedule.id}>
                <Link to={`/workshop/bus/${item.vehicle.id}/service`} className="flex min-h-[4rem] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-secondary/60">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block font-semibold text-primary">{item.vehicle.name} · {item.schedule.service_type}</span>
                    <span className="block text-body-sm text-muted-foreground">{everyText(item.schedule)} · {lastText(item.schedule)}</span>
                  </span>
                  <span className="text-body-sm">{item.text}</span>
                  <StatusChip tone={STATE_TONE[item.state]}>{STATE_LABEL[item.state]}</StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!missing.schedules && bare.length > 0 && (
        <section aria-labelledby="svc-bare" className="mb-5">
          <h3 id="svc-bare" className="mb-2 text-body font-semibold text-muted-foreground">No services yet <span className="tabular-nums">({bare.length})</span></h3>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bare.map((v) => {
              const offers = v.guide && !missing.facts ? fromModelPage(facts, v.guide.id, []).length : 0;
              return (
              <li key={v.id}>
                <Link to={`/workshop/bus/${v.id}/service`} className="flex min-h-[3.5rem] items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary">
                  <Bus className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-primary">{v.name}</span>
                    <span className="block text-body-sm text-muted-foreground">{offers ? `Its model page has ${pluralize(offers, "service interval")} to add` : "Add its services"}</span>
                  </span>
                </Link>
              </li>
              );
            })}
          </ul>
          <p className="mt-2 text-body-sm text-muted-foreground">{pluralize(bare.length, "bus", "buses")} with nothing to remind about yet.</p>
        </section>
      )}
    </>
  );
}
