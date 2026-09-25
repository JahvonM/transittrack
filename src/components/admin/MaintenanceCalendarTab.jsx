import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Wrench } from "lucide-react";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function nextDueDate(s) {
  if (s.due_type !== "days") return null;
  // A schedule with no last_service_date yet (never serviced since it was
  // created) falls back to created_date as the baseline — otherwise it has
  // no due date at all and silently disappears from both the calendar grid
  // and the mileage sidebar (which only handles due_type "mileage").
  const baseDate = s.last_service_date ? new Date(s.last_service_date) : s.created_date ? new Date(s.created_date) : null;
  const interval = s.interval_days || 0;
  if (!baseDate || interval <= 0) return null;
  return new Date(baseDate.getTime() + interval * DAY_MS);
}

function fmtKey(d) {
  return d.toISOString().split("T")[0];
}

// Port of FleetPilot's MaintenanceCalendar — same month-grid + mileage
// sidebar layout, adapted to TransitTrack's MaintenanceSchedule shape
// (interval_days/interval_km, no separate `mileage` field on Vehicle —
// remaining km is computed off each vehicle's real current_odometer) and
// run as an admin tab rather than a standalone page: there's no
// /vehicles/:id route here, so entries are labeled by vehicle name
// instead of linking out.
export default function MaintenanceCalendarTab({ schedules = [], vehicles = [] }) {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const events = useMemo(() => {
    const map = new Map();
    for (const s of schedules) {
      if (s.status === "completed") continue;
      const due = nextDueDate(s);
      if (!due) continue;
      const key = fmtKey(due);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ schedule: s, due });
    }
    return map;
  }, [schedules]);

  const undated = useMemo(
    () => schedules.filter((s) => s.status !== "completed" && s.due_type === "mileage"),
    [schedules]
  );

  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const startDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayKey = fmtKey(new Date());

  const eventColor = (due, status) => {
    if (status === "overdue") return "bg-red-500 text-white";
    const diffDays = Math.ceil((due.getTime() - Date.now()) / DAY_MS);
    if (diffDays < 0) return "bg-red-500 text-white";
    if (diffDays <= 14) return "bg-amber-500 text-white";
    return "bg-primary text-primary-foreground";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Maintenance calendar</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[140px] text-center">{monthLabel}</span>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            Today
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-3 md:p-4">
            <div className="grid grid-cols-7 mb-2">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.map((date, i) => {
                if (!date) return <div key={i} className="min-h-[84px] rounded-lg bg-muted/40" />;
                const key = fmtKey(date);
                const dayEvents = events.get(key) || [];
                const isToday = key === todayKey;
                return (
                  <div
                    key={i}
                    className={`min-h-[84px] rounded-lg border p-1.5 flex flex-col gap-1 ${
                      isToday ? "border-primary ring-1 ring-primary" : "border-border"
                    }`}
                  >
                    <span className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {date.getDate()}
                    </span>
                    <div className="space-y-1 overflow-hidden">
                      {dayEvents.map(({ schedule: s, due }) => (
                        <div
                          key={s.id}
                          className={`rounded px-1 py-0.5 text-[10px] leading-tight truncate ${eventColor(due, s.status)}`}
                          title={`${s.vehicle_name} — ${s.service_type}`}
                        >
                          {s.vehicle_name} · {s.service_type}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold">Mileage-based (no fixed date)</h2>
            </div>
            {undated.length === 0 ? (
              <p className="text-xs text-muted-foreground">None.</p>
            ) : (
              <div className="space-y-2">
                {undated.map((s) => {
                  const v = vehicleMap.get(s.vehicle_id);
                  const nextKm = (s.last_service_mileage || 0) + (s.interval_km || 0);
                  const remaining = nextKm - (v?.current_odometer || 0);
                  return (
                    <div key={s.id} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate">{s.vehicle_name}</span>
                        <Badge className={remaining <= 0 ? "bg-red-500 text-white hover:bg-red-500" : remaining <= 500 ? "bg-amber-500 text-white hover:bg-amber-500" : ""}>
                          {remaining <= 0 ? "Overdue" : `${remaining.toLocaleString()} km left`}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.service_type}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
