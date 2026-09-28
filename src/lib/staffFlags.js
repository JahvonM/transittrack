// "Skip pickup today" and "I'm running late" switch themselves off: each is
// stored with an expiry, and a flag without one (set before expiries were
// added) counts as off. driverSession applies the same rule for the driver.

export const LATE_HOURS = 2;

export function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

export function flagActive(on, until) {
  return !!on && !!until && new Date(until).getTime() > Date.now();
}

export const skipActive = (u) => flagActive(u?.skip_pickup_today, u?.skip_pickup_until);
export const lateActive = (u) => flagActive(u?.late_snooze_active, u?.late_until);
