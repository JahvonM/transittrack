import { secrets } from './base44-compat.ts';

// Delete a person's Supabase sign-in (email, Google or Apple), so an app login
// that was deleted cannot simply be signed into again. Deleting the app
// account alone left the sign-in, and signing in made a fresh, empty account.
// true when it is gone (or was already). Never throws: the caller has already
// removed everything the person could use.
export async function deleteSignIn(authUserId: string): Promise<boolean> {
 if (!authUserId) return false;
 const url = String(secrets.get('SUPABASE_URL') || '').replace(/\/+$/, '');
 let key = '';
 try { key = JSON.parse(secrets.get('SUPABASE_SECRET_KEYS') || '{}').default || ''; } catch { /* use the older key */ }
 key ||= secrets.get('SUPABASE_SERVICE_ROLE_KEY') || '';
 if (!/^https:\/\/[^/]+\.supabase\.co$/.test(url) || !key) return false;
 try {
  const res = await fetch(url + '/auth/v1/admin/users/' + encodeURIComponent(authUserId), {
   method: 'DELETE', redirect: 'error', signal: AbortSignal.timeout(15000),
   headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }) },
  });
  await res.body?.cancel().catch(() => {});
  if (!res.ok && res.status !== 404) console.warn(`[signin] could not delete a sign-in (${res.status})`);
  return res.ok || res.status === 404;
 } catch { console.warn('[signin] could not delete a sign-in'); return false; }
}
