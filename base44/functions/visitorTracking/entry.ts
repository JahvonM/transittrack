import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { reserveAttempt } from '../../shared/atomicOps.ts';
import { CLOSED_TRIP as CLOSED, issueVisitorLink, sha256Hex as hash } from '../../shared/visitorLinks.ts';

// The guest's tracking page is part of the app itself (src/pages/TrackRide.jsx);
// how links are made is in base44/shared/visitorLinks.ts.
const TOKEN = /^[a-f0-9]{64}$/;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
// Explicit allowlist: a visitor never receives passenger lists, phone numbers,
// signatures, driver credentials, company codes, notes or other fleet vehicles.
// Where the ride is in its job: driving to the pickup, waiting there, driving
// the guest to the drop-off, or there (status 'arrived' is set at drop-off).
export function rideStage(trip: any) {
  if (trip?.status === 'arrived') return 'at_dropoff';
  if (trip?.status !== 'on_the_way') return null;
  return trip.pickup_signed_at ? 'to_dropoff' : trip.pickup_arrived_at ? 'at_pickup' : 'to_pickup';
}
const place = (lat: unknown, lng: unknown) =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0) ? { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 } : null;
// The guest's own next stop, so their page can work out the minutes to it.
// Only while the ride's live position is shown, and only this ride's stop.
function etaTarget(trip: any, stage: string | null) {
  const at = stage === 'to_pickup' ? place(trip.pickup_lat, trip.pickup_lng) : stage === 'to_dropoff' ? place(trip.dropoff_lat, trip.dropoff_lng) : null;
  return at ? { to: stage === 'to_pickup' ? 'pickup' : 'dropoff', ...at } : null;
}
export function visitorView(trip: any, vehicle: any, now = Date.now()) {
  const age = now - Date.parse(vehicle?.last_location_update || '');
  const fresh = Number.isFinite(age) && age >= -60_000 && age <= 120_000;
  const active = ['on_the_way', 'arrived'].includes(trip.status);
  const valid = Number.isFinite(vehicle?.current_lat) && Math.abs(vehicle.current_lat) <= 90 && Number.isFinite(vehicle?.current_lng) && Math.abs(vehicle.current_lng) <= 180;
  const stage = rideStage(trip), live = active && valid && fresh;
  return {
    stage, eta: live ? etaTarget(trip, stage) : null,
    status: trip.status, pickup: trip.pickup_name || '', dropoff: trip.dropoff_name || '',
    scheduled_time: trip.scheduled_time || null, vehicle_name: vehicle?.name || trip.vehicle_name || '',
    plate_number: vehicle?.plate_number || trip.plate_number || '',
    pickup_confirmed: !!trip.pickup_signed_at, dropoff_confirmed: !!trip.dropoff_signed_at,
    location: active && valid && fresh ? { lat: vehicle.current_lat, lng: vehicle.current_lng, updated_at: vehicle.last_location_update } : null,
    location_status: !active ? 'not_sharing' : !valid ? 'unavailable' : fresh ? 'live' : 'stale',
  };
}
export default async function(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const base44 = createClientFromRequest(req), db = base44.asServiceRole.entities;
    if (body.action === 'issue') {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') return json({ error: 'Administrators only' }, 403);
      if (typeof body.trip_id !== 'string' || body.trip_id.length > 128) return json({error:'Choose a trip'},400);
      if (!(await reserveAttempt(base44, 'visitor-link:' + user.id, 30, 60_000))) return json({error:'Try again in a minute'},429);
      const trip = await db.Trip.get(body.trip_id);
      const link = await issueVisitorLink(db, trip);
      if (!link) return json({error:'Assign an active job to a vehicle first'},409);
      return json(link);
    }
    if (body.action !== 'track' || !TOKEN.test(body.token || '')) return json({error:'This tracking link is invalid or expired'},404);
    const digest = await hash(body.token);
    const [grant] = await db.VerificationGrant.filter({token_hash:digest,purpose:'visitor_tracking'},'-created_date',1);
    if (!grant || !(Date.parse(grant.expires_at) > Date.now())) return json({error:'This tracking link is invalid or expired'},404);
    if (!(await reserveAttempt(base44, 'visitor-track:'+digest, 30, 60_000))) return json({error:'Please wait a moment before refreshing'},429);
    const trip = await db.Trip.get(grant.subject).catch((e: any) => { if(e.status===404)return null;throw e; });
    // Assignment changes invalidate the link: dispatch issues another for the new vehicle.
    if (!trip || trip.company_id !== grant.company_id || trip.vehicle_id !== grant.vehicle_id) return json({error:'This tracking link is invalid or expired'},404);
    const vehicle = !CLOSED.includes(trip.status) ? await db.Vehicle.get(trip.vehicle_id) : null;
    if(vehicle && vehicle.company_id !== grant.company_id) return json({error:'This tracking link is invalid or expired'},404);
    return json(visitorView(trip,vehicle));
  } catch(e: any) { return json({error:'Tracking is temporarily unavailable. Please try again.'},e?.status===401?401:503); }
}
