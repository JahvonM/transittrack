import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip, PageActions, PageIntro, Segmented } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import BusLoader from "@/components/BusLoader";
import EmptyState from "@/components/EmptyState";
import { loadFailed } from "@/lib/loadFailed";

const RANGES = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
];

const hours = (mins) => (mins / 60).toFixed(1);

function shiftMinutes(s) {
  if (s.duration_minutes != null) return s.duration_minutes;
  // Still open: count up to now.
  return Math.max(0, Math.round((Date.now() - new Date(s.started_at).getTime()) / 60000));
}

// How a shift began: the driver's phone scanning the bus tablet names the
// driver for certain; a tablet start uses whoever is assigned to the bus.
const startedWith = (s) => (s.started_with === "phone" ? "Driver app" : "Tablet");

const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");

// Driver shift log: hours per driver for the chosen range plus every shift.
export default function ShiftsTab() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const load = async () => {
    try {
      setShifts(await base44.entities.DriverShift.list("-started_at", 1000));
    } catch {
      loadFailed(load);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const inRange = useMemo(() => {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return shifts.filter((s) => new Date(s.started_at).getTime() >= since);
  }, [shifts, days]);

  const byDriver = useMemo(() => {
    const map = new Map();
    for (const s of inRange) {
      const key = s.driver_email || s.driver_name || s.vehicle_name || "Unknown";
      const row = map.get(key) || { name: s.driver_name || s.driver_email || "Unknown driver", vehicles: new Set(), minutes: 0, shifts: 0, open: false };
      row.minutes += shiftMinutes(s);
      row.shifts += 1;
      if (s.vehicle_name) row.vehicles.add(s.vehicle_name);
      if (!s.ended_at) row.open = true;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [inRange]);

  const exportCsv = () => {
    const rows = [["Driver", "Email", "Vehicle", "Started with", "Started", "Ended", "Hours"]].concat(
      inRange.map((s) => [s.driver_name || "", s.driver_email || "", s.vehicle_name || "", startedWith(s), s.started_at || "", s.ended_at || "", hours(shiftMinutes(s))])
    );
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `driver-shifts-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) return <BusLoader className="py-8" />;

  return (
    <div className="space-y-4">
      <PageIntro>Drivers start shifts by scanning the bus tablet with the driver app, or with the bus PIN on the tablet. "Driver app" shifts name the driver who scanned.</PageIntro>
      <PageActions>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!inRange.length}>
          <Download className="w-4 h-4" /> CSV
        </Button>
      </PageActions>
      <Segmented label="Time range" value={days} onChange={setDays} options={RANGES.map((r) => ({ value: r.id, label: r.label }))} />

      {!inRange.length ? (
        <EmptyState text="No shifts yet. They appear here once a driver starts a shift with the driver app or on the bus tablet." />
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Hours by driver · last {days} days</CardTitle></CardHeader>
            <CardContent className="divide-y divide-border">
              {byDriver.map((d) => (
                <div key={d.name} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {d.name}
                      {d.open && <StatusChip tone="success">On shift</StatusChip>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{d.shifts} shift{d.shifts === 1 ? "" : "s"} · {[...d.vehicles].join(", ") || "—"}</div>
                  </div>
                  <div className="text-right font-semibold tabular-nums">{hours(d.minutes)} h</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">All shifts</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto" tabIndex={0} role="region" aria-label="All shifts table">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-2 pr-3">Driver</th><th className="py-2 pr-3">Vehicle</th><th className="py-2 pr-3">Started with</th><th className="py-2 pr-3">Started</th><th className="py-2 pr-3">Ended</th><th className="py-2 text-right">Hours</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inRange.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 pr-3">{s.driver_name || s.driver_email || "—"}</td>
                      <td className="py-2 pr-3">{s.vehicle_name || "—"}</td>
                      <td className="py-2 pr-3">{s.started_with === "phone" ? <StatusChip tone="info" dot={false}>Driver app</StatusChip> : <span className="text-muted-foreground">Tablet</span>}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{fmt(s.started_at)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{s.ended_at ? fmt(s.ended_at) : <StatusChip tone="success">On shift</StatusChip>}</td>
                      <td className="py-2 text-right tabular-nums">{hours(shiftMinutes(s))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
