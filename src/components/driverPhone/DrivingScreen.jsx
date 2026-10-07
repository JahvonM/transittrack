import React from "react";
import { Bus } from "lucide-react";

// Covers the whole app while the bus is moving: nothing to read or tap.
// It lifts by itself once the bus has been stopped for a few seconds.
export default function DrivingScreen({ busName, waiting, sendingGps }) {
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="driving-title" aria-describedby="driving-body"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <span className="grid h-24 w-24 place-items-center rounded-full bg-primary/15" aria-hidden="true">
        <Bus className="h-12 w-12 text-primary" />
      </span>
      <h1 id="driving-title" className="text-display">Driving</h1>
      <p id="driving-body" className="max-w-xs text-title-sm font-medium text-muted-foreground">
        Eyes on the road{busName ? `, ${busName}` : ""}. The app opens again when the bus stops.
      </p>
      {waiting > 0 && <p className="text-body text-muted-foreground">{waiting} new message{waiting === 1 ? "" : "s"} waiting</p>}
      {sendingGps && <p className="text-body-sm font-semibold text-primary">Sending the bus position (backup GPS)</p>}
    </div>
  );
}
