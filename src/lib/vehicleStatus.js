// Shared vehicle status -> map pin color, used by MapboxMap and per-marker components.
const STATUS_COLORS = {
  on_trip: "#38bdf8",
  idle: "#94a3b8",
  speeding: "#f59e0b",
  emergency: "#ef4444",
  offline: "#64748b",
};

export function statusColor(status) {
  return STATUS_COLORS[status] || "#38bdf8";
}
