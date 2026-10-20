// Supabase only (step 7). What the app's browser used to ask Base44 for
// directly, now through this function: file uploads, a link to a private
// file, inviting a person, and the admin assistant. Written by hand; not a
// copy of a Base44 function, so build-functions.mjs leaves it alone.
//
//   multipart form: file + area ("public" | "private")  -> { file_url } | { file_uri }
//   { action: "sign", file_uri, expires_in }             -> { signed_url }
//   { action: "invite", email, role }   (admins)         -> { ok, invited }
//   { action: "llm", ...InvokeLLM params } (admins)      -> the assistant's answer
import { createClientFromRequest, serve, httpError, secrets } from '../_shared/base44-compat.ts';

const MAX_UPLOAD = 25 * 1024 * 1024;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/;
const ROLES = new Set(['user', 'admin']);
// Where the invitation's "Create your password" button goes: the site the admin
// sent it from (the email template adds /reset-password). Anything else falls
// back to the project's Site URL.
// The Base44 address is opened by the tablets, phone app and desktop app until they are rebuilt.
const SITES = new Set(['https://new.mcsweenstransport.com', 'https://app.mcsweenstransport.com', 'https://eager-transit-track-go.base44.app']);

function serverKey(): string {
  try {
    const keys = JSON.parse(secrets.get('SUPABASE_SECRET_KEYS') || '{}');
    if (keys?.default) return keys.default;
  } catch { /* older key below */ }
  const legacy = secrets.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw httpError(500, 'Server not configured');
  return legacy;
}

async function invite(base44: ReturnType<typeof createClientFromRequest>, emailRaw: unknown, roleRaw: unknown, origin: string | null) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!EMAIL.test(email)) throw httpError(400, 'Enter a valid email address');
  const role = ROLES.has(String(roleRaw)) ? String(roleRaw) : 'user';
  const db = base44.asServiceRole.entities;
  // The person exists straight away (like Base44), and their sign-in account is
  // linked to them by email once they accept the invitation.
  const existing = (await db.User.filter({ email }, '-created_date', 1))[0];
  if (!existing) await db.User.create({ email, role, is_verified: false });
  const url = (secrets.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  const key = serverKey();
  const back = origin && SITES.has(origin) ? `?redirect_to=${encodeURIComponent(origin)}` : '';
  const res = await fetch(`${url}/auth/v1/invite${back}`, {
    method: 'POST',
    headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (res.status === 422) { await res.body?.cancel(); return { ok: true, invited: false, reason: 'already_has_account' }; }
  if (!res.ok) {
    console.error(`[invite] ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    throw httpError(502, 'The invitation could not be sent');
  }
  await res.body?.cancel();
  return { ok: true, invited: true };
}

serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
  const base44 = createClientFromRequest(req);
  const me = await base44.auth.me().catch(() => null);
  if (!me) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const core = base44.asServiceRole.integrations.Core;

  if ((req.headers.get('content-type') || '').startsWith('multipart/form-data')) {
    if (Number(req.headers.get('content-length') || 0) > MAX_UPLOAD + 64 * 1024) return Response.json({ error: 'That file is too big' }, { status: 413 });
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || !file.size) return Response.json({ error: 'No file' }, { status: 400 });
    if (file.size > MAX_UPLOAD) return Response.json({ error: 'That file is too big' }, { status: 413 });
    return Response.json(form?.get('area') === 'private' ? await core.UploadPrivateFile({ file }) : await core.UploadPublicFile({ file }));
  }

  const body = await req.json().catch(() => ({}));
  switch (body?.action) {
    case 'sign': {
      const uri = String(body.file_uri || '');
      // Replies already turn stored private files into signed links.
      const base = (secrets.get('SUPABASE_URL') || '').replace(/\/+$/, '');
      if (base && uri.startsWith(`${base}/storage/v1/object/sign/`)) return Response.json({ signed_url: uri });
      return Response.json(await core.CreateFileSignedUrl({ file_uri: uri, expires_in: body.expires_in }));
    }
    case 'invite':
      if (me.role !== 'admin') return Response.json({ error: 'Administrators only' }, { status: 403 });
      return Response.json(await invite(base44, body.email, body.role, req.headers.get('origin')));
    case 'llm': {
      if (me.role !== 'admin') return Response.json({ error: 'Administrators only' }, { status: 403 });
      const { action: _action, ...params } = body;
      return Response.json(await core.InvokeLLM(params));
    }
    default:
      return Response.json({ error: 'Unknown action' }, { status: 400 });
  }
});
