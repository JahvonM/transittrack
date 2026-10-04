import React from "react";
import { ChevronRight, CircleCheck, Navigation, Route as RouteIcon, ScanLine, TriangleAlert, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeckButton } from "@/components/driver/cockpit/CockpitParts";
import { sortStops } from "@/components/passenger/passengerState";

/**
 * The driver's start screen: is the bus ready, which route, and one big
 * action. Before a shift that's Start shift; during one, it's opening the
 * Drive screen (shift and tracking stay separate actions).
 */
export default function DriverHome({ session, shiftControl, shiftOpen, offline, dueInspections = [], onStartInspection, onOpenDrive, onOpenStops, trips }) {
  const route = session?.route;
  const stops = sortStops(route?.stops);
  const pickups = (session?.staff || []).filter((p) => !p.skip_pickup_today).length;
  const required = dueInspections.some((t) => t.driver_required);

  const checks = [
    dueInspections.length
      ? { ok: false, icon: ScanLine, text: `${dueInspections[0].name || "Inspection"} due${required ? " before you drive" : ""}` }
      : { ok: true, icon: CircleCheck, text: "Inspections done" },
    offline ? { ok: false, icon: WifiOff, text: "Offline. Work is saved on this tablet" } : { ok: true, icon: CircleCheck, text: "Connected" },
    route ? { ok: true, icon: CircleCheck, text: "Route assigned" } : { ok: false, icon: TriangleAlert, text: "No route assigned. Ask dispatch" },
  ];
  const ready = checks.every((c) => c.ok);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <section
        className={cn("rounded-2xl border p-4", ready ? "border-primary/60 bg-primary/10" : "border-warning/40 bg-warning/12")}
        aria-label="Readiness"
      >
        <p className="flex items-center gap-2 text-title-sm font-bold">
          {ready ? <CircleCheck className="h-5 w-5 text-primary" aria-hidden="true" /> : <TriangleAlert className="h-5 w-5 text-warning" aria-hidden="true" />}
          {ready ? (shiftOpen ? "On shift, ready to drive" : "Ready to drive") : "Before you drive"}
        </p>
        <ul className="mt-2 space-y-1">
          {checks.map(({ ok, icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2 text-body-sm">
              <Icon className={cn("h-4 w-4 shrink-0", ok ? "text-success" : "text-warning")} aria-hidden="true" />
              <span className={ok ? "text-muted-foreground" : "font-semibold"}>{text}</span>
            </li>
          ))}
        </ul>
        {dueInspections.length > 0 && (
          <button type="button" onClick={() => onStartInspection(dueInspections[0])} className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-background font-semibold hover:bg-accent">
            <ScanLine className="h-5 w-5" aria-hidden="true" /> Start inspection
          </button>
        )}
      </section>

      {route && (
        <button type="button" onClick={onOpenStops} className="flex min-h-[88px] w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left hover:bg-accent">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary" aria-hidden="true">
            <RouteIcon className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-title-sm font-bold">{route.name || "Your route"}</span>
            {stops.length > 1 && <span className="block truncate text-body-sm text-muted-foreground">{stops[0].name} to {stops[stops.length - 1].name}</span>}
            <span className="block text-body-sm text-muted-foreground">{stops.length} stops · {pickups} pickup{pickups === 1 ? "" : "s"} today</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      )}

      {shiftOpen ? (
        <div className="grid grid-cols-2 gap-2">
          {shiftControl}
          <DeckButton icon={Navigation} state="Map and directions" action="Open Drive" onClick={onOpenDrive} primary />
        </div>
      ) : (
        <div className="[&_button]:min-h-[96px]">{shiftControl}</div>
      )}

      {trips}
    </div>
  );
}
