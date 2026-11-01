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
// Actions: signup_state · signup_claim · signup_app · signup_add · signup_import

// A helper's claim lapses after this long without being renewed, so a
// helper who walked away doesn't block the person forever.
export const SIGNUP_CLAIM_MS = 20 * 60_000;
const MAX_IMPORT = 300;

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
      const staff = await staffOf();
      const same = staff.find((p) => email ? emailOf(p.email) === email : !emailOf(p.email) && p.name.trim().toLowerCase() === name.toLowerCase());
      if (same) return Response.json({ ok: true, existing: true, person_ref: signupRef(same), name: same.name });
      const contact = await sr.Contact.create({
        name, email, phone: text(body.phone, 40), employee_id: text(body.employee_id, 40),
        type: 'staff', company_id: companyId, company_name: company.name || '',
      });
      await audit(base44, user, { action: 'create', entity: 'Contact', record_id: contact.id, page: '/admin/signup-day', summary: `Sign-up day: added ${name} to ${company.name || 'the hotel'}` });
      return Response.json({ ok: true, person_ref: email ? 'email:' + email : `contact:${contact.id}`, name });
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
      return Response.json({ ok: true, added: add.length, skipped });
    }
  }
  return Response.json({ error: 'Unknown action' }, { status: 400 });
}
