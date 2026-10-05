// Reads historical points independently of the bus's current online/GPS status.
export function replayDay(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export async function latestReplayDay(store, vehicleId) {
  const rows = await store.filter({ vehicle_id: vehicleId }, "-recorded_at", 1);
  const date = new Date(rows?.[0]?.recorded_at);
  return Number.isFinite(date.getTime()) ? replayDay(date) : null;
}
export async function loadReplayDay(store, vehicleId, day) {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const inDay = p => {
    const t = Date.parse(p.recorded_at);
    return t >= start.getTime() && t < end.getTime();
  };
  const query = { vehicle_id: vehicleId, recorded_at: { $gte: start.toISOString(), $lt: end.toISOString() } };
  const result = [];
  const size = 1000;
  try {
    for (let skip = 0; ; skip += size) {
      const rows = await store.filter(query, "recorded_at", size, skip);
      result.push(...rows.filter(inDay));
      if (rows.length < size) return result;
    }
  } catch {
    // Stores without range queries: page newest-first until past the requested day.
    const result = [];
    for (let skip = 0; ; skip += size) {
      const rows = await store.filter({ vehicle_id: vehicleId }, "-recorded_at", size, skip);
      result.push(...rows.filter(inDay));
      if (rows.length < size || rows.some(p => Date.parse(p.recorded_at) < start.getTime())) return result;
    }
  }
}
