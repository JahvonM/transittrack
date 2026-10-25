import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { forwardToSupabase } from '../../shared/forwardToSupabase.ts';
import { reserveAttempt } from '../../shared/atomicOps.ts';
import { CLOSED_TRIP as CLOSED, issueVisitorLink, sha256Hex as hash } from '../../shared/visitorLinks.ts';

// The guest's tracking page is part of the app itself (src/pages/TrackRide.jsx);
// how links are made is in base44/shared/visitorLinks.ts.
export { VISITOR_SITE, trackingUrl } from '../../shared/visitorLinks.ts';
const TOKEN = /^[a-f0-9]{64}$/;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
// Explicit allowlist: a visitor never receives passenger lists, phone numbers,
// signatures, driver credentials, company codes, notes or other fleet vehicles.
export function visitorView(trip: any, vehicle: any, now = Date.now()) {
  const age = now - Date.parse(vehicle?.last_location_update || '');
  const fresh = Number.isFinite(age) && age >= -60_000 && age <= 120_000;
  const active = ['on_the_way', 'arrived'].includes(trip.status);
  const valid = Number.isFinite(vehicle?.current_lat) && Math.abs(vehicle.current_lat) <= 90 && Number.isFinite(vehicle?.current_lng) && Math.abs(vehicle.current_lng) <= 180;
  return {
    status: trip.status, pickup: trip.pickup_name || '', dropoff: trip.dropoff_name || '',
    scheduled_time: trip.scheduled_time || null, vehicle_name: vehicle?.name || trip.vehicle_name || '',
    plate_number: vehicle?.plate_number || trip.plate_number || '',
    pickup_confirmed: !!trip.pickup_signed_at, dropoff_confirmed: !!trip.dropoff_signed_at,
    location: active && valid && fresh ? { lat: vehicle.current_lat, lng: vehicle.current_lng, updated_at: vehicle.last_location_update } : null,
    location_status: !active ? 'not_sharing' : !valid ? 'unavailable' : fresh ? 'live' : 'stale',
  };
}
export default async function(req: Request) {
  const forwarded = await forwardToSupabase(req, 'visitorTracking');
  if (forwarded) return forwarded;
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
