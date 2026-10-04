// Start / end a driver's shift, even with no signal: offline, the action is
// queued with the time it really happened and the screen updates right away.
// The queue uploads it when the tablet is back online (lib/offlineRunners).
import { enqueueJob, isOfflineError } from "@/lib/offlineJobs";
import { patchDriverSession } from "@/hooks/useDriverSession";

export async function shiftAction(invoke, action) {
  const client_request_id = crypto.randomUUID();
  const occurred_at = new Date().toISOString();
  try {
    return { ...(await invoke(action, { occurred_at, client_request_id })), queued: false };
  } catch (e) {
    if (!isOfflineError(e)) throw e;
    const device_id = localStorage.getItem("tt_driver_device_id");
    if (!device_id || !enqueueJob("driver_shift", { device_id, action, occurred_at, client_request_id }, action === "start_shift" ? "Start shift" : "End shift")) throw e;
    const shift = action === "start_shift" ? { id: `local-${Date.now()}`, started_at: occurred_at, offline: true } : null;
    patchDriverSession({ open_shift: shift });
    return { shift, queued: true };
  }
}
