import { onBoard, tapTime } from './boardingEvents.ts';

// Each passenger's ride today, for the driver (bus tablet and driver phone):
// on board since when, got off, didn't show, or not yet. Only from their own
// taps and the driver's marks; GPS never decides it.
//
// A person: { id, _source: 'contact' | 'user', _tags: what their taps are
// filed under (card numbers, ids) }. The tags stay on the server.

export const RIDE_MARK_KINDS = ['no_show', 'undo_no_show', 'got_on', 'got_off'];

export const rideDay = (at) => new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/Grenada' });

export function rideOf(person, checkIns, exceptions, now = Date.now()) {
  const tags = new Set(person._tags || []);
  const taps = (checkIns || []).filter((r) => tags.has(r.card_tag) || (r.person_key && r.person_key === `${person._source}:${person.id}`))
    .map((r) => ({ status: r.status, at: r.boarded_at || r.created_date, method: r.check_in_method, review: r.review_reason || '' }))
    .filter((t) => Number.isFinite(tapTime(t)) && tapTime(t) <= now + 60_000)
    .sort((a, b) => tapTime(a) - tapTime(b));
  const on = onBoard(taps, now);
  const last = taps.at(-1);
  if (on.onBoard) return { state: 'on_board', at: new Date(on.since).toISOString(), by_driver: last?.review === 'driver_correction' };
  if (last && last.status === 'off_board' && rideDay(tapTime(last)) === rideDay(now)) return { state: 'got_off', at: new Date(tapTime(last)).toISOString(), by_driver: last.review === 'driver_correction' };
  const noShow = (exceptions || []).find((e) => e.person_ref === person.id && e.kind === 'no_show' && !e.undone_at && rideDay(Date.parse(e.at)) === rideDay(now));
  if (noShow) return { state: 'no_show', at: noShow.at, id: noShow.id };
  return { state: 'not_yet' };
}

// Save a driver's mark: didn't show (or undo), or got on / got off when the
// passenger couldn't tap. Each is recorded with who and when; got on / got
// off also makes a boarding record marked for review. Returns
// { error, status } when the mark doesn't fit the passenger's ride, else
// { ride, checkIns } with the ride after the mark.
export async function recordRideMark(db, { companyId, companyName = '', vehicle, person, kind, note = '', driverName, deviceId = '', actorEmail = '', page = '/driver', checkIns, exceptions, shifts, now = new Date() }) {
  const ride = rideOf(person, checkIns, exceptions, now.getTime());
  const shift = (shifts || []).find((x) => !x.ended_at);
  const run = shift ? { run_key: 'shift:' + shift.id, shift_id: shift.id } : { run_key: `day:${vehicle.id}:${rideDay(now.getTime())}`, shift_id: '' };
  const audit = (summary, record_id) => db.AuditLog.create({ actor_email: actorEmail, actor_name: driverName, actor_role: 'driver', action: 'create', entity: 'RideException', record_id, page, summary }).catch(() => {});
  const name = person.full_name || 'Passenger';
  const base = { company_id: companyId, vehicle_id: vehicle.id, vehicle_name: vehicle.name, ...run, person_ref: person.id, person_name: name, kind, note, recorded_by: driverName, device_id: deviceId, at: now.toISOString() };
  const list = [...(checkIns || [])];
  if (kind === 'undo_no_show') {
    if (ride.state !== 'no_show') return { error: `${name} isn’t marked as a no-show`, status: 409 };
    await db.RideException.update(ride.id, { undone_at: now.toISOString(), undone_by: driverName });
    await audit(`${driverName} took back the no-show for ${name} on ${vehicle.name}`, ride.id);
  } else if (kind === 'no_show') {
    if (['on_board', 'got_off'].includes(ride.state)) return { error: `${name} is already recorded as ${ride.state === 'on_board' ? 'on board' : 'having got off'} today`, status: 409 };
    if (ride.state !== 'no_show') {
      const row = await db.RideException.create(base);
      await audit(`${driverName} marked ${name} as not at the pickup on ${vehicle.name}${note ? ': ' + note : ''}`, row.id);
    }
  } else {
    const status = kind === 'got_on' ? 'boarded' : 'off_board';
    if (kind === 'got_on' && ride.state === 'on_board') return { error: `${name} is already on board`, status: 409 };
    if (kind === 'got_off' && ride.state !== 'on_board') return { error: `${name} isn’t recorded as on board`, status: 409 };
    const tag = list.find((r) => (person._tags || []).includes(r.card_tag))?.card_tag || person._tags?.[0] || person.id;
    const record = await db.StaffCheckIn.create({ company_id: companyId, company_name: companyName || '', vehicle_id: vehicle.id, vehicle_name: vehicle.name, staff_name: name, card_tag: tag, status, boarded_at: now.toISOString(), check_in_method: 'manual', person_key: `${person._source}:${person.id}`, ...run, review_reason: 'driver_correction', saved_offline: false });
    const row = await db.RideException.create({ ...base, checkin_id: record.id });
    await audit(`${driverName} recorded ${name} ${kind === 'got_on' ? 'getting on' : 'getting off'} ${vehicle.name} without a tap${note ? ': ' + note : ''}`, row.id);
    list.unshift(record);
  }
  const after = rideOf(person, list, await db.RideException.filter({ vehicle_id: vehicle.id }, '-at', 100).catch(() => []), now.getTime());
  return { ride: after, checkIns: list };
}
