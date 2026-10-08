// Who gets which notification, as chosen in Admin → Notifications.
//
// Every email and phone alert the app sends passes through here just before
// it goes out. Each kind can be switched off, and individual people can be
// left out of it; nothing else about who is eligible changes (the sender still
// decides that from roles, companies and buses). Every send is written to the
// NotificationLog so an administrator can see what went out and to whom.
//
// Settings are read fresh on every send. If they can't be read, the alert goes
// out as it always did: a settings hiccup must never silence an alert.

// The catalog the admin tab shows. `audiences` says whose names to list under
// "Who gets it"; `locked` alerts can't be switched off and always reach
// somebody, even if every name was unticked.
export const NOTIFICATION_TYPES = [
  { key: 'sos', channel: 'push', label: 'SOS alert', when: 'A driver holds the SOS button on the bus tablet.', audiences: ['admin'], locked: true },
  { key: 'chat_message', channel: 'push', label: 'Chat messages', when: 'Someone posts in a bus chat: passengers, drivers, managers, mechanics or dispatch.', audiences: ['admin', 'company', 'mechanic', 'passenger', 'driver'] },
  { key: 'stop_ahead', channel: 'push', label: 'Bus one stop away', when: 'A bus leaves the stop before a passenger\'s favourite stop. Passengers also switch this on or off themselves.', audiences: ['passenger'] },
  { key: 'bus_approaching_push', channel: 'push', label: 'Your bus is approaching', when: 'Dispatch, a manager or the driver tablet tells a passenger their bus is near.', audiences: ['passenger'] },
  { key: 'driver_problem', channel: 'push', label: 'Driver problem report', when: 'A driver reports a problem from the driver phone app.', audiences: ['admin'] },
  { key: 'walkaround_problem', channel: 'push', label: 'Walk-around problem', when: 'A driver\'s walk-around check finds something wrong.', audiences: ['admin'] },
  { key: 'driver_request', channel: 'push', label: 'Day-off and swap requests', when: 'A driver asks for a day off or a shift swap.', audiences: ['admin'] },
  { key: 'request_decision', channel: 'push', label: 'Request answered', when: 'A day-off or swap request is approved or declined. Goes to that driver\'s phone.', audiences: ['driver'] },
  { key: 'crash_alert', channel: 'email', label: 'Crash alert', when: 'A screen in the app crashes. At most five emails an hour.', audiences: ['admin'] },
  { key: 'weekly_report', channel: 'email', label: 'Weekly report', when: 'Once a week: trips, incidents, faults and maintenance.', audiences: ['admin'] },
  { key: 'maintenance_due', channel: 'email', label: 'Maintenance due', when: 'Servicing is due soon or overdue. Managers hear about their own company; mechanics about jobs assigned to them.', audiences: ['admin', 'company', 'mechanic'] },
  { key: 'inspection_reminder', channel: 'email', label: 'Inspection reminder', when: 'A recurring inspection is due soon or overdue.', audiences: ['admin', 'mechanic'] },
  { key: 'bus_approaching_email', channel: 'email', label: 'Your bus is approaching', when: 'Dispatch, a manager or the driver tablet tells a passenger their bus is near.', audiences: ['passenger'] },
];
export const NOTIFICATION_KEYS = new Set(NOTIFICATION_TYPES.map((t) => t.key));

const ntfNorm = (value) => String(value || '').trim().toLowerCase();
const NTF_LOG_RECIPIENTS = 50;

export async function notificationPolicy(base44, key) {
  const type = NOTIFICATION_TYPES.find((t) => t.key === key);
  let row = null;
  try { row = (await base44.asServiceRole.entities.NotificationSetting.filter({ key }, '-updated_date', 1))[0] || null; }
  catch { row = null; }
  const blocked = new Set((Array.isArray(row?.blocked_emails) ? row.blocked_emails : []).map(ntfNorm).filter(Boolean));
  return { key, locked: !!type?.locked, enabled: type?.locked ? true : row?.enabled !== false, blocked };
}

// Writes one line to the Recent list. Never throws, never blocks the alert.
export async function recordNotification(base44, entry) {
  const { key, channel, title = '', recipients = [], sent = 0, failed = 0, skipped = 0, off = false, error = '', company_id = '' } = entry;
  if (!off && !sent && !failed && !skipped) return; // nobody was due this one
  const status = off ? 'off' : failed && !sent ? 'failed' : failed ? 'partial' : sent ? 'sent' : 'held';
  try {
    await base44.asServiceRole.entities.NotificationLog.create({
      key, channel, title: String(title || '').slice(0, 200),
      recipients: recipients.slice(0, NTF_LOG_RECIPIENTS), recipient_count: recipients.length,
      sent, failed, skipped, status, error: String(error || '').slice(0, 300),
      company_id: company_id || '', sent_at: new Date().toISOString(),
    });
  } catch { /* the log is a convenience */ }
}

// Phone alerts. `tokens` are the devices the sender picked; the people they
// belong to come from the PushToken rows. A device signed in by several people
// still gets the alert if any of them is allowed. A bus tablet's device has no
// person on it and is only held back by switching the whole kind off.
// `send(tokens)` does the delivery and may return { sent, failed }.
export async function pushWithPolicy(base44, key, tokens, payload, send, { companyId = '' } = {}) {
  const unique = [...new Set((tokens || []).filter((t) => typeof t === 'string' && t))];
  if (!unique.length) return { tokens: [], sent: 0 };
  const policy = await notificationPolicy(base44, key);
  let rows = [];
  try { rows = await base44.asServiceRole.entities.PushToken.filter({ token: { $in: unique } }, '-created_date', 2000); }
  catch { rows = []; }
  const owners = new Map();
  for (const row of rows) {
    if (!owners.has(row.token)) owners.set(row.token, new Set());
    if (row.email) owners.get(row.token).add(ntfNorm(row.email));
  }
  const allowedToken = (token) => {
    const emails = [...(owners.get(token) || [])];
    return !emails.length || emails.some((email) => !policy.blocked.has(email));
  };
  let chosen = policy.enabled ? unique.filter(allowedToken) : [];
  if (policy.locked && !chosen.length) chosen = unique; // never silence a locked alert
  const recipientsOf = (list) => {
    const out = new Set();
    for (const token of list) {
      const emails = [...(owners.get(token) || [])].filter((email) => !policy.blocked.has(email) || policy.locked);
      if (emails.length) emails.forEach((email) => out.add(email)); else out.add('bus tablet');
    }
    return [...out];
  };
  let sent = 0, failed = 0, error = '';
  if (chosen.length) {
    try {
      const result = await send(chosen);
      if (result && typeof result.sent === 'number') { sent = result.sent; failed = Math.max(0, chosen.length - result.sent); error = result.error || ''; }
      else sent = chosen.length;
    } catch (e) { failed = chosen.length; error = e?.message || 'Push failed'; }
  }
  await recordNotification(base44, {
    key, channel: 'push', title: payload?.title, recipients: recipientsOf(chosen),
    sent, failed, skipped: unique.length - chosen.length, off: !policy.enabled, error, company_id: companyId,
  });
  return { tokens: chosen, sent };
}

// Emails. `recipients` are { email, ... } objects; `sendOne(recipient)` sends
// one email and throws if it fails. Returns one result per address.
export async function emailWithPolicy(base44, key, recipients, sendOne, { title = '', companyId = '' } = {}) {
  const policy = await notificationPolicy(base44, key);
  const seen = new Set();
  const results = [];
  let sent = 0, failed = 0, skipped = 0, error = '';
  const delivered = [];
  for (const recipient of recipients || []) {
    const email = ntfNorm(recipient?.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (!policy.enabled || policy.blocked.has(email)) { skipped++; results.push({ to: recipient.email, ok: false, skipped: true }); continue; }
    try { await sendOne(recipient); sent++; delivered.push(email); results.push({ to: recipient.email, ok: true }); }
    catch (e) { failed++; error = e?.message || 'Email failed'; delivered.push(email); results.push({ to: recipient.email, ok: false, error: error }); }
  }
  await recordNotification(base44, { key, channel: 'email', title, recipients: delivered, sent, failed, skipped, off: !policy.enabled && seen.size > 0, error, company_id: companyId });
  return { results, sent, failed, skipped, enabled: policy.enabled };
}
