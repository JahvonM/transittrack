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
