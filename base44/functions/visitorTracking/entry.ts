import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { forwardToSupabase } from '../../shared/forwardToSupabase.ts';
import { reserveAttempt } from '../../shared/atomicOps.ts';

export const VISITOR_SITE = 'https://mcsween-grenada-travel.modestejahvon.chatgpt.site';
const TOKEN = /^[a-f0-9]{64}$/;
const CLOSED = ['completed', 'cancelled'];
async function hash(value: string) {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data), x => x.toString(16).padStart(2, '0')).join('');
}
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
      if (!trip?.company_id || !trip.vehicle_id || CLOSED.includes(trip.status)) return json({error:'Assign an active job to a vehicle first'},409);
      const previous = await db.VerificationGrant.filter({purpose:'visitor_tracking',subject:trip.id},'-created_date',100);
      for (const grant of previous) await db.VerificationGrant.update(grant.id,{expires_at:new Date().toISOString()});
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2,'0')).join('');
      const now = Date.now(), planned = Date.parse(trip.scheduled_time || '') || now;
      const expires_at = new Date(Math.min(now + 7*86400_000, Math.max(now+86400_000,planned+86400_000))).toISOString();
      await db.VerificationGrant.create({token_hash:await hash(token),purpose:'visitor_tracking',subject:trip.id,company_id:trip.company_id,vehicle_id:trip.vehicle_id,expires_at});
      return json({url:VISITOR_SITE+'/#trip='+token,expires_at});
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
