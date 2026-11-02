import { createClientFromRequest } from '../_shared/base44-compat.ts';
import { reserveAttempt } from '../_shared/atomicOps.ts';
import { sha256Hex } from '../_shared/visitorLinks.ts';
import { SHARE_MS, SHARE_PURPOSE, shareState, shareSubject, shareUrl, shareView } from '../_shared/journeyShare.ts';

// Journey sharing (rules in base44/shared/journeyShare.ts).
// Passenger: start · stop · mine.   Anyone with a link: view.
const TOKEN = /^[a-f0-9]{64}$/;
const GONE = 'This journey link has ended or isn’t valid.';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
const transitDayOf = (at: number) => new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/Grenada' });

async function approvedCompany(db: any, user: any) {
  const rows = await db.CompanyMembership.filter({ user_id: user.id, active: true, scope: 'passenger' }, '-updated_date', 100);
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.code_hash && !row.expires_at) { ids.add(row.company_id); continue; }
    if (!row.code_hash) continue;
    const company = await db.Company.get(row.company_id).catch(() => null);
    if (!company) continue;
    if (await sha256Hex(company.access_code || '') === row.code_hash) ids.add(row.company_id);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

// The passenger's bus, and what their taps are filed under (never sent out).
async function rider(db: any, user: any, companyId: string) {
  const contacts = (await db.Contact.filter({ company_id: companyId, email: user.email }, '-updated_date', 50))
    .filter((c: any) => c.company_id === companyId && String(c.email || '').toLowerCase() === String(user.email || '').toLowerCase());
  const memberships = await db.CompanyMembership.filter({ user_id: user.id, company_id: companyId, active: true, scope: 'passenger' }, '-updated_date', 20);
  const vehicleId = contacts.find((c: any) => c.vehicle_id)?.vehicle_id || memberships.find((m: any) => m.vehicle_id)?.vehicle_id || '';
  const cards = [
    ...await db.NfcCard.filter({ company_id: companyId, holder_source: 'user', holder_id: user.id }, '-issue_date', 50),
    ...(await Promise.all(contacts.map((c: any) => db.NfcCard.filter({ company_id: companyId, holder_source: 'contact', holder_id: c.id }, '-issue_date', 50)))).flat(),
  ].filter((c: any) => c.company_id === companyId);
  const tags = [...new Set([user.id, ...cards.map((c: any) => c.card_uid), ...contacts.flatMap((c: any) => [c.id, c.nfc_card_tag])].filter(Boolean))];
  const keys = new Set(['user:' + user.id, ...contacts.map((c: any) => 'contact:' + c.id)]);
  return { vehicleId, tags, keys };
}

async function endShares(db: any, userId: string, now = Date.now()) {
  const rows = await db.VerificationGrant.filter({ purpose: SHARE_PURPOSE, subject: shareSubject(userId) }, '-created_date', 50);
  for (const g of rows) if (Date.parse(g.expires_at) > now) await db.VerificationGrant.update(g.id, { expires_at: new Date(now).toISOString() });
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req), db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');

    // --- anyone with the link ---
    if (action === 'view') {
      if (!TOKEN.test(body.token || '')) return json({ error: GONE }, 404);
      const digest = await sha256Hex(body.token);
      const [grant] = await db.VerificationGrant.filter({ token_hash: digest, purpose: SHARE_PURPOSE }, '-created_date', 1);
      const now = Date.now();
      if (!grant || !(Date.parse(grant.expires_at) > now)) return json({ error: GONE }, 404);
      if (!(await reserveAttempt(base44, 'journey-view:' + digest, 30, 60_000))) return json({ error: 'Please wait a moment before refreshing' }, 429);
      const person = grant.member_user_id ? await db.User.get(grant.member_user_id).catch(() => null) : null;
      if (!person || (await approvedCompany(db, person)) !== grant.company_id) return json({ error: GONE }, 404);
      const me = await rider(db, person, grant.company_id);
      // A change of bus ends the link: the passenger can share again.
      if (me.vehicleId !== grant.vehicle_id) return json({ error: GONE }, 404);
      const vehicle = await db.Vehicle.get(grant.vehicle_id).catch(() => null);
      if (!vehicle || vehicle.company_id !== grant.company_id) return json({ error: GONE }, 404);
      const rows = await db.StaffCheckIn.filter({ company_id: grant.company_id, vehicle_id: grant.vehicle_id }, '-created_date', 300);
      const today = transitDayOf(now);
      const taps = rows.filter((r: any) => r.company_id === grant.company_id && r.vehicle_id === grant.vehicle_id && (me.tags.includes(r.card_tag) || me.keys.has(r.person_key)))
        .map((r: any) => ({ status: r.status, at: r.boarded_at || r.created_date }))
        .filter((t: any) => transitDayOf(Date.parse(t.at)) === today);
      const state = shareState(taps, Date.parse(grant.created_date) || now, now);
      // Got off: the journey is over. The link closes shortly after.
      if (state.state === 'ended') await db.VerificationGrant.update(grant.id, { expires_at: new Date(Math.min(Date.parse(grant.expires_at), now + 15 * 60_000)).toISOString() }).catch(() => {});
      const workplace = (await db.Workplace.filter({ company_id: grant.company_id }, '-updated_date', 1).catch(() => []))[0];
      return json(shareView({ state, person, vehicle, direction: vehicle.trip_direction, workplaceName: workplace?.name, expiresAt: grant.expires_at, now }));
    }

    // --- the passenger ---
    const session = await base44.auth.me().catch(() => null);
    if (!session) return json({ error: 'Sign in required' }, 401);
    const user = await db.User.get(session.id).catch(() => null);
    if (!user || !['staff', 'passenger'].includes(user.role)) return json({ error: 'Passenger access required' }, 403);
    const companyId = await approvedCompany(db, user);
    if (!companyId) return json({ error: 'Verified company access required' }, 403);

    if (action === 'mine') {
      const rows = await db.VerificationGrant.filter({ purpose: SHARE_PURPOSE, subject: shareSubject(user.id) }, '-created_date', 5);
      const live = rows.find((g: any) => Date.parse(g.expires_at) > Date.now());
      return json({ active: !!live, expires_at: live?.expires_at || null });
    }
    if (action === 'stop') {
      await endShares(db, user.id);
      return json({ ok: true, active: false });
    }
    if (action === 'start') {
      if (!(await reserveAttempt(base44, 'journey-share:' + user.id, 10, 3600_000))) return json({ error: 'You’ve made several links this hour. Use the last one, or try later.' }, 429);
      const me = await rider(db, user, companyId);
      if (!me.vehicleId) return json({ error: 'Your company hasn’t assigned you a bus yet.' }, 409);
      // One live link per passenger: a new one ends the old.
      await endShares(db, user.id);
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join('');
      const expires_at = new Date(Date.now() + SHARE_MS).toISOString();
      await db.VerificationGrant.create({ token_hash: await sha256Hex(token), purpose: SHARE_PURPOSE, subject: shareSubject(user.id), member_user_id: user.id, company_id: companyId, vehicle_id: me.vehicleId, expires_at });
      return json({ ok: true, url: shareUrl(token), expires_at });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status ?? 500;
    return json({ error: status === 429 ? 'Server is busy. Try again shortly.' : 'Journey sharing isn’t available right now. Try again.' }, status === 429 ? 429 : status === 401 ? 401 : 503);
  }
}
