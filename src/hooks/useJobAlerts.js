import { useEffect, useRef } from "react";
import { jobVersion } from "@/lib/jobs";
import { jobDoneHere } from "@/lib/driverJobs";

const seenKey = (deviceId) => `tt_jobs_seen_${deviceId}`;
const brief = (t) => ({ id: t.id, job_type: t.job_type, pickup_name: t.pickup_name, dropoff_name: t.dropoff_name, scheduled_time: t.scheduled_time });

// Tells the driver when dispatch gives this bus a job, changes one, or takes
// one off it (cancelled or moved to another bus). What the tablet has seen is
// kept on the tablet, so a job given while it was off or locked still gets
// its alert, and a restart doesn't repeat old ones. The first time ever, the
// jobs already there are taken as seen.
// trips: the jobs from the server; ready: the server sent the jobs (the
// tablet is unlocked), so an empty list really means no jobs.
export default function useJobAlerts(trips, deviceId, ready, onAlerts) {
  const onAlertsRef = useRef(onAlerts);
  onAlertsRef.current = onAlerts;
  useEffect(() => {
    if (!ready || !deviceId || !Array.isArray(trips)) return;
    let seen = null;
    try { seen = JSON.parse(localStorage.getItem(seenKey(deviceId)) || "null"); } catch { seen = null; }
    const next = Object.fromEntries(trips.map((t) => [t.id, { v: jobVersion(t), s: t.status, j: brief(t) }]));
    if (seen && typeof seen === "object") {
      const alerts = [];
      for (const t of trips) {
        if (!seen[t.id]) alerts.push({ kind: "new", job: t });
        else if (seen[t.id].v !== next[t.id].v) alerts.push({ kind: "changed", job: t });
      }
      for (const [id, before] of Object.entries(seen)) {
        if (!next[id] && before?.s !== "completed" && !jobDoneHere(id)) alerts.push({ kind: "removed", job: before?.j || { id } });
      }
      if (alerts.length) onAlertsRef.current?.(alerts);
    }
    try { localStorage.setItem(seenKey(deviceId), JSON.stringify(next)); } catch { /* storage unavailable */ }
  }, [trips, deviceId, ready]);
}
