// Shared vehicle status -> map pin color, used by MapboxMap and per-marker components.
// Pins are always drawn as dark tiles (see VehicleMarker), so these read on
// both the dark and light basemaps. Lime = on trip matches the app accent.
const STATUS_COLORS = {
  on_trip: "#D6F54A",
  idle: "#9ca3af",
  speeding: "#f59e0b",
  emergency: "#ef4444",
  offline: "#6b7280",
};

export function statusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.on_trip;
}
