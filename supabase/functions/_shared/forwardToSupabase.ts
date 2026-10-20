// After the switch to Supabase (liveBackend.ts), the tablet app already
// installed on the buses still posts some calls straight to Base44: its
// background GPS, remote support, screen recordings and tablet controls
// (android/.../DriverTrackingHttp.kt and the Tablet* plugins), and, until the
// tablet reloads into the new version, its boarding and heartbeat calls. Those
// Base44 functions pass the call on, unchanged, to the same function on
// Supabase and hand back its answer, so the tablets keep working until they
// get the rebuilt app (step 8).
//
// Only the request body and its content type travel: tablets prove who they
// are with device_id + device_token in the body. A Base44 sign-in is not
// passed on (Supabase can't read it), so a person on an old open page is
// asked to sign in again rather than being let through.
import { LIVE_BACKEND, RUNS_ON } from './liveBackend.ts';

export const SUPABASE_FUNCTIONS = 'https://ghqpznxqngvhmkiwcauj.supabase.co/functions/v1/';
// Public by design: the browser app sends the same key with every call.
const PUBLISHABLE_KEY = 'sb_publishable_XeQJGv6I-Yicnl3WAu659g_Q7AqBc2C';
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const MAX_BODY = 6 * 1024 * 1024;

export function forwarding(live: string = LIVE_BACKEND, runsOn: string = RUNS_ON) {
  return live === 'supabase' && runsOn === 'base44';
}

// The answer to send back, or null to handle the call here on Base44.
export async function forwardToSupabase(req: Request, name: string, opts: { live?: string; runsOn?: string; fetchImpl?: typeof fetch } = {}): Promise<Response | null> {
  if (!forwarding(opts.live ?? LIVE_BACKEND, opts.runsOn ?? RUNS_ON)) return null;
  if (!NAME.test(name)) return Response.json({ error: 'Unknown function' }, { status: 404 });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
  const body = await req.arrayBuffer();
  if (body.byteLength > MAX_BODY) return Response.json({ error: 'Request too large' }, { status: 413 });
  const headers: Record<string, string> = { apikey: PUBLISHABLE_KEY };
  const type = req.headers.get('content-type');
  if (type) headers['Content-Type'] = type;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(SUPABASE_FUNCTIONS + name, { method: 'POST', headers, body, redirect: 'manual' });
  } catch {
    return Response.json({ error: 'Service busy. Please try again shortly.' }, { status: 503, headers: { 'Retry-After': '30' } });
  }
  const out = new Headers();
  for (const h of ['content-type', 'retry-after']) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(await res.arrayBuffer(), { status: res.status, headers: out });
}
