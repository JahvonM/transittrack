import {
  CircleCheck, TriangleAlert, OctagonAlert, Info, WifiOff, Radio, Circle,
  Navigation, PauseCircle, Gauge, Siren, Wrench,
} from "lucide-react";

// Status tones. Lime ("live") is the brand accent and marks live/active
// things only; the other tones use the fixed status palette in index.css.
// Every tone ships with an icon so status is never shown by colour alone.
export const TONES = {
  // Live text stays in the foreground colour (lime-on-tint is too faint in the
  // light theme); the lime icon/dot/edge carries the brand cue.
  live: { text: "text-foreground", fg: "text-primary", soft: "bg-primary/12 border-primary/35", solid: "bg-primary text-primary-foreground", dot: "bg-primary", icon: Radio },
  success: { text: "text-success", soft: "bg-success/12 border-success/35", solid: "bg-success text-success-foreground", dot: "bg-success", icon: CircleCheck },
  warning: { text: "text-warning", soft: "bg-warning/12 border-warning/35", solid: "bg-warning text-warning-foreground", dot: "bg-warning", icon: TriangleAlert },
  danger: { text: "text-danger", soft: "bg-danger/12 border-danger/40", solid: "bg-danger text-danger-foreground", dot: "bg-danger", icon: OctagonAlert },
  info: { text: "text-info", soft: "bg-info/12 border-info/35", solid: "bg-info text-info-foreground", dot: "bg-info", icon: Info },
  offline: { text: "text-offline", soft: "bg-offline/12 border-offline/35", solid: "bg-offline text-offline-foreground", dot: "bg-offline", icon: WifiOff },
  neutral: { text: "text-muted-foreground", soft: "bg-muted border-border", solid: "bg-secondary text-secondary-foreground", dot: "bg-muted-foreground", icon: Circle },
};

export function toneOf(tone) {
  const t = TONES[tone] || TONES.neutral;
  return { ...t, fg: t.fg || t.text };
}

// Display metadata for Vehicle.status values. Presentation only: it does not
// decide a vehicle's status, it only describes the value already stored.
const VEHICLE = {
  on_trip: { tone: "live", label: "On trip", icon: Navigation },
  idle: { tone: "neutral", label: "Idle", icon: PauseCircle },
  speeding: { tone: "warning", label: "Speeding", icon: Gauge },
  emergency: { tone: "danger", label: "Emergency", icon: Siren },
  offline: { tone: "offline", label: "Offline", icon: WifiOff },
  maintenance: { tone: "warning", label: "Maintenance", icon: Wrench },
};

export function vehicleStatusMeta(status) {
  if (VEHICLE[status]) return VEHICLE[status];
  const label = String(status || "unknown").replace(/_/g, " ");
  return { tone: "neutral", label: label.charAt(0).toUpperCase() + label.slice(1), icon: Circle };
}

// How fresh a live location is. Thresholds are display defaults only and can
// be overridden by callers that already have their own rule.
export function freshnessOf(updatedAt, { now = Date.now(), liveMs = 2 * 60_000, lostMs = 10 * 60_000 } = {}) {
  const t = updatedAt ? new Date(updatedAt).getTime() : NaN;
  if (!Number.isFinite(t)) return { state: "unknown", ageMs: null };
  const ageMs = Math.max(0, now - t);
  return { state: ageMs <= liveMs ? "live" : ageMs <= lostMs ? "stale" : "lost", ageMs };
}

export function formatAge(ageMs) {
  if (ageMs == null) return "";
  const s = Math.round(ageMs / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
