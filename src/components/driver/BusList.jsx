import React from "react";
import { Bus } from "lucide-react";

// The company's buses as big tap targets: free buses first, then the bus this
// device is on now and buses with a driver on shift elsewhere (not tappable).
// Used by a driver's own phone (Choose bus) and a bus's tablet (Switch bus).
export default function BusList({ buses, currentId = null, pickingId = "", disabled = false, onPick, pickLabel = "Drive this bus", pickingLabel = "Choosing…", emptyText }) {
  if (buses === null) return <p className="py-8 text-center text-muted-foreground" role="status">Loading buses…</p>;
  if (buses.length === 0) return <p className="rounded-xl border px-4 py-6 text-center text-muted-foreground">{emptyText}</p>;
  const free = buses.filter((b) => !b.busy && b.id !== currentId);
  const current = buses.filter((b) => b.id === currentId);
  const taken = buses.filter((b) => b.busy && b.id !== currentId);
  const unavailable = (bus, note) => (
    <li key={bus.id} className="flex min-h-[64px] items-center gap-4 rounded-2xl border border-dashed px-4 text-muted-foreground">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden="true"><Bus className="h-6 w-6" /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body">{bus.name}</span>
        <span className="text-body-sm">{note}</span>
      </span>
    </li>
  );
  return (
    <ul className="flex flex-col gap-2">
      {free.map((bus) => (
        <li key={bus.id}>
          <button
            type="button"
            onClick={() => onPick(bus)}
            disabled={disabled || !!pickingId}
            className="flex min-h-[72px] w-full items-center gap-4 rounded-2xl border bg-card px-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Bus className="h-6 w-6" /></span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body font-semibold">{bus.name}</span>
              {bus.plate_number && <span className="text-body-sm text-muted-foreground">{bus.plate_number}</span>}
            </span>
            <span className="shrink-0 text-body-sm font-medium text-primary">{pickingId === bus.id ? pickingLabel : pickLabel}</span>
          </button>
        </li>
      ))}
      {current.map((bus) => unavailable(bus, "This tablet is on this bus now"))}
      {taken.map((bus) => unavailable(bus, "Another driver is on shift"))}
    </ul>
  );
}
