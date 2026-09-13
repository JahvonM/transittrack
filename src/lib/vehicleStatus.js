// Shared vehicle status -> map pin color, used by MapboxMap and per-marker components.
// Palette tuned to read like a consumer location-sharing app (bright, saturated,
// high-contrast against the light basemap) rather than muted dashboard tones.
const STATUS_COLORS = {
  on_trip: "#22c55e", // moving — green, like an active/driving member
  idle: "#9ca3af", // parked/stationary — neutral gray
  speeding: "#f59e0b", // amber warning
  emergency: "#ef4444", // red alert
  offline: "#6b7280", // dimmed gray
};

export function statusColor(status) {
  return STATUS_COLORS[status] || "#22c55e";
}
