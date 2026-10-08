// Who gets which notification, as chosen in Admin → Notifications and by
// passengers themselves in their app.
//
// Every email and phone alert the app sends passes through here just before
// it goes out. An administrator can switch each kind off, switch it off for a
// whole company, or leave particular people out; passengers can turn their own
// alerts off. Nothing else about who is eligible changes (the sender still
// decides that from roles, companies and buses). Every send is written to the
// NotificationLog so an administrator can see what went out and to whom.
//
// Settings are read fresh on every send. If they can't be read, the alert goes
// out as it always did: a settings hiccup must never silence an alert.

// The catalog the admin tab shows. `audiences` says whose names to list under
// "Who gets it"; `locked` alerts can't be switched off and always reach
// somebody, even if every name was unticked. `perCompany` kinds are about one
// company's buses and can be switched off company by company. `selfService`
// kinds are ones passengers may turn off for themselves.
export const NOTIFICATION_TYPES = [
  { key: 'sos', channel: 'push', label: 'SOS alert', when: 'A driver holds the SOS button on the bus tablet.', audiences: ['admin'], locked: true },
  { key: 'chat_message', channel: 'push', label: 'Chat messages', when: 'Someone posts in a bus chat: passengers, drivers, managers, mechanics or dispatch.', audiences: ['admin', 'company', 'mechanic', 'passenger', 'driver'], perCompany: true, selfService: true, passengerLabel: 'Messages in my bus chat', passengerWhen: 'A phone alert when someone posts in your bus\'s chat.' },
  { key: 'stop_ahead', channel: 'push', label: 'Bus one stop away', when: 'A bus leaves the stop before a passenger\'s favourite stop. Passengers also switch this on or off themselves, where they choose their pickup stop.', audiences: ['passenger'], perCompany: true },
  { key: 'bus_approaching_push', channel: 'push', label: 'Your bus is approaching', when: 'Dispatch, a manager or the driver tablet tells a passenger their bus is near.', audiences: ['passenger'], perCompany: true, selfService: true, passengerLabel: 'My bus is approaching', passengerWhen: 'A phone alert when the office or driver says your bus is near.' },
  { key: 'driver_problem', channel: 'push', label: 'Driver problem report', when: 'A driver reports a problem from the driver phone app.', audiences: ['admin'], perCompany: true },
  { key: 'walkaround_problem', channel: 'push', label: 'Walk-around problem', when: 'A driver\'s walk-around check finds something wrong.', audiences: ['admin'], perCompany: true },
  { key: 'driver_request', channel: 'push', label: 'Day-off and swap requests', when: 'A driver asks for a day off or a shift swap.', audiences: ['admin'], perCompany: true },
  { key: 'request_decision', channel: 'push', label: 'Request answered', when: 'A day-off or swap request is approved or declined. Goes to that driver\'s phone.', audiences: ['driver'], perCompany: true },
  { key: 'crash_alert', channel: 'email', label: 'Crash alert', when: 'A screen in the app crashes. At most five emails an hour.', audiences: ['admin'] },
  { key: 'weekly_report', channel: 'email', label: 'Weekly report', when: 'Once a week: trips, incidents, faults and maintenance.', audiences: ['admin'] },
  { key: 'maintenance_due', channel: 'email', label: 'Maintenance due', when: 'Servicing is due soon or overdue. Managers hear about their own company; mechanics about jobs assigned to them.', audiences: ['admin', 'company', 'mechanic'], perCompany: true },
  { key: 'inspection_reminder', channel: 'email', label: 'Inspection reminder', when: 'A recurring inspection is due soon or overdue.', audiences: ['admin', 'mechanic'] },
  { key: 'bus_approaching_email', channel: 'email', label: 'Your bus is approaching', when: 'Dispatch, a manager or the driver tablet tells a passenger their bus is near.', audiences: ['passenger'], perCompany: true, selfService: true, passengerLabel: 'My bus is approaching (email)', passengerWhen: 'An email when the office or driver says your bus is near.' },
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
  const blockedCompanies = new Set(type?.perCompany && Array.isArray(row?.blocked_company_ids) ? row.blocked_company_ids.filter((id) => typeof id === 'string' && id) : []);
  return { key, locked: !!type?.locked, selfService: !!type?.selfService, enabled: type?.locked ? true : row?.enabled !== false, blocked, blockedCompanies };
}

// Is this send switched off, either everywhere or for the company it's about?
function ntfOff(policy, companyId) {
  if (policy.locked) return false;
  return !policy.enabled || (!!companyId && policy.blockedCompanies.has(companyId));
}

// People who turned this kind off in their own app.
async function ntfOptedOut(base44, policy, emails) {
  if (!policy.selfService || !emails.length) return new Set();
  try {
    const users = await base44.asServiceRole.entities.User.filter({ email: { $in: emails } }, '-created_date', 2000);
    return new Set(users.filter((u) => Array.isArray(u.notification_opt_out) && u.notification_opt_out.includes(policy.key)).map((u) => ntfNorm(u.email)));
  } catch { return new Set(); }
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
// person on it and is only held back by switching the kind off.
// `send(tokens)` does the delivery and may return { sent, failed }.
export async function pushWithPolicy(base44, key, tokens, payload, send, { companyId = '' } = {}) {
  const unique = [...new Set((tokens || []).filter((t) => typeof t === 'string' && t))];
  if (!unique.length) return { tokens: [], sent: 0 };
  const policy = await notificationPolicy(base44, key);
  const off = ntfOff(policy, companyId);
  let rows = [];
  try { rows = await base44.asServiceRole.entities.PushToken.filter({ token: { $in: unique } }, '-created_date', 2000); }
  catch { rows = []; }
  const owners = new Map();
  for (const row of rows) {
    if (!owners.has(row.token)) owners.set(row.token, new Set());
    if (row.email) owners.get(row.token).add(ntfNorm(row.email));
  }
  const optedOut = off ? new Set() : await ntfOptedOut(base44, policy, [...new Set(rows.map((r) => ntfNorm(r.email)).filter(Boolean))]);
  const allowedEmail = (email) => !policy.blocked.has(email) && !optedOut.has(email);
  const allowedToken = (token) => {
    const emails = [...(owners.get(token) || [])];
    return !emails.length || emails.some(allowedEmail);
  };
  let chosen = off ? [] : unique.filter(allowedToken);
  const fallback = policy.locked && !chosen.length;
  if (fallback) chosen = unique; // never silence a locked alert
  const recipientsOf = (list) => {
    const out = new Set();
    for (const token of list) {
      const emails = [...(owners.get(token) || [])].filter((email) => fallback || allowedEmail(email));
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
    sent, failed, skipped: unique.length - chosen.length, off, error, company_id: companyId,
  });
  return { tokens: chosen, sent };
}

// Emails. `recipients` are { email, ... } objects; `sendOne(recipient)` sends
// one email and throws if it fails. Returns one result per address.
export async function emailWithPolicy(base44, key, recipients, sendOne, { title = '', companyId = '' } = {}) {
  const policy = await notificationPolicy(base44, key);
  const off = ntfOff(policy, companyId);
  const unique = [];
  const seen = new Set();
  for (const recipient of recipients || []) {
    const email = ntfNorm(recipient?.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    unique.push([email, recipient]);
  }
  const optedOut = off ? new Set() : await ntfOptedOut(base44, policy, unique.map(([email]) => email));
  const results = [];
  const delivered = [];
  let sent = 0, failed = 0, skipped = 0, error = '';
  for (const [email, recipient] of unique) {
    if (off || policy.blocked.has(email) || optedOut.has(email)) { skipped++; results.push({ to: recipient.email, ok: false, skipped: true }); continue; }
    try { await sendOne(recipient); sent++; delivered.push(email); results.push({ to: recipient.email, ok: true }); }
    catch (e) { failed++; error = e?.message || 'Email failed'; delivered.push(email); results.push({ to: recipient.email, ok: false, error }); }
  }
  await recordNotification(base44, { key, channel: 'email', title, recipients: delivered, sent, failed, skipped, off: off && unique.length > 0, error, company_id: companyId });
  return { results, sent, failed, skipped, enabled: !off };
}
