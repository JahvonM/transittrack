import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MILEAGE_THRESHOLD_KM = 500;

function fmtDate(d) {
  return d ? d.toISOString().split('T')[0] : '—';
}

function formatItem(d) {
  const sev = d.isOverdue ? 'OVERDUE' : 'DUE SOON';
  return `• [${sev}] ${d.schedule.vehicle_name || d.schedule.vehicle_id} — ${d.schedule.service_type}\n   ${d.dueLabel}`;
}

function buildEmail(name, isAdmin, items) {
  const intro = isAdmin
    ? `Hi ${name},\n\nThe following maintenance services in your fleet are due soon or overdue:`
    : `Hi ${name},\n\nThe following maintenance services assigned to you are due soon or overdue:`;
  return `${intro}\n\n${items.join('\n\n')}\n\nPlease schedule the service at your earliest convenience.\n\n— TransitTrack`;
}

// Scans every company's MaintenanceSchedule for items due soon/overdue and
// emails that company's admins/managers/mechanics — same idea as FleetPilot's
// original maintenanceAlerts, but scoped per company_id since this app is
// multi-tenant (FleetPilot managed a single global fleet, no company concept).
// Mileage-based schedules read Vehicle.current_odometer (the field this app
// already uses everywhere else) rather than a separate 'mileage' field.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Soft guard for direct HTTP invocation; scheduled runs have no user.
    try {
      const currentUser = await base44.auth.me();
      if (currentUser && currentUser.role && !['admin', 'company'].includes(currentUser.role)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* scheduled run, no user — proceed */ }

    const [schedules, vehicles, users, companies] = await Promise.all([
      base44.asServiceRole.entities.MaintenanceSchedule.list(),
      base44.asServiceRole.entities.Vehicle.list(),
      base44.asServiceRole.entities.User.list(),
      base44.asServiceRole.entities.Company.list(),
    ]);

    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const companyById = new Map(companies.map((c) => [c.id, c]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const today = new Date();

    const dueByCompany = new Map(); // company_id -> [{ schedule, isOverdue, dueLabel }]
    const statusUpdates = [];

    for (const s of schedules) {
      if (s.status === 'completed') continue;
      const vehicle = vehicleById.get(s.vehicle_id);
      const reminderDays = companyById.get(s.company_id)?.maintenance_reminder_days || 14;
      let isDue = false;
      let isOverdue = false;
      let dueLabel = '';

      if (s.due_type === 'days') {
        const baseDate = s.last_service_date ? new Date(s.last_service_date) : null;
        const interval = s.interval_days || 0;
        if (baseDate && interval > 0) {
          const next = new Date(baseDate.getTime() + interval * DAY_MS);
          const diffDays = Math.ceil((next.getTime() - today.getTime()) / DAY_MS);
          dueLabel = `Due ${fmtDate(next)}`;
          if (diffDays < 0) isOverdue = true;
          else if (diffDays <= reminderDays) isDue = true;
        }
      } else {
        const lastMileage = s.last_service_mileage || 0;
        const interval = s.interval_km || 0;
        const currentMileage = vehicle?.current_odometer || 0;
        if (interval > 0) {
          const nextDueKm = lastMileage + interval;
          const remaining = nextDueKm - currentMileage;
          dueLabel = `Due at ${nextDueKm.toLocaleString()} km (current ${currentMileage.toLocaleString()} km)`;
          if (remaining <= 0) isOverdue = true;
          else if (remaining <= DEFAULT_MILEAGE_THRESHOLD_KM) isDue = true;
        }
      }

      if (isDue || isOverdue) {
        const list = dueByCompany.get(s.company_id) || [];
        list.push({ schedule: s, isOverdue, dueLabel });
        dueByCompany.set(s.company_id, list);
        const newStatus = isOverdue ? 'overdue' : 'due';
        if (s.status !== newStatus) statusUpdates.push({ id: s.id, status: newStatus });
      }
    }

    if (dueByCompany.size === 0) {
      return Response.json({ alerted: false, count: 0, message: 'No maintenance due soon.' });
    }

    const sendResults = [];
    for (const [companyId, items] of dueByCompany) {
      const recipients = new Map();
      users.filter((u) => u.role === 'admin' && u.email)
        .forEach((u) => recipients.set(u.email, { email: u.email, name: u.full_name || u.email, isAdmin: true }));
      users.filter((u) => u.role === 'company' && u.company_id === companyId && u.email)
        .forEach((u) => recipients.set(u.email, { email: u.email, name: u.full_name || u.email, isAdmin: true }));

      const perMechanicItems = new Map();
      for (const d of items) {
        const mechId = d.schedule.assigned_mechanic_id;
        if (!mechId) continue;
        const mech = userById.get(mechId);
        if (!mech?.email) continue;
        recipients.set(mech.email, { email: mech.email, name: mech.full_name || mech.email, isAdmin: false });
        if (!perMechanicItems.has(mech.email)) perMechanicItems.set(mech.email, []);
        perMechanicItems.get(mech.email).push(formatItem(d));
      }

      const adminItems = items.map(formatItem);
      for (const r of recipients.values()) {
        const list = r.isAdmin ? adminItems : (perMechanicItems.get(r.email) || []);
        if (!list.length) continue;
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: r.email,
            subject: `Maintenance Alert — ${list.length} service(s) due`,
            body: buildEmail(r.name, r.isAdmin, list),
          });
          sendResults.push({ to: r.email, ok: true });
        } catch (err) {
          sendResults.push({ to: r.email, ok: false, error: err.message });
        }
      }
    }

    if (statusUpdates.length) {
      for (const u of statusUpdates) {
        try { await base44.asServiceRole.entities.MaintenanceSchedule.update(u.id, { status: u.status }); }
        catch { /* best-effort */ }
      }
    }

    return Response.json({
      alerted: true,
      dueCount: [...dueByCompany.values()].reduce((n, l) => n + l.length, 0),
      recipients: sendResults,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
