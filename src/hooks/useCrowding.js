import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { computeOccupancyByVehicle } from "@/lib/occupancy";

const WINDOW_MS = 12 * 60 * 60 * 1000; // ignore boardings older than a shift
const REFRESH_MS = 60 * 1000;

// People aboard each of a company's vehicles, from recent kiosk check-ins.
// Returns { [vehicle_id]: count }.
export default function useCrowding(companyId) {
  const [counts, setCounts] = useState({});
  useEffect(() => {
    if (!companyId) return undefined;
    let cancelled = false;
    const load = () =>
      base44.entities.StaffCheckIn.filter({ company_id: companyId }, "-created_date", 500)
        .then((rows) => {
          if (cancelled) return;
          const since = Date.now() - WINDOW_MS;
          setCounts(computeOccupancyByVehicle(rows.filter((r) => new Date(r.created_date).getTime() >= since)));
        })
        .catch(() => {});
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [companyId]);
  return counts;
}

// How full a vehicle is, for passengers. Status colours are paired with a
// text label so crowding never relies on colour alone.
export function crowdLevel(count, capacity) {
  if (!capacity) return count ? { label: `${count} aboard`, tone: "muted" } : null;
  const ratio = count / capacity;
  if (ratio >= 0.9) return { label: "Full", tone: "full", detail: `${count}/${capacity}` };
  if (ratio >= 0.6) return { label: "Filling up", tone: "busy", detail: `${count}/${capacity}` };
  return { label: "Seats available", tone: "free", detail: `${count}/${capacity}` };
}
