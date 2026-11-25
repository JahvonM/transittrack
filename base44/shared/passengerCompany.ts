// Move directory membership without moving an old company's bus or credentials.
// Callers must authorize the operator and resolve the person from their scoped directory.
export async function changePassengerCompany(db, person, company, remove = false) {
  const norm = value => String(value || '').trim().toLowerCase();
  const email = norm(person.email), oldCompany = person.company_id || '';
  const memberships = await db.CompanyMembership.list('-updated_date', 5000);
  const accounts = (await db.User.list()).filter(u => ['staff', 'passenger'].includes(u.role) &&
    (person.source === 'user' ? u.id === person.id : email && norm(u.email) === email &&
      !memberships.some(m => m.user_id === u.id && m.scope === 'passenger' && m.active && m.company_id !== oldCompany)));
  const accountIds = new Set(accounts.map(u => u.id));
  const contacts = (await db.Contact.list('-updated_date', 5000)).filter(c =>
    c.id === (person.source === 'contact' ? person.id : '') ||
    email && norm(c.email) === email && (c.company_id || '') === oldCompany);
  const contactIds = new Set(contacts.map(c => c.id));
  const owns = row => accountIds.has(row.user_id) || contactIds.has(row.contact_id);
  const now = new Date().toISOString();
  // Revoke access before changing the directory; a failed request grants no new access.
  for (const m of memberships) if (accountIds.has(m.user_id) && m.scope === 'passenger' && m.active && (m.company_id || '') === oldCompany)
    await db.CompanyMembership.update(m.id, { active: false });
  for (const card of await db.NfcCard.list('-issue_date', 5000)) {
    if ((card.company_id || '') === oldCompany && ((card.holder_source === 'contact' && contactIds.has(card.holder_id)) ||
        (card.holder_source === 'user' && accountIds.has(card.holder_id))))
      await db.NfcCard.update(card.id, { is_active: false, status: 'revoked', revoked_at: now, revoke_reason: 'Passenger company changed' });
  }
  for (const table of ['PassengerAccessCredential', 'PassengerOneTimeCredential', 'CompanyAccessGrant'])
    for (const row of await db[table].list('-created_date', 5000)) if (owns(row) && (row.company_id || '') === oldCompany) await db[table].delete(row.id);
  if (email && oldCompany) for (const row of await db.VerificationGrant.filter({ company_id: oldCompany, purpose: 'signup_invite', subject: 'email:' + email }))
    await db.VerificationGrant.update(row.id, { expires_at: now });
  const patch = { company_id: company?.id || '', company_name: company?.name || '', vehicle_id: '', vehicle_name: '', nfc_card_tag: '', access_code: '' };
  for (const c of contacts) {
    if (remove) await db.Contact.delete(c.id);
    else await db.Contact.update(c.id, patch);
  }
  for (const u of accounts) {
    await db.User.update(u.id, { company_id: company?.id || '', nfc_tag_id: '', access_code: '', one_time_code: '', one_time_code_expires_at: null, pickup_route_id: '' });
    if (company) await db.CompanyMembership.create({ user_id: u.id, company_id: company.id, scope: 'passenger', active: true });
  }
  if (oldCompany) for (const row of await db.SignupHelp.filter({ company_id: oldCompany }))
    if (row.person_ref === (email ? 'email:' + email : person.key)) await db.SignupHelp.delete(row.id);
}

// Admin → Passengers → Remove passenger: take a passenger out completely.
// Every card of theirs stops (in any company), their keypad, one-time and
// company access codes go, they leave every company and bus, their directory
// entries and sign-up rows are deleted, and their own app login is deleted
// when it's a passenger login (never an admin, office, driver or company
// manager login). Past trips, sign-ins and card records stay as history.
// Callers must check the operator is an admin and resolve the person from
// the directory.
export async function removePassenger(db, person) {
  const norm = value => String(value || '').trim().toLowerCase();
  const email = norm(person.email);
  const accounts = (await db.User.list()).filter(u => ['staff', 'passenger'].includes(u.role) &&
    (person.source === 'user' ? u.id === person.id : !!email && norm(u.email) === email));
  const accountIds = new Set(accounts.map(u => u.id));
  const contacts = (await db.Contact.list('-updated_date', 5000)).filter(c =>
    (person.source === 'contact' && c.id === person.id) || (!!email && norm(c.email) === email));
  const contactIds = new Set(contacts.map(c => c.id));
  const owns = row => accountIds.has(row.user_id) || contactIds.has(row.contact_id);
  const now = new Date().toISOString();
  const companies = new Set([person.company_id, ...contacts.map(c => c.company_id)].filter(Boolean));
  // Access first, so a failure part-way never leaves them more access than before.
  for (const m of await db.CompanyMembership.list('-updated_date', 5000)) if (accountIds.has(m.user_id) && m.scope === 'passenger' && m.active) {
    await db.CompanyMembership.update(m.id, { active: false });
    if (m.company_id) companies.add(m.company_id);
  }
  let cards = 0;
  for (const card of await db.NfcCard.list('-issue_date', 5000)) {
    const theirs = (card.holder_source === 'contact' && contactIds.has(card.holder_id)) || (card.holder_source === 'user' && accountIds.has(card.holder_id));
    if (!theirs || !card.is_active) continue;
    await db.NfcCard.update(card.id, { is_active: false, status: 'revoked', revoked_at: now, revoke_reason: 'Passenger removed' });
    if (card.company_id) companies.add(card.company_id);
    cards++;
  }
  for (const table of ['PassengerAccessCredential', 'PassengerOneTimeCredential', 'CompanyAccessGrant'])
    for (const row of await db[table].list('-created_date', 5000)) if (owns(row)) await db[table].delete(row.id);
  if (email) for (const row of await db.VerificationGrant.filter({ purpose: 'signup_invite', subject: 'email:' + email }))
    if (!(Date.parse(row.expires_at) <= Date.now())) await db.VerificationGrant.update(row.id, { expires_at: now });
  for (const row of await db.SignupHelp.list('-updated_date', 5000))
    if (row.person_ref === person.key || (email && row.person_ref === 'email:' + email)) await db.SignupHelp.delete(row.id);
  for (const c of contacts) await db.Contact.delete(c.id);
  // Their logins go last, with the phones registered for their alerts.
  for (const u of accounts) {
    for (const e of new Set([u.email, norm(u.email)].filter(Boolean))) for (const t of await db.PushToken.filter({ email: e })) await db.PushToken.delete(t.id);
    await db.User.delete(u.id);
  }
  return { cards, logins: accounts.length, companies: [...companies] };
}
