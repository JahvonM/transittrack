import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Staff NFC card issuing (Admin → Card issuing). Cards are identified by the
// chip's built-in ID (UID), which is what the bus boarding kiosks already
// match on, so an issued card works for check-in straight away.
//
// Actions: people · issue · verify · revoke · add_holder · keypad_code
// Admins see everyone; company managers only their own company.

const normalizeUid = (v) => String(v || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
const clean = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max);

const ACCESS_BY_ROLE = {
  Driver: 'DEPOT_DRIVER_ZONE',
  Mechanic: 'DEPOT_WORKSHOP',
  Staff: 'STAFF_BUS_BOARDING',
  Dispatcher: 'DEPOT_DISPATCH',
  Inspector: 'DEPOT_ALL_ACCESS',
  Supervisor: 'DEPOT_ALL_ACCESS',
};

async function audit(base44, user, fields) {
  try {
    await base44.asServiceRole.entities.AuditLog.create({
      actor_email: user.email || '', actor_name: user.full_name || user.email || '', actor_role: user.role || '',
      entity: 'NfcCard', page: '/admin/cards', ...fields,
    });
  } catch { /* logging must never block issuing */ }
}

// Everyone who can hold a card, as one list: drivers, mechanics, staff
// (directory contacts merged with staff logins) and extra card holders.
async function loadPeople(base44, companyFilter) {
  const sr = base44.asServiceRole.entities;
  const [drivers, users, contacts, holders, vehicles, cards] = await Promise.all([
    sr.Driver.list('-updated_date', 1000),
    sr.User.list(),
    sr.Contact.filter({ type: 'staff' }, '-updated_date', 1000),
    sr.CardHolder.list('-updated_date', 1000).catch(() => []),
    sr.Vehicle.list('-updated_date', 500),
    sr.NfcCard.list('-issue_date', 3000).catch(() => []),
  ]);
  const inCompany = (cid) => !companyFilter || cid === companyFilter;
  const vehicleByDriver = new Map();
  for (const v of vehicles) {
    const key = (v.driver_email || '').toLowerCase();
    if (key && !vehicleByDriver.has(key)) vehicleByDriver.set(key, v.fleet_number ? `${v.name} (${v.fleet_number})` : v.name);
  }
  const people = [];
  for (const d of drivers) {
    if (!inCompany(d.company_id)) continue;
    people.push({ source: 'driver', id: d.id, type: 'driver', role: 'Driver', name: d.full_name, email: d.email || '',
      employee_id: d.employee_id || '', company_id: d.company_id || '', company_name: d.company_name || '',
      assigned_vehicle: vehicleByDriver.get((d.email || '').toLowerCase()) || '', legacy_tag: d.nfc_card_uid || '' });
  }
  for (const u of users) {
    if (u.role !== 'mechanic' || !inCompany(u.company_id)) continue;
    people.push({ source: 'user', id: u.id, type: 'mechanic', role: 'Mechanic', name: u.full_name || u.email, email: u.email || '',
      employee_id: u.employee_id || '', company_id: u.company_id || '', company_name: '', assigned_vehicle: '', legacy_tag: u.nfc_tag_id || '' });
  }
  const staffUsers = new Map(users.filter((u) => u.role === 'staff').map((u) => [(u.email || '').toLowerCase(), u]));
  const contactEmails = new Set();
  for (const c of contacts) {
    if (!inCompany(c.company_id)) continue;
    const email = (c.email || '').toLowerCase();
    if (email) contactEmails.add(email);
    const u = staffUsers.get(email) || {};
    people.push({ source: 'contact', id: c.id, type: 'staff', role: 'Staff', name: c.name || u.full_name || 'Staff', email: c.email || '',
      employee_id: c.employee_id || u.employee_id || '', company_id: c.company_id || '', company_name: c.company_name || '',
      assigned_vehicle: '', legacy_tag: c.nfc_card_tag || u.nfc_tag_id || '', access_code: c.access_code || u.access_code || '' });
  }
  for (const [email, u] of staffUsers) {
    if (contactEmails.has(email) || !inCompany(u.company_id)) continue;
    people.push({ source: 'user', id: u.id, type: 'staff', role: 'Staff', name: u.full_name || u.email, email: u.email || '',
      employee_id: u.employee_id || '', company_id: u.company_id || '', company_name: '', assigned_vehicle: '', legacy_tag: u.nfc_tag_id || '',
      access_code: u.access_code || '' });
  }
  for (const h of holders) {
    if (!inCompany(h.company_id)) continue;
    people.push({ source: 'cardholder', id: h.id, type: 'other', role: h.role || 'Other', name: h.full_name, email: '',
      employee_id: h.employee_id || '', company_id: h.company_id || '', company_name: h.company_name || '',
      assigned_vehicle: h.assigned_vehicle || '', legacy_tag: '' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const cardsByHolder = new Map();
  for (const c of cards) {
    const k = `${c.holder_source}:${c.holder_id}`;
    if (!cardsByHolder.has(k)) cardsByHolder.set(k, []);
    cardsByHolder.get(k).push(c);
  }
  for (const p of people) {
    p.key = `${p.source}:${p.id}`;
    const list = cardsByHolder.get(p.key) || [];
    const active = list.find((c) => c.is_active);
    p.card = active || null;
    p.status = active
      ? (active.expiry_date && active.expiry_date < today ? 'Expired' : 'Card Issued')
      : p.legacy_tag ? 'Card Issued'
      : list.length ? 'Revoked' : 'Unassigned';
    p.default_access = ACCESS_BY_ROLE[p.role] || 'DEPOT_GENERAL';
  }
  people.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return { people, cards: cards.filter((c) => inCompany(c.company_id)) };
}

// Who (if anyone) already holds this UID, from card records or older badge fields.
async function findOwner(base44, uid) {
  const sr = base44.asServiceRole.entities;
  const [cards, contacts, users, drivers] = await Promise.all([
    sr.NfcCard.filter({ card_uid: uid, is_active: true }),
    sr.Contact.filter({ nfc_card_tag: uid }),
    sr.User.filter({ nfc_tag_id: uid }),
    sr.Driver.filter({ nfc_card_uid: uid }),
  ]);
  if (cards.length) return { key: `${cards[0].holder_source}:${cards[0].holder_id}`, name: cards[0].holder_name, card: cards[0] };
  if (contacts.length) return { key: `contact:${contacts[0].id}`, name: contacts[0].name };
  if (users.length) return { key: `user:${users[0].id}`, name: users[0].full_name || users[0].email };
  if (drivers.length) return { key: `driver:${drivers[0].id}`, name: drivers[0].full_name };
  return null;
}

async function setTag(base44, source, id, uid, extra = {}) {
  const sr = base44.asServiceRole.entities;
  if (source === 'contact') return sr.Contact.update(id, { nfc_card_tag: uid, ...extra });
  if (source === 'user') return sr.User.update(id, { nfc_tag_id: uid, ...extra });
  if (source === 'driver') return sr.Driver.update(id, { nfc_card_uid: uid, ...extra });
  if (source === 'cardholder' && Object.keys(extra).length) return sr.CardHolder.update(id, extra);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || !['admin', 'company'].includes(user.role)) return Response.json({ error: 'Admins only' }, { status: 403 });
    const companyFilter = user.role === 'company' ? (user.company_id || '__none__') : null;
    const operator = user.full_name || user.email || 'Operator';
    const body = await req.json().catch(() => ({}));
    const sr = base44.asServiceRole.entities;

    switch (body.action) {
      case 'people':
        return Response.json(await loadPeople(base44, companyFilter));

      case 'issue': {
        const uid = normalizeUid(body.uid);
        if (uid.length < 8 || uid.length > 20) return Response.json({ ok: false, code: 'bad_uid', error: 'That card ID looks wrong. Tap the card again.' });
        const { people } = await loadPeople(base44, companyFilter);
        const person = people.find((p) => p.key === body.person_key);
        if (!person) return Response.json({ ok: false, code: 'no_person', error: 'Pick a person first.' }, { status: 404 });

        const owner = await findOwner(base44, uid);
        if (owner) {
          const same = owner.key === person.key;
          const msg = same ? `This card is already ${person.name}'s card.` : `Card ${uid} is already assigned to ${owner.name}.`;
          await audit(base44, user, { action: 'card_rejected', card_uid: uid, status: 'ERROR', record_id: owner.card?.id || '', summary: `Refused to issue ${uid} to ${person.name}: ${msg}` });
          return Response.json({ ok: false, code: same ? 'already_theirs' : 'duplicate', error: msg, owner_name: owner.name });
        }

        // A new card replaces the person's previous one.
        const now = new Date().toISOString();
        const previous = await sr.NfcCard.filter({ holder_source: person.source, holder_id: person.id, is_active: true });
        for (const c of previous) {
          await sr.NfcCard.update(c.id, { is_active: false, revoked_at: now, revoked_by: operator, revoke_reason: 'Replaced by a new card' });
        }

        const employeeId = clean(body.employee_id, 40) || person.employee_id || '';
        const card = await sr.NfcCard.create({
          card_uid: uid, card_type: clean(body.card_type, 60), holder_type: person.type, holder_source: person.source,
          holder_id: person.id, holder_name: person.name, employee_id: employeeId, role: person.role,
          assigned_vehicle: person.assigned_vehicle, company_id: person.company_id, company_name: person.company_name,
          access_level: clean(body.access_level, 60) || person.default_access,
          expiry_date: /^\d{4}-\d{2}-\d{2}$/.test(body.expiry_date || '') ? body.expiry_date : undefined,
          issue_date: now, issued_by: operator, is_active: true,
        });
        await setTag(base44, person.source, person.id, uid, employeeId && employeeId !== person.employee_id ? { employee_id: employeeId } : {});
        await audit(base44, user, {
          action: 'card_programmed', card_uid: uid, status: 'SUCCESS', record_id: card.id,
          summary: `Issued card ${uid} to ${person.name} (${person.role}${employeeId ? `, ${employeeId}` : ''}) · ${card.access_level}${previous.length ? ' · replaced previous card' : ''}`,
        });
        return Response.json({ ok: true, card, replaced: previous.length });
      }

      case 'verify': {
        const uid = normalizeUid(body.uid);
        const owner = uid ? await findOwner(base44, uid) : null;
        await audit(base44, user, { action: 'card_verified', card_uid: uid, status: owner ? 'SUCCESS' : 'ERROR', summary: owner ? `Checked card ${uid}: ${owner.name}` : `Checked card ${uid}: not issued` });
        return Response.json({ ok: true, uid, owner: owner ? { key: owner.key, name: owner.name, card: owner.card || null } : null });
      }

      case 'revoke': {
        const card = await sr.NfcCard.get(body.card_id).catch(() => null);
        if (!card || (companyFilter && card.company_id !== companyFilter)) return Response.json({ error: 'Card not found' }, { status: 404 });
        if (!card.is_active) return Response.json({ ok: true, card });
        const updated = await sr.NfcCard.update(card.id, {
          is_active: false, revoked_at: new Date().toISOString(), revoked_by: operator, revoke_reason: clean(body.reason, 200) || 'Revoked',
        });
        // Stop the card opening check-in too (only if it's still the one on file).
        try {
          const src = card.holder_source;
          if (src === 'contact') { const c = await sr.Contact.get(card.holder_id); if (c?.nfc_card_tag === card.card_uid) await sr.Contact.update(c.id, { nfc_card_tag: '' }); }
          if (src === 'user') { const u = await sr.User.get(card.holder_id); if (u?.nfc_tag_id === card.card_uid) await sr.User.update(u.id, { nfc_tag_id: '' }); }
          if (src === 'driver') { const d = await sr.Driver.get(card.holder_id); if (d?.nfc_card_uid === card.card_uid) await sr.Driver.update(d.id, { nfc_card_uid: '' }); }
        } catch { /* person may have been deleted */ }
        await audit(base44, user, { action: 'card_revoked', card_uid: card.card_uid, status: 'SUCCESS', record_id: card.id, summary: `Revoked card ${card.card_uid} (${card.holder_name}): ${updated.revoke_reason}` });
        return Response.json({ ok: true, card: updated });
      }

      // Keypad code for the bus boarding tablets (staff who forget their card).
      case 'keypad_code': {
        const { people } = await loadPeople(base44, companyFilter);
        const person = people.find((p) => p.key === body.person_key);
        if (!person) return Response.json({ error: 'Pick a person first.' }, { status: 404 });
        if (person.type !== 'staff') return Response.json({ error: 'Keypad codes are for bus staff.' }, { status: 400 });
        const [allContacts, allUsers] = await Promise.all([sr.Contact.list('-updated_date', 5000), sr.User.list()]);
        const taken = new Set([...allContacts, ...allUsers].map((r) => r.access_code).filter(Boolean));
        let code = '';
        for (let i = 0; i < 50 && (!code || taken.has(code)); i++) code = String(Math.floor(10000 + Math.random() * 90000));
        if (person.source === 'user') await sr.User.update(person.id, { access_code: code });
        else await sr.Contact.update(person.id, { access_code: code });
        await audit(base44, user, { action: 'update', entity: person.source === 'user' ? 'User' : 'Contact', record_id: person.id, summary: `New keypad code for ${person.name}` });
        return Response.json({ ok: true, code });
      }

      case 'add_holder': {
        const full_name = clean(body.full_name);
        if (!full_name) return Response.json({ error: 'Name is required' }, { status: 400 });
        let company_id = clean(body.company_id, 40) || undefined;
        if (companyFilter) company_id = companyFilter;
        let company_name;
        if (company_id) { try { company_name = (await sr.Company.get(company_id))?.name; } catch { /* ignore */ } }
        const roles = ['Dispatcher', 'Inspector', 'Supervisor', 'Cleaner', 'Security', 'Other'];
        const holder = await sr.CardHolder.create({
          full_name, employee_id: clean(body.employee_id, 40), role: roles.includes(body.role) ? body.role : 'Other',
          assigned_vehicle: clean(body.assigned_vehicle, 60), company_id, company_name,
        });
        return Response.json({ ok: true, holder });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: e?.message || 'Something went wrong' }, { status: 500 });
  }
}
