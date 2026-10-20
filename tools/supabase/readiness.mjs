#!/usr/bin/env node
// Is the Supabase project ready for the switch from Base44? (step 7)
// Checks, by name only (never a value):
//   - the function secrets the app needs are set on Supabase;
//   - which sign-in providers are turned on (Google, Apple).
//
//   node tools/supabase/readiness.mjs --push    run against the project (GitHub workflow)
//
// Runs in the "Supabase readiness" GitHub workflow with the SUPABASE_ACCESS_TOKEN
// secret. Like the sign-in emails workflow it leaves a one-line note in the
// project's API logs (/auth/v1/health?tt_ci=readiness&...), so the result can
// be read without GitHub access. Re-run: change RUN below, or run the workflow
// by hand in GitHub.
import { pathToFileURL } from 'node:url';

export const RUN = 2;

// Secrets the functions read (supabase/functions/README.md). SUPABASE_URL and
// the project's keys are built in, so they're not listed.
export const NEEDED = {
  FIREBASE_SERVICE_ACCOUNT: 'push notifications',
  TT_SUPPORT_ENABLED: 'tablet screen sharing',
  TT_SUPPORT_TRANSPORT: 'tablet screen sharing',
  TT_SUPPORT_TURN_URL: 'tablet screen sharing',
  TT_SUPPORT_TURN_SECRET: 'tablet screen sharing',
  RESEND_API_KEY: 'emails from the functions',
};
export const OPTIONAL = ['TT_SUPPORT_STUN_URL', 'TT_DURABLE_WRITES_ENABLED', 'EMAIL_FROM', 'ALLOWED_ORIGINS'];

export function summarize(secretNames, auth) {
  const have = new Set(secretNames);
  const missing = Object.keys(NEEDED).filter((name) => !have.has(name));
  return {
    result: missing.length ? 'missing' : 'ok',
    missing: missing.join(' ') || 'none',
    optional: OPTIONAL.filter((name) => have.has(name)).join(' ') || 'none',
    google: auth?.external_google_enabled ? 'on' : 'off',
    apple: auth?.external_apple_enabled ? 'on' : 'off',
    email: auth?.external_email_enabled === false ? 'off' : 'on',
    minPassword: auth?.password_min_length ?? '?',
  };
}

export async function check({ ref, token, fetchImpl = fetch }) {
  if (!/^[a-z0-9]{20}$/.test(String(ref || ''))) throw new Error('PROJECT_REF is not a Supabase project ref');
  const get = async (path) => {
    const res = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase GET ${path} answered ${res.status}: ${text.split(token).join('***').slice(0, 200)}`);
    return JSON.parse(text);
  };
  const secrets = await get('/secrets');
  const auth = await get('/config/auth');
  return summarize((Array.isArray(secrets) ? secrets : []).map((s) => s?.name).filter(Boolean), auth);
}

export function reportUrl(ref, fields) {
  const q = new URLSearchParams({ tt_ci: 'readiness', run: String(RUN) });
  for (const [k, v] of Object.entries(fields)) q.set(k, String(v).slice(0, 400));
  return `https://${ref}.supabase.co/auth/v1/health?${q}`;
}

async function main(argv) {
  if (!argv.includes('--push')) { console.log('Use --push'); return; }
  const ref = process.env.PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN || '';
  const report = (fields) => fetch(reportUrl(ref, fields)).then((r) => r.body?.cancel()).catch(() => {});
  if (!token) { await report({ result: 'skipped', why: 'no SUPABASE_ACCESS_TOKEN secret' }); return; }
  try {
    const done = await check({ ref, token });
    for (const [k, v] of Object.entries(done)) console.log(`${k}: ${v}`);
    await report(done);
  } catch (error) {
    await report({ result: 'failed', error: String(error?.message || error).split(token).join('***') });
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exit(1); });
}
