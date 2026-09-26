import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDate(d) {
  return d ? d.toISOString().split('T')[0] : '—';
}

function formatItem(d) {
  const sev = d.isOverdue ? 'OVERDUE' : 'DUE SOON';
  return `• [${sev}] ${d.vehicleName} — ${d.templateName}\n   ${d.dueLabel}`;
}

function buildEmail(name, items) {
  return `Hi ${name},\n\nThe following recurring inspections are due soon or overdue:\n\n${items.join('\n\n')}\n\nPlease schedule these in Run Inspection at your earliest convenience.\n\n— TransitTrack`;
}

// Recurring-inspection reminders — companion to maintenanceAlerts, but keyed
// off InspectionTemplate.frequency_days rather than MaintenanceSchedule.
// Fleet-wide, not per-company (mechanics are a shared/central team here,
// same reasoning as MaintenanceSettings): for every (vehicle, template) pair
// where the template applies to that vehicle (company_id blank or matching)
// and has frequency_days set, finds the vehicle's most recent
// InspectionResult for that template — matched by inspection_name, the same
// key InspectionHistoryTab groups sessions by, since results don't carry a
// template id — and computes a due date from last-run + frequency_days. A
// vehicle that has never run a given template is treated as already overdue.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Soft guard for direct HTTP invocation; scheduled runs have no user.
    try {
      const currentUser = await base44.auth.me();
      if (currentUser && currentUser.role && !['admin', 'mechanic'].includes(currentUser.role)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* scheduled run, no user — proceed */ }

    const [templates, vehicles, results, users, settingsList] = await Promise.all([
      base44.asServiceRole.entities.InspectionTemplate.list(),
      base44.asServiceRole.entities.Vehicle.list(),
      base44.asServiceRole.entities.InspectionResult.list('-inspection_date', 2000),
      base44.asServiceRole.entities.User.list(),
      base44.asServiceRole.entities.MaintenanceSettings.list(),
    ]);

    const recurringTemplates = templates.filter((t) => (t.frequency_days || 0) > 0);
    if (recurringTemplates.length === 0) {
      return Response.json({ alerted: false, count: 0, message: 'No recurring inspection templates configured.' });
    }

    const reminderDays = settingsList[0]?.inspection_reminder_days ?? 1;
    const today = new Date();

    // Latest inspection_date per (vehicle_id, inspection_name).
    const lastRunByKey = new Map();
    for (const r of results) {
      if (!r.inspection_date) continue;
      const key = `${r.vehicle_id}|${r.inspection_name}`;
      const existing = lastRunByKey.get(key);
      if (!existing || new Date(r.inspection_date) > new Date(existing)) {
        lastRunByKey.set(key, r.inspection_date);
      }
    }

    const dueItems = [];
    for (const vehicle of vehicles) {
      if (vehicle.in_service === false) continue;
      for (const t of recurringTemplates) {
        if (t.company_id && t.company_id !== vehicle.company_id) continue;
        const key = `${vehicle.id}|${t.name}`;
        const lastRun = lastRunByKey.get(key);
        let isOverdue = false;
        let isDue = false;
        let dueLabel = '';
        if (!lastRun) {
          isOverdue = true;
          dueLabel = 'Never run';
        } else {
          const due = new Date(new Date(lastRun).getTime() + t.frequency_days * DAY_MS);
          const diffDays = Math.ceil((due.getTime() - today.getTime()) / DAY_MS);
          dueLabel = `Last run ${fmtDate(new Date(lastRun))} · due ${fmtDate(due)}`;
          if (diffDays < 0) isOverdue = true;
          else if (diffDays <= reminderDays) isDue = true;
        }
        if (isDue || isOverdue) {
          dueItems.push({ vehicleName: vehicle.name, templateName: t.name, isOverdue, dueLabel });
        }
      }
    }

    if (dueItems.length === 0) {
      return Response.json({ alerted: false, count: 0, message: 'No recurring inspections due soon.' });
    }

    const recipients = users.filter((u) => (u.role === 'admin' || u.role === 'mechanic') && u.email);
    const itemLines = dueItems.map(formatItem);
    const sendResults = [];
    for (const r of recipients) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: r.email,
          subject: `Inspection Reminder — ${dueItems.length} inspection(s) due`,
          body: buildEmail(r.full_name || r.email, itemLines),
        });
        sendResults.push({ to: r.email, ok: true });
      } catch (err) {
        sendResults.push({ to: r.email, ok: false, error: err.message });
      }
    }

    return Response.json({ alerted: true, dueCount: dueItems.length, recipients: sendResults });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
