import { onBoard, tapTime } from './boardingEvents.ts';
import { VISITOR_SITE } from './visitorLinks.ts';

// Journey sharing: a passenger sends a private link so family can follow
// their ride (the /share page). What the link may show, and when:
//
// - Only this passenger's own ride: their first name, their bus, whether
//   they're on board (from their own taps), and where they're heading (the
//   company for a ride to work, "Home" for the ride back). Never the route,
//   other passengers, their stops or names, or how full the bus is.
// - The bus on a map only while the passenger is on board and the position
//   is fresh. Before they board it says "waiting"; nothing about where the
//   bus is.
// - It ends when they get off (a tap after the link was made), after
//   SHARE_HOURS at most, when they stop it, when they make a new link, or if
//   their bus changes. The key is 256 random bits kept only as a SHA-256
//   hash (VerificationGrant, purpose 'journey_share'), and travels after #.

export const SHARE_PURPOSE = 'journey_share';
export const SHARE_HOURS = 3;
export const SHARE_MS = SHARE_HOURS * 3600_000;
export const shareSubject = (userId: string) => 'journey:' + userId;
export const shareUrl = (token: string) => `${VISITOR_SITE}/share#j=${token}`;
const FRESH_MS = 2 * 60_000;

// Where the shared ride stands, from the passenger's own taps.
export function shareState(taps: any[], startedAt: number, now = Date.now()) {
  const events = (taps || []).filter((t) => Number.isFinite(tapTime(t))).sort((a, b) => tapTime(a) - tapTime(b));
  const on = onBoard(events, now);
  if (on.onBoard) return { state: 'on_board', since: new Date(on.since as number).toISOString() };
  const off = events.filter((t) => t.status === 'off_board' && tapTime(t) >= startedAt).at(-1);
  if (off) return { state: 'ended', ended_at: new Date(tapTime(off)).toISOString() };
  return { state: 'waiting' };
}

export const firstName = (name: unknown) => String(name || '').replace(/[<>\u0000-\u001F]/g, '').trim().split(/\s+/)[0] || 'Your passenger';

// What the link shows: an explicit allowlist.
export function shareView({ state, person, vehicle, direction, workplaceName, expiresAt, now = Date.now() }: any) {
  const age = now - Date.parse(vehicle?.last_location_update || '');
  const fresh = Number.isFinite(age) && age >= -60_000 && age <= FRESH_MS;
  const valid = Number.isFinite(vehicle?.current_lat) && Math.abs(vehicle.current_lat) <= 90 && Number.isFinite(vehicle?.current_lng) && Math.abs(vehicle.current_lng) <= 180;
  const riding = state.state === 'on_board';
  return {
    state: state.state, since: state.since || null, ended_at: state.ended_at || null,
    first_name: firstName(person?.display_name || person?.full_name),
    vehicle_name: String(vehicle?.name || 'The bus').replace(/[<>]/g, ''), plate_number: vehicle?.plate_number || '',
    heading: direction === 'to_home' ? 'Home' : String(workplaceName || 'Work').replace(/[<>]/g, ''),
    location: riding && valid && fresh ? { lat: vehicle.current_lat, lng: vehicle.current_lng, updated_at: vehicle.last_location_update } : null,
    location_status: !riding ? 'not_sharing' : !valid ? 'unavailable' : fresh ? 'live' : 'stale',
    expires_at: expiresAt || null,
  };
}
