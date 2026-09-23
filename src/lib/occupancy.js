// Given a flat list of StaffCheckIn records (any vehicles, any order),
// returns { [vehicle_id]: count } of people currently aboard each vehicle —
// a person is identified by card_tag when they have one, else by name
// (mirrors kioskCheckIn's own nextStatus() matching), and only their MOST
// RECENT check-in for that vehicle decides whether they're still aboard.
export function computeOccupancyByVehicle(checkIns) {
  const latest = new Map();
  for (const c of checkIns || []) {
    if (!c.vehicle_id) continue;
    const personKey = c.card_tag || c.staff_name;
    const key = `${c.vehicle_id}::${personKey}`;
    const existing = latest.get(key);
    if (!existing || new Date(c.created_date) > new Date(existing.created_date)) {
      latest.set(key, c);
    }
  }
  const counts = {};
  for (const rec of latest.values()) {
    if (rec.status === "boarded") counts[rec.vehicle_id] = (counts[rec.vehicle_id] || 0) + 1;
  }
  return counts;
}

// Same as above but scoped to one vehicle, for callers that already filtered
// (or only ever fetch) a single vehicle's check-ins.
export function computeOccupancy(checkIns, vehicleId) {
  return computeOccupancyByVehicle(checkIns)[vehicleId] || 0;
}
