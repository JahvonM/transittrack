import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const DAY_MS = 24 * 60 * 60 * 1000;

const inWindow = (iso, since) => !!iso && new Date(iso).getTime() >= since;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const hours = (mins) => (mins / 60).toFixed(1);

// Weekly summary email for admins: trips, check-ins, driver hours,
// inspections, faults, incidents and SOS over the last 7 days. Runs from a
// scheduled workflow (no user) or on demand by an admin.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const currentUser = await base44.auth.me();
      if (currentUser && currentUser.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* scheduled run, no user — proceed */ }

    const db = base44.asServiceRole.entities;
    const since = Date.now() - 7 * DAY_MS;
    const [trips, checkIns, shifts, results, faults, incidents, vehicles, users] = await Promise.all([
      db.Trip.list('-created_date', 2000),
      db.StaffCheckIn.list('-created_date', 5000),
      db.DriverShift.list('-started_at', 1000).catch(() => []),
      db.InspectionResult.list('-inspection_date', 2000),
      db.Fault.list('-created_date', 1000),
      db.Incident.list('-occurred_at', 1000),
      db.Vehicle.list(),
      db.User.list(),
    ]);

    const weekTrips = trips.filter((t) => inWindow(t.created_date, since));
    const completed = weekTrips.filter((t) => t.status === 'completed').length;
    const cancelled = weekTrips.filter((t) => t.status === 'cancelled').length;
    const boardings = checkIns.filter((c) => c.status === 'boarded' && inWindow(c.created_date, since)).length;

    const weekShifts = shifts.filter((s) => inWindow(s.started_at, since));
    const driverMinutes = new Map();
    for (const s of weekShifts) {
      const mins = s.duration_minutes ?? Math.round((Date.now() - new Date(s.started_at).getTime()) / 60000);
      const name = s.driver_name || s.driver_email || s.vehicle_name || 'Unknown';
      driverMinutes.set(name, (driverMinutes.get(name) || 0) + Math.max(0, mins));
    }
    const totalMinutes = [...driverMinutes.values()].reduce((a, b) => a + b, 0);
    const topDrivers = [...driverMinutes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const weekResults = results.filter((r) => inWindow(r.inspection_date || r.created_date, since));
    const inspectionSessions = new Set(weekResults.map((r) => `${r.vehicle_id}|${r.inspection_name}|${(r.inspection_date || r.created_date || '').slice(0, 10)}`)).size;
    const failedItems = weekResults.filter((r) => r.result === 'fail' || r.status === 'fail' || r.passed === false).length;

    const newFaults = faults.filter((f) => inWindow(f.created_date, since)).length;
    const openFaults = faults.filter((f) => !['resolved', 'closed', 'fixed'].includes((f.status || '').toLowerCase())).length;

    const weekIncidents = incidents.filter((i) => inWindow(i.occurred_at || i.created_date, since));
    const sos = weekIncidents.filter((i) => i.type === 'sos').length;
    const speeding = weekIncidents.filter((i) => i.type === 'speeding').length;

    const offline = vehicles.filter((v) => !v.last_location_update || Date.now() - new Date(v.last_location_update).getTime() > 7 * DAY_MS);

    const fmtDay = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const period = `${fmtDay(since)} – ${fmtDay(Date.now())}`;

    const lines = [
      `Here's how the fleet did this week (${period}).`,
      '',
      'TRIPS & PASSENGERS',
      `• ${plural(weekTrips.length, 'trip')} booked, ${completed} completed, ${cancelled} cancelled`,
      `• ${plural(boardings, 'boarding')} recorded at bus kiosks`,
      '',
      'DRIVERS',
      `• ${hours(totalMinutes)} hours driven across ${plural(weekShifts.length, 'shift')}`,
      ...topDrivers.map(([name, mins]) => `   – ${name}: ${hours(mins)} h`),
      '',
      'MAINTENANCE',
      `• ${plural(inspectionSessions, 'inspection')} run, ${plural(failedItems, 'failed check')}`,
      `• ${plural(newFaults, 'new fault')} reported, ${openFaults} still open`,
      '',
      'SAFETY',
      `• ${plural(weekIncidents.length, 'incident')} (${sos} SOS, ${speeding} speeding)`,
      '',
      'FLEET',
      `• ${plural(vehicles.length, 'vehicle')}, ${offline.length} with no location in the past week${offline.length ? `: ${offline.slice(0, 8).map((v) => v.name).join(', ')}` : ''}`,
      '',
      'Open TransitTrack → Admin for the details.',
      '',
      '— TransitTrack',
    ];
    const body = lines.join('\n');

    const admins = users.filter((u) => u.role === 'admin' && u.email);
    let sent = 0;
    for (const a of admins) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: a.email,
          subject: `TransitTrack weekly report · ${period}`,
          body: `Hi ${a.full_name?.split(' ')[0] || 'there'},\n\n${body}`,
        });
        sent++;
      } catch { /* one bad address shouldn't stop the rest */ }
    }
    return Response.json({ ok: true, sent, period });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
