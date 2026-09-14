export const MAPBOX_TOKEN =
  "pk.eyJ1IjoiZG9udGUxMjMiLCJhIjoiY210cDR4eGV5MDJvcjJ5b25nMGw4ZjlvdyJ9.f3EfmLY4lHy6IrtERYvD7A";

// Standard Mapbox Streets style — clear, high-contrast roads/labels and
// saturated land/water/park colors so the map reads well even before any
// vehicles are on it (the earlier ultra-light style washed out to near-blank).
export const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";

// Thresholds (metres / km / kmh)
export const PROXIMITY_TRIGGER_M = 500;
export const ATTENDANCE_TRIGGER_M = 1500; // ~15 min walk / close proximity
export const SPEEDING_THRESHOLD_KMH = 100;
export const TRAIL_MAX = 60;
export const GPS_INTERVAL_MS = 5000;

// Normalise a phone number for wa.me (strip non-digits, ensure no leading +)
export function waNumber(phone) {
  if (!phone) return "";
  return String(phone).replace(/[^\d]/g, "");
}

// Build a wa.me click-to-chat link with a pre-filled message
export function waLink(phone, message) {
  const num = waNumber(phone);
  const text = encodeURIComponent(message || "");
  return num ? `https://wa.me/${num}${text ? `?text=${text}` : ""}` : `https://wa.me/?text=${text}`;
}

export const SOS_MESSAGE =
  "🚨 SOS Alert: The staff bus has encountered a mechanical delay. A backup vehicle is being dispatched immediately.";