// The day as the office means it: the date in Grenada (UTC−4 all year),
// whatever the phone's own clock or time zone. new Date().toISOString() gives
// the date in London instead, which after 8 pm in Grenada is already tomorrow.
export const GRENADA = "America/Grenada";

// Today in Grenada, as 2026-11-24.
export const grenadaToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: GRENADA });

// The Grenada day of a moment (a timestamp or a Date), as 2026-11-24; "" when
// it isn't one.
export function grenadaDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : grenadaToday(d);
}
