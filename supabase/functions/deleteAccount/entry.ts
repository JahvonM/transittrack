import { createClientFromRequest } from '../_shared/base44-compat.ts';

const NOT_DELETED = "Your account couldn't be deleted. Try again later, or ask the office.";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => { const s = e?.status ?? e?.response?.status; if (s === 401 || s === 403) return null; throw e; }); // no session: signed out; an outage stays an error
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Only the signed-in account owner can delete their own account: the
    // sign-in first, then the person. Removing the sign-in too lets the same
    // email sign up again later. If the sign-in can't be removed (a 3D scan
    // keeps its maker's sign-in, or Supabase is down), nothing is deleted, so
    // the person can still sign in and try again or ask the office.
    if (user.auth_user_id && !(await base44.asServiceRole.deleteSignIn(user.auth_user_id))) {
      return Response.json({ error: NOT_DELETED }, { status: 409 });
    }
    await base44.asServiceRole.entities.User.delete(user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
