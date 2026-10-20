#!/usr/bin/env node
// McSween Transport's sign-in emails (step 7 of the move from Base44).
//
// Supabase Auth sends three emails for the app:
//   confirmation  the 6-digit code a new account types in on the sign-up screen
//   recovery      "Forgot password": a button to our /reset-password page
//   invite        an admin invited someone: a button to create their password
// The buttons carry the one-time key ({{ .TokenHash }}) to our own page, and
// nothing is used up until the person saves their new password there. So the
// link works in any browser or phone, and mail scanners that open links can't
// spend it first. ({{ .RedirectTo }} is the site the request came from.)
//
//   node tools/supabase/auth-emails.mjs --check           build them and check them
//   node tools/supabase/auth-emails.mjs --preview <dir>   write sample copies to look at
//   node tools/supabase/auth-emails.mjs --push            put them on the Supabase project
//
// --push runs in the "Supabase sign-in emails" GitHub workflow with the
// SUPABASE_ACCESS_TOKEN secret the functions deploy already uses. It also keeps
// both sites on Supabase's redirect list and the sign-up code at 6 digits (the
// sign-up screen has 6 boxes). Once a RESEND_API_KEY secret is there as well,
// the emails go out through Resend from no-reply@mcsweenstransport.com and the
// functions get the same key. It never prints a secret.
//
// Supabase only lets a free project change these emails once it sends them
// through its own email service, so until Resend is set up the emails wait
// (the run says so) and only the redirect list and code length are set.
//
// When it finishes it also leaves a one-line note in the project's API logs (a
// request to /auth/v1/health?tt_ci=auth-emails&...): ok or the error, and what
// changed. That way whoever looks after the project can see how the last run
// went from the Supabase logs, without opening GitHub. The note never holds a
// secret.
//
// Changing a word here and saving is enough: the workflow puts it live.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SITES = ['https://new.mcsweenstransport.com', 'https://app.mcsweenstransport.com'];
export const LOGO_URL = 'https://app.mcsweenstransport.com/brand/icon-192.png?v=mcsween1';
export const CODE_LENGTH = 6;
const SENDER_NAME = 'McSween Transport';
const DEFAULT_FROM = 'no-reply@mcsweenstransport.com';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";
const C = {
  page: '#eef2f5', card: '#ffffff', ink: '#0f172a', text: '#334155', muted: '#64748b',
  teal: '#016f83', line: '#e2e8f0', codeBg: '#f1f5f9',
};

// "in 1 hour" from Supabase's code lifetime in seconds.
export function expiresText(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return 'in 1 hour';
  if (s % 3600 === 0) { const h = s / 3600; return `in ${h} hour${h === 1 ? '' : 's'}`; }
  const m = Math.max(1, Math.round(s / 60));
  return `in ${m} minute${m === 1 ? '' : 's'}`;
}

const p = (html, style = '') =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.55;color:${C.text};${style}">${html}</p>`;

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
<tr><td align="center" bgcolor="${C.teal}" style="border-radius:10px;background:${C.teal};">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
</td></tr></table>`;
}

function codeBox(code) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
<tr><td align="center" bgcolor="${C.codeBg}" style="background:${C.codeBg};border-radius:12px;padding:18px 12px 18px 22px;font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:10px;color:${C.ink};">${code}</td></tr></table>`;
}

function fallback(href) {
  return p(`Button not working? Copy this into your browser:<br><a href="${href}" target="_blank" style="color:${C.teal};word-break:break-all;">${href}</a>`,
    `font-size:13px;color:${C.muted};margin:0;`);
}

function page({ title, preheader, heading, body, footnote }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td align="center" style="padding:0 0 12px;">
<img src="${LOGO_URL}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;border:0;border-radius:16px;">
</td></tr>
<tr><td align="center" style="padding:0 0 20px;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.2px;color:${C.ink};">McSween <span style="color:${C.teal};">Transport</span></td></tr>
<tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:32px 28px;">
<h1 style="margin:0 0 12px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${C.ink};">${heading}</h1>
${body}
</td></tr>
<tr><td align="center" style="padding:20px 16px 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted};">${footnote}</td></tr>
<tr><td align="center" style="padding:12px 16px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};">McSween Transport &middot; Grenada<br>This message was sent automatically. Replies aren&#39;t read.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

// The link in a reset or invite email: our page, with the one-time key.
const pageLink = (type) => `{{ .RedirectTo }}/reset-password?token={{ .TokenHash }}&amp;type=${type}`;

export function buildEmails({ expires = 'in 1 hour' } = {}) {
  const reset = pageLink('recovery');
  const invite = pageLink('invite');
  return {
    confirmation: {
      subject: 'Your McSween Transport sign-up code',
      html: page({
        title: 'Your sign-up code',
        preheader: 'Enter this code to finish creating your account.',
        heading: 'Confirm your email',
        body: p('Enter this code on the sign-up screen to finish creating your McSween Transport account.')
          + codeBox('{{ .Token }}')
          + p(`The code expires ${expires}.`, `font-size:14px;color:${C.muted};margin:0;`),
        footnote: 'Didn&#39;t try to sign up? You can ignore this email.',
      }),
    },
    recovery: {
      subject: 'Reset your McSween Transport password',
      html: page({
        title: 'Reset your password',
        preheader: 'Choose a new password for your McSween Transport account.',
        heading: 'Reset your password',
        body: p('We got a request to reset the password for your McSween Transport account. Tap the button to choose a new one.')
          + button(reset, 'Choose a new password')
          + p(`The link works once and expires ${expires}. You can open it on any phone or computer.`, `font-size:14px;color:${C.muted};`)
          + fallback(reset),
        footnote: 'Didn&#39;t ask for this? You can ignore this email. Your password stays the same.',
      }),
    },
    invite: {
      subject: 'You’re invited to McSween Transport',
      html: page({
        title: 'You’re invited',
        preheader: 'Create your password to start using McSween Transport.',
        heading: 'You’re invited',
        body: p('You’ve been added to McSween Transport. Tap the button to create your password, then sign in with this email address.')
          + button(invite, 'Create your password')
          + p(`The link works once and expires ${expires}.`, `font-size:14px;color:${C.muted};`)
          + fallback(invite),
        footnote: 'Not expecting this? You can ignore this email.',
      }),
    },
  };
}

// Problems with the built emails (an empty list means they're fine).
export function checkEmails(emails) {
  const problems = [];
  const need = {
    confirmation: ['{{ .Token }}'],
    recovery: ['{{ .TokenHash }}', '/reset-password?token=', 'type=recovery'],
    invite: ['{{ .TokenHash }}', '/reset-password?token=', 'type=invite'],
  };
  for (const [kind, words] of Object.entries(need)) {
    const email = emails[kind];
    if (!email?.subject || !email?.html) { problems.push(`${kind}: missing`); continue; }
    for (const w of words) if (!email.html.includes(w)) problems.push(`${kind}: no ${w}`);
    if (email.html.includes('ConfirmationURL')) problems.push(`${kind}: uses ConfirmationURL (spent by mail scanners)`);
    if (/<script/i.test(email.html)) problems.push(`${kind}: has a script`);
    if (!email.html.includes(LOGO_URL)) problems.push(`${kind}: no logo`);
    if (email.html.length > 40_000) problems.push(`${kind}: too long`);
    const opens = (email.html.match(/\{\{/g) || []).length;
    const closes = (email.html.match(/\}\}/g) || []).length;
    if (opens !== closes) problems.push(`${kind}: unbalanced {{ }}`);
    if (/\{\{(?!\s*\.(Token|TokenHash|RedirectTo|SiteURL|Email)\s*\}\})/.test(email.html)) problems.push(`${kind}: unknown template value`);
  }
  return problems;
}

// Every redirect the app uses stays allowed; nothing already there is removed.
export function mergeAllowList(value) {
  const have = String(value || '').split(',').map((s) => s.trim().replace(/\\/g, '')).filter(Boolean);
  const want = SITES.flatMap((s) => [s, `${s}/**`]);
  return [...new Set([...have, ...want])].join(',');
}

// Resend's SMTP settings for Supabase Auth.
export function smtpSettings({ key, from = '' }) {
  return {
    smtp_host: 'smtp.resend.com',
    smtp_port: '465', // Supabase wants the port as text
    smtp_user: 'resend',
    smtp_pass: key,
    smtp_admin_email: from || DEFAULT_FROM,
    smtp_sender_name: SENDER_NAME,
  };
}

// Sign-in emails the project may send in an hour once it has its own sender.
// (Supabase drops this to 2 when the sender changes; Resend's free plan allows
// 100 a day.)
export const EMAILS_PER_HOUR = 30;

// What has to change on the project's Auth settings (pass no emails to leave
// them alone; `sender` says the project sends through its own email service).
export function planAuthConfig(current, { emails = {}, sender = false } = {}) {
  const patch = {};
  for (const [kind, { subject, html }] of Object.entries(emails)) {
    const contentKey = `mailer_templates_${kind}_content`;
    const subjectKey = `mailer_subjects_${kind}`;
    if ((current[subjectKey] ?? null) !== subject) patch[subjectKey] = subject;
    if ((current[contentKey] ?? null) !== html) patch[contentKey] = html;
  }
  const allow = mergeAllowList(current.uri_allow_list);
  if (allow !== String(current.uri_allow_list || '')) patch.uri_allow_list = allow;
  if ('mailer_otp_length' in current && Number(current.mailer_otp_length) !== CODE_LENGTH) patch.mailer_otp_length = CODE_LENGTH;
  if (sender && 'rate_limit_email_sent' in current && !(Number(current.rate_limit_email_sent) >= EMAILS_PER_HOUR)) {
    patch.rate_limit_email_sent = EMAILS_PER_HOUR;
  }
  return patch;
}

export async function push({ ref, token, resendKey = '', from = '', fetchImpl = fetch, log = console.log }) {
  if (!/^[a-z0-9]{20}$/.test(String(ref || ''))) throw new Error('PROJECT_REF is not a Supabase project ref');
  const hide = (text) => [token, resendKey].filter(Boolean).reduce((t, s) => t.split(s).join('***'), String(text));
  const call = async (method, path, body) => {
    const res = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${method} ${path} answered ${res.status}: ${hide(text).slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };

  let current = await call('GET', '/config/auth');
  const emails = buildEmails({ expires: expiresText(current.mailer_otp_exp) });
  const problems = checkEmails(emails);
  if (problems.length) throw new Error(`The emails failed their checks: ${problems.join('; ')}`);
  // The sender goes first: Supabase refuses changed emails from a free project
  // that still sends through its built-in email.
  const changed = [];
  if (resendKey) {
    const smtp = smtpSettings({ key: resendKey, from });
    await call('PATCH', '/config/auth', smtp);
    await call('POST', '/secrets', [{ name: 'RESEND_API_KEY', value: resendKey }]);
    changed.push('smtp');
    log(`Emails now go out through Resend from ${smtp.smtp_admin_email}; the functions have the same key.`);
    current = await call('GET', '/config/auth'); // changing the sender changes other settings too
  }
  const sender = Boolean(current.smtp_host);
  const want = sender ? emails : {};
  const patch = planAuthConfig(current, { emails: want, sender });
  if (Object.keys(patch).length) await call('PATCH', '/config/auth', patch);
  changed.push(...Object.keys(patch));
  log(changed.length ? `Changed: ${changed.join(', ')}` : 'Everything was already up to date.');
  if (!sender) {
    log('::warning::The new emails wait for Resend: Supabase only lets a free project change its emails once it sends them itself. Add the RESEND_API_KEY repository secret.');
  }

  const after = await call('GET', '/config/auth');
  const left = Object.keys(planAuthConfig(after, { emails: want, sender }));
  if (left.length) throw new Error(`Supabase did not keep: ${left.join(', ')}`);
  log(`Redirects allowed: ${String(after.uri_allow_list || '').split(',').join(' ')}`);
  log(`Site URL: ${after.site_url || '(none)'}; sign-up code: ${after.mailer_otp_length ?? '?'} digits, lasts ${expiresText(after.mailer_otp_exp).replace(/^in /, '')}`);
  log(`Sending through: ${after.smtp_host ? after.smtp_host : 'Supabase\'s built-in email (team members only)'}`);
  return {
    changed,
    templates: sender ? 'live' : 'waiting for Resend',
    otp: after.mailer_otp_length ?? '?',
    smtp: after.smtp_host ? 'custom' : 'built-in',
    perHour: after.rate_limit_email_sent ?? '?',
    redirects: String(after.uri_allow_list || '').split(',').filter(Boolean).length,
  };
}

// The note this run leaves in the project's API logs (see the top of the file).
export function reportUrl(ref, fields) {
  const q = new URLSearchParams({ tt_ci: 'auth-emails' });
  for (const [k, v] of Object.entries(fields)) q.set(k, String(v).slice(0, 400));
  return `https://${ref}.supabase.co/auth/v1/health?${q}`;
}

async function report(ref, fields, fetchImpl = fetch) {
  if (!/^[a-z0-9]{20}$/.test(String(ref || ''))) return;
  await fetchImpl(reportUrl(ref, fields), { method: 'GET' }).then((r) => r.body?.cancel()).catch(() => {});
}

// Sample values, for --preview only.
function sample(html) {
  return html
    .replaceAll('{{ .RedirectTo }}', SITES[0])
    .replaceAll('{{ .TokenHash }}', 'pkce_3f9c1e0b7d2a4c6e8f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2')
    .replaceAll('{{ .Token }}', '482913')
    .replaceAll('{{ .Email }}', 'driver@example.com');
}

async function main(argv) {
  if (argv.includes('--check')) {
    const problems = checkEmails(buildEmails());
    if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
    console.log('The sign-in emails build and pass their checks.');
    return;
  }
  const at = argv.indexOf('--preview');
  if (at >= 0) {
    const dir = argv[at + 1] || 'email-preview';
    mkdirSync(dir, { recursive: true });
    for (const [kind, { subject, html }] of Object.entries(buildEmails())) {
      writeFileSync(join(dir, `${kind}.html`), sample(html));
      console.log(`${kind}.html  "${subject}"`);
    }
    return;
  }
  if (argv.includes('--push')) {
    const ref = process.env.PROJECT_REF;
    const token = process.env.SUPABASE_ACCESS_TOKEN || '';
    const resendKey = process.env.RESEND_API_KEY || '';
    if (!token) {
      console.log('::notice::Skipped: add the SUPABASE_ACCESS_TOKEN repository secret.');
      await report(ref, { result: 'skipped', why: 'no SUPABASE_ACCESS_TOKEN secret' });
      return;
    }
    try {
      const done = await push({ ref, token, resendKey, from: process.env.EMAIL_FROM || '' });
      await report(ref, {
        result: done.templates === 'live' ? 'ok' : 'waiting-for-resend',
        changed: done.changed.join(' ') || 'nothing', templates: done.templates, otp: done.otp, smtp: done.smtp, perHour: done.perHour, redirects: done.redirects,
      });
    } catch (error) {
      const hide = (t) => [token, resendKey].filter(Boolean).reduce((s, x) => s.split(x).join('***'), String(t));
      await report(ref, { result: 'failed', error: hide(error?.message || error) });
      throw error;
    }
    return;
  }
  console.log('Use --check, --preview <dir> or --push');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message || error); process.exit(1); });
}
