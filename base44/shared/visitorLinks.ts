// Private ride-tracking links for guests (the /track page in the app).
// Used by visitorTracking (dispatch copies a link) and bookingRequest (the
// link is emailed to the customer who booked on the website).
//
// The key is 256 random bits, kept only as a SHA-256 hash in VerificationGrant
// (purpose 'visitor_tracking', subject = the trip). It travels after # in the
// link, so it never reaches a server in an address or a referrer. A new link
// for a trip ends the older ones. A link lasts until a day after the ride
// (at least a day, at most a week) and stops working if the bus changes.

export const VISITOR_SITE = 'https://app.mcsweenstransport.com';
export const trackingUrl = (token: string) => `${VISITOR_SITE}/track#trip=${token}`;
export const CLOSED_TRIP = ['completed', 'cancelled'];

export async function sha256Hex(value: string) {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data), (x) => x.toString(16).padStart(2, '0')).join('');
}

export function linkExpiry(trip: { scheduled_time?: string }, now = Date.now()) {
  const planned = Date.parse(trip?.scheduled_time || '') || now;
  return new Date(Math.min(now + 7 * 86400_000, Math.max(now + 86400_000, planned + 86400_000))).toISOString();
}

// A fresh link for a job that has a bus and isn't finished, or null.
export async function issueVisitorLink(db: any, trip: any, now = Date.now()) {
  if (!trip?.id || !trip.company_id || !trip.vehicle_id || CLOSED_TRIP.includes(trip.status)) return null;
  const previous = await db.VerificationGrant.filter({ purpose: 'visitor_tracking', subject: trip.id }, '-created_date', 100);
  for (const grant of previous) await db.VerificationGrant.update(grant.id, { expires_at: new Date(now).toISOString() });
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join('');
  const expires_at = linkExpiry(trip, now);
  await db.VerificationGrant.create({ token_hash: await sha256Hex(token), purpose: 'visitor_tracking', subject: trip.id, company_id: trip.company_id, vehicle_id: trip.vehicle_id, expires_at });
  return { url: trackingUrl(token), expires_at };
}
