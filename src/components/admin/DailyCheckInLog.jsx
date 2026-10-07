import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/admin/kit";
import { Card, CardContent } from "@/components/ui/card";
import { FileSpreadsheet, LogIn, LogOut, RefreshCw, Bus } from "lucide-react";
import { exportToCSV } from "@/lib/exporters";
import BusLoader from "@/components/BusLoader";
import EmptyState from "@/components/EmptyState";
import { loadFailed } from "@/lib/loadFailed";

const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
const dayOf = (iso) => new Date(iso).toLocaleDateString("en-CA");
const dayLabel = (key) => new Date(`${key}T12:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
const hoursOf = (mins) => (mins / 60).toFixed(1);

function shiftMinutes(s) {
  if (s.duration_minutes != null) return s.duration_minutes;
  return Math.max(0, Math.round((Date.now() - new Date(s.started_at).getTime()) / 60000));
}

const EXPORT_COLS = [
  { key: "day", label: "Day" },
  { key: "shift", label: "Shift" },
  { key: "vehicle_name", label: "Bus" },
  { key: "staff_name", label: "Passenger" },
  { key: "status", label: "Status" },
  { key: "check_in_method", label: "Method" },
  { key: "boarded_at", label: "Time" },
];

// The day's log. Every bus is grouped under the day it was used, with the
// driver's shift shown beside the sign-ins it covers — so an admin can see who
// rode when, and which shift they were on, without matching two screens up by
// hand. A shift's window (start to end) decides which events belong to it.
export default function DailyCheckInLog() {
  const [records, setRecords] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [checkIns, shiftRows] = await Promise.all([
        base44.entities.StaffCheckIn.list("-created_date", 500),
        base44.entities.DriverShift.list("-started_at", 300),
      ]);
      setRecords(checkIns || []);
      setShifts(shiftRows || []);
    } catch {
      loadFailed(load);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const days = useMemo(() => {
    const byDay = new Map();
    for (const r of records) {
      const at = r.boarded_at || r.created_date;
      if (!at) continue;
      const key = dayOf(at);
      if (!byDay.has(key)) byDay.set(key, new Map());
      const byBus = byDay.get(key);
      const busKey = r.vehicle_id || r.vehicle_name || "unknown";
      if (!byBus.has(busKey)) byBus.set(busKey, { key: busKey, name: r.vehicle_name || "Unknown bus", company: r.company_name || "", rows: [] });
      byBus.get(busKey).rows.push(r);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, byBus]) => ({
        key,
        buses: [...byBus.values()].map((bus) => ({
          ...bus,
          rows: [...bus.rows].sort((a, b) => new Date(a.boarded_at || a.created_date) - new Date(b.boarded_at || b.created_date)),
          shifts: shifts
            .filter((s) => s.vehicle_id === bus.key && s.started_at && dayOf(s.started_at) === key)
            .sort((a, b) => new Date(a.started_at) - new Date(b.started_at)),
        })),
      }));
  }, [records, shifts]);

  const exportCsv = () => {
    const rows = [];
    for (const day of days) {
      for (const bus of day.buses) {
        for (const r of bus.rows) {
          const shift = bus.shifts.find((s) => {
            const at = new Date(r.boarded_at || r.created_date).getTime();
            const from = new Date(s.started_at).getTime();
            const to = s.ended_at ? new Date(s.ended_at).getTime() : Infinity;
            return at >= from && at <= to;
          });
          rows.push({
            ...r,
            day: day.key,
            shift: shift ? `${timeOf(shift.started_at)} – ${shift.ended_at ? timeOf(shift.ended_at) : "open"}` : "No shift",
            boarded_at: r.boarded_at ? new Date(r.boarded_at).toLocaleString() : "",
          });
        }
      }
    }
    exportToCSV("daily-checkin-log", EXPORT_COLS, rows);
  };

  if (loading) return <BusLoader className="py-8" />;
  if (!days.length) return <EmptyState text="No check-ins recorded yet." />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <FileSpreadsheet className="w-4 h-4" /> Excel
        </Button>
        <Button size="sm" variant="outline" className="ml-2" onClick={load}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {days.map((day) => (
        <div key={day.key} className="space-y-3">
          <h3 className="font-heading text-title-sm font-bold">{dayLabel(day.key)}</h3>
          {day.buses.map((bus) => (
            <Card key={bus.key}>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Bus className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                  <span className="font-semibold">{bus.name}</span>
                  {bus.company && <span className="text-xs text-muted-foreground">{bus.company}</span>}
                  <span className="ml-auto flex flex-wrap items-center gap-1.5">
                    {bus.shifts.length ? bus.shifts.map((s) => (
                      <StatusChip key={s.id} tone={s.ended_at ? "neutral" : "success"}>
                        Shift {timeOf(s.started_at)} – {s.ended_at ? timeOf(s.ended_at) : "now"} · {hoursOf(shiftMinutes(s))} h
                      </StatusChip>
                    )) : (
                      <StatusChip tone="neutral">No driver shift logged</StatusChip>
                    )}
                  </span>
                </div>

                <div className="divide-y divide-border">
                  {bus.rows.map((r) => {
                    const boarded = r.status === "boarded";
                    return (
                      <div key={r.id} className="flex items-center gap-3 py-2">
                        <div className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${boarded ? "bg-success/15 text-success" : "bg-info/15 text-info"}`}>
                          {boarded ? <LogIn className="w-3.5 h-3.5" /> : <LogOut className="w-3.5 h-3.5" />}
                        </div>
                        <span className="flex-1 min-w-0 truncate font-medium">{r.staff_name || "Unknown passenger"}</span>
                        <span className="text-xs text-muted-foreground uppercase shrink-0">{r.check_in_method || "manual"}</span>
                        <span className="tabular-nums text-sm shrink-0">{timeOf(r.boarded_at || r.created_date)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}