import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Satellite } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { errorData } from "@/lib/requestError";
import { GPS_CHOICES, gpsReport } from "@/lib/tabletGpsAdmin";

// Admin → Kiosk tablets: choose a driver tablet's GPS (src/lib/tabletGpsAdmin.js).
export default function TabletGpsControls({ device, onRefresh }) {
  if (!device?.paired || device.status === "revoked" || device.kiosk_type !== "driver" || device.personal) return null;
  return <DriverGps device={device} onRefresh={onRefresh} />;
}

function DriverGps({ device, onRefresh }) {
  const [saving, setSaving] = useState(undefined);
  const report = gpsReport(device);
  const chosen = saving !== undefined ? saving : report.chosen;
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  // While the tablet hasn't switched yet, keep the list fresh so the result shows.
  useEffect(() => {
    if (!report.waiting) return undefined;
    const t = setInterval(() => refresh.current?.(), 10000);
    return () => clearInterval(t);
  }, [report.waiting]);
  const choose = async value => {
    if (value === report.chosen || saving !== undefined) return;
    setSaving(value);
    try {
      await base44.entities.KioskDevice.update(device.id, { gps_source: value });
      toast({
        title: value === "usb" ? "GPS: module" : value === "tablet" ? "GPS: tablet's own" : "GPS: set on the tablet",
        description: value ? `${device.label || "The tablet"} switches within a minute while the driver app is open.` : "The tablet keeps the GPS it is using now; it can be changed on the tablet again.",
      });
      await refresh.current?.();
    } catch (e) {
      toast({ title: "Couldn't change the GPS", description: errorData(e).error || e?.message || "Try again.", variant: "destructive" });
    } finally { setSaving(undefined); }
  };
  return (
    <div className="mt-2 space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5"><Satellite className="h-3.5 w-3.5" aria-hidden="true" /> GPS</span>
        <div role="radiogroup" aria-label={`GPS for ${device.label || "this tablet"}`} className="inline-flex flex-wrap rounded-lg border border-border p-0.5">
          {GPS_CHOICES.map(c => {
            const on = chosen === c.value;
            return (
              <button key={String(c.value)} type="button" role="radio" aria-checked={on} disabled={saving !== undefined}
                onClick={() => choose(c.value)}
                className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-60 ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <p role="status" className="text-xs text-muted-foreground">{report.text}</p>
    </div>
  );
}
