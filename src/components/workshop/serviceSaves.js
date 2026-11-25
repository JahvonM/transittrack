import { base44 } from "@/api/base44Client";
import { doneData, odometerOf, savedStatus, serviceState } from "@/lib/serviceDue";

// The saves a service needs, from the bus's Service section and from a
// job's Mark done.

// A service done on a day at a reading: its last date and km, and the status
// the rules give it now (kept for the older screens).
export async function markServiceDone(schedule, done, { odometer = 0, reminderDays } = {}) {
  const data = doneData(done, schedule);
  data.status = savedStatus(serviceState({ ...schedule, ...data }, { odometer, reminderDays }).state);
  return base44.entities.MaintenanceSchedule.update(schedule.id, data);
}

// A newer odometer reading moves the bus's up (never down from here). Gives
// the bus's record as saved, or null when nothing changed.
export async function raiseOdometer(vehicle, reading) {
  if (!(Number(reading) > odometerOf(vehicle))) return null;
  const saved = await base44.entities.Vehicle.update(vehicle.id, { current_odometer: Number(reading) });
  return { ...vehicle.record, ...(saved?.id ? saved : {}), current_odometer: Number(reading) };
}
