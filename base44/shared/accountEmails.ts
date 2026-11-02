import { emailWithPolicy } from './notificationPolicy.ts';

// Emails to a person about their own account, card and requests: welcome,
// sign-up day setup link, password changed, request replies and card changes.
// Each kind can be switched off in Admin → Notifications and every send is
// logged there (emailWithPolicy). Nothing here ever puts a password, a full
// card number or a company code in an email.

export const ACCOUNT_SITE = 'https://app.mcsweenstransport.com';
// Drivers without an email sign in with an internal address on this domain.
// It has no inbox, so nothing is ever sent to it.
const DRIVER_LOGIN_DOMAIN = '@login.mcsweenstransport.com';
const GRENADA = 'America/Grenada';

// A real address to write to, or '' (blank, malformed, or a driver's internal
// sign-in name).
export function deliverableEmail(value: unknown) {
  const e = String(value ?? '').trim().toLowerCase();
  if (e.length > 160 || !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e)) return '';
  return e.endsWith(DRIVER_LOGIN_DOMAIN) ? '' : e;
}

const acctEsc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
// Names and other words people typed: no control characters, kept short.
const acctPlain = (v: unknown, max = 80) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const firstNameOf = (name: unknown) => acctPlain(name, 80).split(' ')[0] || '';

// "Monday 2 November, 4:05 pm" in Grenada time.
export function grenadaWhen(at: number | string = Date.now()) {
  const t = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString('en-GB', { timeZone: GRENADA, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
}

const ACCOUNT_FOOTER = "You're getting this because you have a McSween Transport account with this email address.";

// The same plain, readable look as the ride request emails: a heading, a few
// lines, optional numbered steps and details, and at most one button.
export function accountEmailHtml({ heading, lines = [], steps = [], rows = [], note = '', button = null, footer = ACCOUNT_FOOTER }: {
  heading: string; lines?: string[]; steps?: string[]; rows?: [string, string][]; note?: string;
  button?: { label: string; url: string } | null; footer?: string;
}) {
  const p = (t: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#12262c">${acctEsc(t)}</p>`;
  const table = rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#5b6b70;vertical-align:top;white-space:nowrap">${acctEsc(k)}</td><td style="padding:6px 0;color:#12262c">${acctEsc(v)}</td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#eef4f3;font-family:Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="margin:0 0 18px;font-weight:700;font-size:18px;color:#0e4a5a">McSween Transport</p>
<div style="background:#ffffff;border-radius:14px;padding:26px 24px">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#12262c">${acctEsc(heading)}</h1>
${lines.map(p).join('')}
${steps.length ? `<ol style="margin:4px 0 12px;padding-left:22px;font-size:15px;line-height:1.55;color:#12262c">${steps.map((s) => `<li style="margin:0 0 8px">${acctEsc(s)}</li>`).join('')}</ol>` : ''}
${table ? `<table style="border-collapse:collapse;font-size:15px;margin:8px 0 4px">${table}</table>` : ''}
${button ? `<p style="margin:22px 0 4px"><a href="${acctEsc(button.url)}" style="display:inline-block;background:#c8322b;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${acctEsc(button.label)}</a></p>` : ''}
${note ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#5b6b70">${acctEsc(note)}</p>` : ''}
</div>
<p style="margin:16px 4px 0;font-size:12px;color:#5b6b70">McSween's Transport and Reside Co., Grenada. ${acctEsc(footer)}</p>
</div></body></html>`;
}

const hello = (name: unknown) => { const n = firstNameOf(name); return n ? `Hi ${n},` : 'Hi,'; };
const APP_STEPS = [
  'Add the app to your phone. iPhone: open the app in Safari, tap Share, then Add to Home Screen, and open it from there. Android: tap Install the app.',
  'Tap Allow so you get an alert when your bus is near.',
  'Set where you get picked up: More → My home pickup spot.',
];

// A new account's first verified sign-in. Passengers get the next steps.
export function welcomeEmail({ name = '', role = '' }: { name?: string; role?: string }) {
  const passenger = !role || ['staff', 'passenger', 'user'].includes(role);
  return {
    subject: 'Welcome to McSween Transport',
    body: accountEmailHtml({
      heading: 'Your account is ready',
      lines: [hello(name), passenger
        ? 'Thanks for signing up. You can now follow your bus live, see when it will reach you and tap on with your card or the app.'
        : 'Thanks for signing in. Your McSween Transport account is set up.'],
      steps: passenger ? ["Join your company if you haven't yet: use the setup link or QR code it gave you, or type its company code (12 letters and numbers) when the app asks.", ...APP_STEPS] : [],
      button: { label: 'Open the app', url: ACCOUNT_SITE },
      note: "If you didn't create this account, let the McSween Transport office know.",
    }),
  };
}

// Sign-up day: a personal link that joins this person to the hotel once they
// sign in with this same email address.
export function signupInviteEmail({ name = '', hotel = '', url, days }: { name?: string; hotel?: string; url: string; days: number }) {
  const place = acctPlain(hotel, 80) || 'your company';
  return {
    subject: `Set up your bus app for ${place}`,
    body: accountEmailHtml({
      heading: 'Set up your bus app',
      lines: [hello(name), `${place} uses McSween Transport for its staff buses. The button below sets up the app for you and joins you to ${place} once you sign in.`],
      steps: [
        'Open this email on your phone and tap Set up the app.',
        'Create an account with this email address, or sign in with Google or Apple using the same address.',
        ...APP_STEPS,
      ],
      button: { label: 'Set up the app', url },
      note: `This link is just for you and only works with this email address. It stops working after ${days} days. If it has, ask ${place} or the McSween Transport office for the company code.`,
      footer: `You're getting this because ${place} added this email address for its staff bus service.`,
    }),
  };
}

// how: 'reset' (a reset link), 'self' (a driver changed theirs), 'office' (the office reset a driver's).
export function passwordChangedEmail({ name = '', at = Date.now(), how = 'reset' }: { name?: string; at?: number; how?: string }) {
  const when = grenadaWhen(at);
  const line = how === 'self' ? `You changed the password for your driver sign-in on ${when}.`
    : how === 'office' ? `The office reset the password for your driver sign-in on ${when}. Ask the office for your temporary password; you'll choose a new one when you next sign in.`
      : `The password for your McSween Transport account was changed with a reset link on ${when}.`;
  return {
    subject: 'Your McSween Transport password was changed',
    body: accountEmailHtml({
      heading: 'Your password was changed',
      lines: [hello(name), line],
      note: how === 'reset'
        ? "If this wasn't you, choose Forgot password on the sign-in page to set a new one, and let the office know."
        : "If you didn't expect this, tell the office straight away.",
      button: how === 'reset' ? { label: 'Sign in', url: `${ACCOUNT_SITE}/login` } : null,
    }),
  };
}

// The office answered a passenger's request or changed its status.
export function caseUpdateEmail({ name = '', title, text }: { name?: string; title: string; text: string }) {
  return {
    subject: acctPlain(title, 120),
    body: accountEmailHtml({
      heading: acctPlain(title, 120),
      lines: [hello(name), acctPlain(text, 1000), 'Open the app to see the whole conversation or to answer.'],
      button: { label: 'Open my requests', url: `${ACCOUNT_SITE}/help` },
    }),
  };
}

// A bus card was issued, replaced, paused, stopped or switched back on.
// Only the last four characters of the card are ever shown.
const CARD_EMAIL: Record<string, { subject: string; line: (card: string, bus: string, until: string) => string }> = {
  issued: { subject: 'Your bus card is ready', line: (c, bus) => `Your ${c} is set up${bus ? ` for ${bus}` : ''}. Tap it on the boarding tablet when you get on and when you get off.` },
  replaced: { subject: 'Your new bus card is ready', line: (c, bus) => `Your new ${c} is set up${bus ? ` for ${bus}` : ''}. It replaces your old card, which no longer works.` },
  suspended: { subject: 'Your bus card is paused', line: (c) => `The office paused your ${c}, so it won't work on the bus for now. Until it's switched back on, show the QR code in the app (My card).` },
  lost: { subject: 'Your bus card was stopped', line: (c) => `Your ${c} was marked as lost and no longer works. The office can give you a new one. Until then, show the QR code in the app (My card).` },
  revoked: { subject: 'Your bus card was stopped', line: (c) => `Your ${c} was stopped and no longer works. Ask the office if you need a new one.` },
  reactivated: { subject: 'Your bus card works again', line: (c) => `Your ${c} is switched back on. Tap it on the boarding tablet as usual.` },
  expiring: { subject: 'Your bus card ends soon', line: (c, _bus, until) => `Your ${c} stops working after ${until || 'its end date'}. Ask the office for a new card before then.` },
};
export const CARD_EMAIL_EVENTS = Object.keys(CARD_EMAIL);
// A day as "Monday 30 November" (end dates are kept as YYYY-MM-DD).
export function dayWords(day: unknown) {
  const d = String(day || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
}
export function cardEmail({ name = '', event, uid = '', bus = '', until = '' }: { name?: string; event: string; uid?: string; bus?: string; until?: string }) {
  const kind = CARD_EMAIL[event];
  if (!kind) return null;
  const tail = String(uid || '').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
  const card = tail ? `card ending ${tail}` : 'bus card';
  return {
    subject: kind.subject,
    body: accountEmailHtml({
      heading: kind.subject,
      lines: [hello(name), kind.line(card, acctPlain(bus, 60), dayWords(until))],
      note: event === 'expiring' ? 'Until you have a new card, you can show the QR code in the app (My card).' : "If you didn't expect this, tell the office.",
    }),
  };
}

// A driver's phone app account was made. The username only: the office gives
// the temporary password in person.
export function driverAccountEmail({ name = '', username }: { name?: string; username: string }) {
  return {
    subject: 'Your McSween Transport driver app account',
    body: accountEmailHtml({
      heading: 'Your driver app account is ready',
      lines: [hello(name), 'The office has set up the driver phone app for you.'],
      rows: [['Username', acctPlain(username, 40)]],
      steps: [
        'On your phone, open the app and choose Driver sign-in.',
        'Sign in with this username and the temporary password the office gives you.',
        'Choose your own password when the app asks.',
      ],
      button: { label: 'Open the app', url: `${ACCOUNT_SITE}/login?driver=1` },
      note: 'The temporary password is never sent by email. Ask the office for it.',
    }),
  };
}

// Someone was given office access: a standard role, or a custom role by name.
const ACCESS_TEXT: Record<string, { label: string; line: (company: string) => string }> = {
  admin: { label: 'administrator', line: () => 'You can now open Admin in McSween Transport: buses, passengers, drivers, cards and settings.' },
  company: { label: 'company manager', line: (company) => `You can now manage ${company || 'your company'} in McSween Transport: its passengers, buses and job requests.` },
  mechanic: { label: 'mechanic', line: () => 'You can now open the maintenance screens in McSween Transport: faults, inspections and servicing.' },
};
export const ACCESS_ROLES = Object.keys(ACCESS_TEXT);
export function accessGivenEmail({ name = '', role = '', company = '', customRole = '' }: { name?: string; role?: string; company?: string; customRole?: string }) {
  const custom = acctPlain(customRole, 60);
  const text = ACCESS_TEXT[role];
  if (!custom && !text) return null;
  return {
    subject: 'Your McSween Transport access has changed',
    body: accountEmailHtml({
      heading: custom ? `You've been given the ${custom} role` : `You now have ${text.label} access`,
      lines: [hello(name), custom ? `You can now open the screens that come with the ${custom} role in McSween Transport.` : text.line(acctPlain(company, 80))],
      button: { label: 'Open the app', url: ACCOUNT_SITE },
      note: "If you weren't expecting this, tell the office straight away.",
    }),
  };
}

// The office moved a passenger to another bus, took them off one, or moved
// a pickup spot they already had.
export function rideChangedEmail({ name = '', change, bus = '', oldBus = '', pickup = '' }: { name?: string; change: string; bus?: string; oldBus?: string; pickup?: string }) {
  const b = acctPlain(bus, 60), was = acctPlain(oldBus, 60), at = acctPlain(pickup, 120);
  const words = change === 'bus' ? { subject: `You now ride ${b}`, line: `The office moved you to ${b}${was ? ` (you were on ${was})` : ''}. Your app shows the new bus from now on.` }
    : change === 'bus_removed' ? { subject: 'You have been taken off your bus', line: `The office took you off ${was || 'your bus'}. Ask the office which bus to take.` }
      : change === 'pickup' ? { subject: 'Your pickup spot has changed', line: `The office moved your pickup spot to ${at}. Your app shows it on the map.` }
        : null;
  if (!words) return null;
  return {
    subject: words.subject,
    body: accountEmailHtml({
      heading: words.subject,
      lines: [hello(name), words.line],
      button: { label: 'Open the app', url: ACCOUNT_SITE },
      note: 'Questions? Ask in the app under Help, or call the office.',
    }),
  };
}

// An account signed in on a phone or browser it hasn't used before.
export function newSignInEmail({ name = '', device = '', at = Date.now() }: { name?: string; device?: string; at?: number }) {
  const what = acctPlain(device, 60) || 'a new phone or browser';
  return {
    subject: 'New sign-in to your McSween Transport account',
    body: accountEmailHtml({
      heading: 'New sign-in',
      lines: [hello(name), `Your account was just used to sign in on ${what} (${grenadaWhen(at)}).`, "If this was you, there's nothing to do."],
      button: { label: 'Reset my password', url: `${ACCOUNT_SITE}/forgot-password` },
      note: "If it wasn't you, reset your password now and tell the office.",
    }),
  };
}

// Sends one of these to one person, through Admin → Notifications. Returns
// emailWithPolicy's result; an undeliverable address counts as skipped and
// nothing is sent. Never throws for a delivery failure.
export async function sendAccountEmail(base44: any, key: string, to: unknown, email: { subject: string; body: string } | null, { companyId = '' } = {}) {
  const address = deliverableEmail(to);
  if (!address || !email) return { sent: 0, failed: 0, skipped: 1, results: [] };
  try {
    return await emailWithPolicy(base44, key, [{ email: address }],
      () => base44.asServiceRole.integrations.Core.SendEmail({ to: address, subject: email.subject, body: email.body, from_name: 'McSween Transport' }),
      { title: email.subject, companyId });
  } catch {
    return { sent: 0, failed: 1, skipped: 0, results: [] };
  }
}
