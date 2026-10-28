import { fleetStatus } from "@/components/admin/AdminOverview";
import { busSharedBy } from "@/lib/companyPortal";

// A bus's status as the company sees it: off shift (no position), or the
// usual live status while its location is shared with them.
export function companyBusStatus(v, now = Date.now()) {
  const why = busSharedBy(v);
  if (!why) return { key: "hidden", label: "Off shift", tone: "offline" };
  const st = fleetStatus(v, now);
  return st.key === "live" ? { ...st, label: why === "job" ? "On your job" : "On shift" } : st;
}
