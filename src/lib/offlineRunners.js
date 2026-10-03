import { deviceRequest } from "@/lib/deviceAuth";
// Runners for the offline job queue. Registered once at startup (main.jsx)
// so queued work uploads on reconnect no matter which screen is open.
import { base44 } from "@/api/base44Client";
import { registerRunner, startOfflineSync } from "@/lib/offlineJobs";

// Mechanic inspection: result rows, then faults, then the vehicle's
// last-inspection date, each step in one request. Finished steps are cleared
// from the payload via `save`, so a retry after a drop resumes at the step
// that didn't make it instead of duplicating rows.
export async function runMechanicInspection(payload, save = () => {}) {
  let p = { ...payload };
  if (p.results.length) {
    await base44.entities.InspectionResult.bulkCreate(p.results);
    p = { ...p, results: [] };
    save(p);
  }
  if (p.faults.length) {
    await base44.entities.Fault.bulkCreate(p.faults);
    p = { ...p, faults: [] };
    save(p);
  }
  if (p.vehicle_id && !p.vehicle_updated) {
    await base44.entities.Vehicle.update(p.vehicle_id, { last_inspection_date: p.date.slice(0, 10) });
    p = { ...p, vehicle_updated: true };
    save(p);
  }
}

// Driver pre-trip check from a paired tablet (no login; goes through the
// driver session with the tablet's device id).
export async function runDriverInspection(payload) {
  const res = await base44.functions.invoke("driverSession", deviceRequest(payload.device_id, { ...payload, action: "submit_inspection" }));
  return res.data;
}

// Driver X-ray inspection from a template; photos travel inside the payload.
export async function runDriverTemplateInspection(payload) {
  const res = await base44.functions.invoke("driverSession", deviceRequest(payload.device_id, { ...payload, action: "submit_template_inspection" }));
  return res.data;
}

// Shift start/end made with no signal; carries the time it really happened.
export async function runDriverShift(payload) {
  const res = await base44.functions.invoke("driverSession", deviceRequest(payload.device_id, payload));
  return res.data;
}

export function installOfflineRunners() {
  registerRunner("driver_shift", runDriverShift);
  registerRunner("mechanic_inspection", runMechanicInspection);
  registerRunner("driver_inspection", runDriverInspection);
  registerRunner("driver_template_inspection", runDriverTemplateInspection);
  startOfflineSync();
}
