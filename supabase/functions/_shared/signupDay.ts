// Sign-up day (Admin → Sign-up day): a team at a hotel helps its staff get
// the app, sign in, set their pickup spot and get an NFC card. Every helper's
// phone, tablet or laptop shows the same list; this keeps who is helping whom
// and lets a helper tick "has the app".
//
// Called from nfcCards, which has already checked the caller (an admin, or
// the hotel's own approved manager) and passes its people loader. A manager
// can only ever reach their own hotel. Pickup spots and cards are saved with
// nfcCards' own set_pickup and issue actions.
//
// Actions: signup_state · signup_claim · signup_app · signup_add · signup_import · signup_invite
//
// Setup emails: adding someone with an email address can send them a
// personal link to set up the app (signupInvites.ts); signup_invite sends
// it, or sends it again, to people on the list who haven't signed in yet.

import { sendAccountEmail, signupInviteEmail } from './accountEmails.ts';
import { INVITE_DAYS, issueSignupInvite } from './signupInvites.ts';

// A helper's claim lapses after this long without being renewed, so a
// helper who walked away doesn't block the person forever.
export const SIGNUP_CLAIM_MS = 20 * 60_000;
const MAX_IMPORT = 300;
// At most this many setup emails per request (the page sends a long list in
// turns), and not again to the same person within a couple of minutes.
export const INVITES_PER_CALL = 20;
export const INVITE_GAP_MS = 2 * 60_000;

const text = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max);
const emailOf = (v) => {
  const e = text(v, 160).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
};
// One sign-up row per person: by email when there is one (their directory
// entry and their account then count as one), else by directory key.
export const signupRef = (p) => (emailOf(p.email) ? 'email:' + emailOf(p.email) : p.key);

const CARD = { 'Card Issued': 'issued', Expired: 'expired', Revoked: 'stopped' };

export async function signupDay(base44, user, body, { companyFilter, loadPeople, audit }) {
  const sr = base44.asServiceRole.entities;
  const asked = text(body.company_id, 60);
  if (companyFilter && asked && asked !== companyFilter) return Response.json({ error: 'You can only run sign-up days for your own company' }, { status: 403 });
  const companyId = companyFilter || asked;
  if (!companyId) return Response.json({ error: 'Pick a hotel first' }, { status: 400 });
  const company = await sr.Company.get(companyId).catch(() => null);
  if (!company) return Response.json({ error: 'Hotel not found' }, { status: 404 });
  const helperName = text(user.display_name || user.full_name || user.email || 'Helper', 80);
  const now = Date.now();

  const staffOf = async () => (await loadPeople(base44, companyId)).people.filter((p) => p.type === 'staff' && p.company_id === companyId);
  const helps = async () => (await sr.SignupHelp.filter({ company_id: companyId }, '-updated_date', 3000)).filter((h) => h.company_id === companyId);
  const fresh = (h) => !!h?.helper_id && Date.parse(h.claimed_at) > now - SIGNUP_CLAIM_MS;
  // Find the person on this hotel's list, or say they aren't on it.
  const personFor = async (ref) => {
    const want = text(ref, 200);
    return want ? (await staffOf()).find((p) => signupRef(p) === want) || null : null;
  };
  const save = async (existing, ref, person, data) => {
    const row = { company_id: companyId, person_ref: ref, person_name: person.name, ...data };
    return existing ? sr.SignupHelp.update(existing.id, row) : sr.SignupHelp.create(row);
  };
  // Emails one person their setup link. Returns a status word for the page:
  // sent · off (switched off in Admin → Notifications) · failed · no_email ·
  // signed_in (already has an account) · just_sent.
  const invite = async (person, rows) => {
    const email = emailOf(person.email);
    if (!email) return 'no_email';
    if (person.registered) return 'signed_in';
    const ref = signupRef(person);
    const h = rows.find((r) => r.person_ref === ref);
    if (Date.parse(h?.invite_sent_at) > now - INVITE_GAP_MS) return 'just_sent';
    const link = await issueSignupInvite(sr, companyId, email, now);
    const result = await sendAccountEmail(base44, 'signup_invite', email, signupInviteEmail({ name: person.name, hotel: company.name, url: link.url, days: INVITE_DAYS }), { companyId });
    if (!result.sent) return result.failed ? 'failed' : 'off';
    await save(h, ref, person, { invite_sent_at: new Date(now).toISOString(), invite_sent_by: helperName });
    await audit(base44, user, { action: 'update', entity: 'SignupHelp', page: '/admin/signup-day', summary: `Sign-up day: emailed ${person.name} a setup link for ${company.name || 'the hotel'}` });
    return 'sent';
  };
  const noJoinCode = () => Response.json({ error: 'This hotel has no join code yet. Make one in Admin → Companies first.', code: 'no_join_code' }, { status: 409 });

  switch (body.action) {
    case 'signup_state': {
      const [staff, rows, tokens] = await Promise.all([staffOf(), helps(), sr.PushToken.list('-updated_date', 5000)]);
      // A person whose account gets alerts has the app on their phone.
      const alerts = new Set(tokens.map((t) => emailOf(t.email)).filter(Boolean));
      const people = staff.map((p) => {
        const ref = signupRef(p);
        const h = rows.find((r) => r.person_ref === ref);
        const email = emailOf(p.email);
        const app = p.registered && email && alerts.has(email) ? 'alerts' : h?.has_app_at ? 'ticked' : '';
        return {
          key: p.key, ref, name: p.name, email: p.email || '', phone: p.phone || '', employee_id: p.employee_id || '',
          registered: !!p.registered, app,
          pickup: p.pickup_lat != null && p.pickup_lng != null, pickup_name: p.pickup_name || '',
          pickup_lat: p.pickup_lat ?? null, pickup_lng: p.pickup_lng ?? null,
          card: CARD[p.status] || '', card_tail: p.card?.card_uid ? String(p.card.card_uid).slice(-4) : '',
          bus: p.assigned_vehicle || '',
          helper: fresh(h) ? { name: h.helper_name || 'Someone', mine: h.helper_id === user.id, since: h.claimed_at } : null,
          invite_sent_at: h?.invite_sent_at || null, invite_sent_by: h?.invite_sent_by || '',
        };
      });
      return Response.json({
        company: { id: company.id, name: company.name || '', join_code: company.access_code || '' },
        people, me: helperName, claim_minutes: SIGNUP_CLAIM_MS / 60_000, at: new Date(now).toISOString(),
      });
    }

    // "I'm helping": take a person, or let go of them (release). Someone
    // else's current claim needs take_over, which the page asks about first.
    case 'signup_claim': {
      const ref = text(body.person_ref, 200);
      const person = await personFor(ref);
      if (!person) return Response.json({ error: "That person isn't on this hotel's list" }, { status: 404 });
      const h = (await helps()).find((r) => r.person_ref === ref);
      if (body.release) {
        if (h?.helper_id && (h.helper_id === user.id || !fresh(h) || body.take_over)) await sr.SignupHelp.update(h.id, { helper_id: '', helper_name: '', claimed_at: null });
        return Response.json({ ok: true });
      }
      if (fresh(h) && h.helper_id !== user.id && !body.take_over) {
        return Response.json({ ok: false, code: 'taken', helper_name: h.helper_name, error: `${h.helper_name || 'Someone'} is already helping ${person.name}.` }, { status: 409 });
      }
      await save(h, ref, person, { helper_id: user.id, helper_name: helperName, claimed_at: new Date(now).toISOString() });
      return Response.json({ ok: true });
    }

    // The helper saw the app on the person's phone (or takes the tick back).
    case 'signup_app': {
      const ref = text(body.person_ref, 200);
      const person = await personFor(ref);
      if (!person) return Response.json({ error: "That person isn't on this hotel's list" }, { status: 404 });
      const h = (await helps()).find((r) => r.person_ref === ref);
      const has = body.has_app === true;
      await save(h, ref, person, { has_app_at: has ? new Date(now).toISOString() : null, has_app_by: has ? helperName : '' });
      return Response.json({ ok: true });
    }

    // Add someone who isn't on the list yet, on the spot.
    case 'signup_add': {
      const name = text(body.name, 120);
      if (!name) return Response.json({ error: 'Type their name' }, { status: 400 });
      const typed = text(body.email, 160);
      const email = emailOf(typed);
      if (typed && !email) return Response.json({ error: 'That email address looks wrong' }, { status: 400 });
      const wantsInvite = body.send_invite === true && !!email;
      if (wantsInvite && !company.access_code) return noJoinCode();
      const staff = await staffOf();
      const same = staff.find((p) => email ? emailOf(p.email) === email : !emailOf(p.email) && p.name.trim().toLowerCase() === name.toLowerCase());
      if (same) {
        const status = wantsInvite ? await invite(same, await helps()) : undefined;
        return Response.json({ ok: true, existing: true, person_ref: signupRef(same), name: same.name, invite: status });
      }
      const contact = await sr.Contact.create({
        name, email, phone: text(body.phone, 40), employee_id: text(body.employee_id, 40),
        type: 'staff', company_id: companyId, company_name: company.name || '',
      });
      await audit(base44, user, { action: 'create', entity: 'Contact', record_id: contact.id, page: '/admin/signup-day', summary: `Sign-up day: added ${name} to ${company.name || 'the hotel'}` });
      const ref = email ? 'email:' + email : `contact:${contact.id}`;
      let status;
      if (wantsInvite) {
        const person = await personFor(ref);
        status = person ? await invite(person, await helps()) : 'failed';
      }
      return Response.json({ ok: true, person_ref: ref, name, invite: status });
    }

    // The hotel's staff list from a spreadsheet: adds the people not on it
    // yet and says which rows were skipped and why.
    case 'signup_import': {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return Response.json({ error: 'The list is empty' }, { status: 400 });
      if (rows.length > MAX_IMPORT) return Response.json({ error: `Add at most ${MAX_IMPORT} people at a time` }, { status: 400 });
      const staff = await staffOf();
      const emails = new Set(staff.map((p) => emailOf(p.email)).filter(Boolean));
      const names = new Set(staff.filter((p) => !emailOf(p.email)).map((p) => p.name.trim().toLowerCase()));
      const add = [], skipped = [];
      rows.forEach((row, i) => {
        const name = text(row?.name, 120), typed = text(row?.email, 160), email = emailOf(typed);
        if (!name) return skipped.push({ row: i + 1, reason: 'No name' });
        if (typed && !email) return skipped.push({ row: i + 1, name, reason: 'Email looks wrong' });
        if (email ? emails.has(email) : names.has(name.toLowerCase())) return skipped.push({ row: i + 1, name, reason: 'Already on the list' });
        if (email) emails.add(email); else names.add(name.toLowerCase());
        add.push({ name, email, phone: text(row?.phone, 40), employee_id: text(row?.employee_id, 40), type: 'staff', company_id: companyId, company_name: company.name || '' });
      });
      if (add.length) await sr.Contact.bulkCreate(add);
      if (add.length) await audit(base44, user, { action: 'create', entity: 'Contact', page: '/admin/signup-day', summary: `Sign-up day: added ${add.length} staff to ${company.name || 'the hotel'} from a list` });
      // The people with an email address, for the page to send setup emails to in turns.
      return Response.json({ ok: true, added: add.length, skipped, invite_refs: add.filter((p) => p.email).map((p) => 'email:' + p.email) });
    }

    // Email setup links to up to INVITES_PER_CALL people on the list.
    case 'signup_invite': {
      const refs = [...new Set((Array.isArray(body.person_refs) ? body.person_refs : [body.person_ref]).map((r) => text(r, 200)).filter(Boolean))];
      if (!refs.length) return Response.json({ error: 'Choose who to email' }, { status: 400 });
      if (refs.length > INVITES_PER_CALL) return Response.json({ error: `Send at most ${INVITES_PER_CALL} at a time` }, { status: 400 });
      if (!company.access_code) return noJoinCode();
      const [staff, rows] = await Promise.all([staffOf(), helps()]);
      const results = [];
      for (const ref of refs) {
        const person = staff.find((p) => signupRef(p) === ref);
        results.push({ ref, name: person?.name || '', status: person ? await invite(person, rows) : 'not_on_list' });
      }
      return Response.json({ ok: true, sent: results.filter((r) => r.status === 'sent').length, results });
    }
  }
  return Response.json({ error: 'Unknown action' }, { status: 400 });
}
