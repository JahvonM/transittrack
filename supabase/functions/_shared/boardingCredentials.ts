import { retry429 } from './retry429.ts';

export async function boardingSecretHash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
const fail = (message, status) => Object.assign(new Error(message), { status });

// Call only after checking this signed-in passenger's live company membership.
export async function personalBoardingCredential(base44, user, companyId) {
  const db = base44.asServiceRole.entities;
  const email = (user.email || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const contacts = user.email ? (await retry429(() => db.Contact.filter({ company_id: companyId,
    email: { $regex: '^' + email + '$', $options: 'i' }, type: { $in: ['staff', 'passenger'] }
  }, { limit: 2, fields: ['email'] }))).items : [];
  if (contacts.length > 1) throw fail('Ask the office to resolve your duplicate passenger records.', 409);
  const contactId = contacts[0]?.id || '';
  const identity = contactId ? { $or: [{ user_id: user.id }, { contact_id: contactId }] } : { user_id: user.id };
  const rows = (await retry429(() => db.PassengerAccessCredential.filter({ company_id: companyId, ...identity }, { limit: 2 }))).items;
  if (rows.length > 1) throw fail('Ask the office to refresh your boarding credentials.', 409);
  let row = rows[0];
  if (row?.qr_token && row.user_id === user.id) return row;
  const qrToken = row?.qr_token || Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const data = { user_id: user.id, company_id: companyId, contact_id: row?.contact_id || contactId,
    token_hash: row?.token_hash || '', qr_token: qrToken, qr_hash: await boardingSecretHash(qrToken),
    qr_issued_at: row?.qr_issued_at || new Date().toISOString() };
  if (row) return await retry429(() => db.PassengerAccessCredential.update(row.id, data));
  const result = await retry429(() => db.PassengerAccessCredential.upsert([data], { key: ['user_id', 'company_id'] }));
  return result.records[0];
}

export async function savePersonalBoardingCode(base44, credential, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw fail('Choose a boarding code with exactly six digits.', 400);
  const db = base44.asServiceRole.entities;
  const tokenHash = await boardingSecretHash(code);
  const companyId = credential.company_id;
  const [protectedCodes, legacyCodes, temporaryCodes] = await Promise.all([
    retry429(() => db.PassengerAccessCredential.filter({ company_id: companyId, token_hash: tokenHash, id: { $ne: credential.id } }, { limit: 1, fields: ['id'] })),
    retry429(() => db.Contact.filter({ company_id: companyId, access_code: code, ...(credential.contact_id ? { id: { $ne: credential.contact_id } } : {}) }, { limit: 1, fields: ['id'] })),
    retry429(() => db.PassengerOneTimeCredential.filter({ company_id: companyId, token_hash: tokenHash, expires_at: { $gt: new Date().toISOString() }, $or: [{ consumed_at: { $exists: false } }, { consumed_at: '' }, { consumed_at: null }] }, { limit: 1, fields: ['id'] })),
  ]);
  if (protectedCodes.items.length || legacyCodes.items.length || temporaryCodes.items.length) throw fail('That code is already in use. Please choose another six-digit code.', 409);
  const saved = await retry429(() => db.PassengerAccessCredential.update(credential.id, { token_hash: tokenHash, issued_at: new Date().toISOString() }));
  if (credential.contact_id) await retry429(() => db.Contact.update(credential.contact_id, { access_code: '' }));
  return saved;
}

// Grants from an old PIN stop working immediately after the owner replaces it.
// The independent QR digest is unchanged when a PIN is reset.
export async function currentBoardingCode(base44, device, person, version) {
  if (version.startsWith('legacy:')) return version === 'legacy:' + await boardingSecretHash(person.access_code || '');
  const [id, kind, hash] = version.split(':');
  if (!id || !['pin', 'qr'].includes(kind) || !/^[a-f0-9]{64}$/.test(hash || '')) return false;
  const credential = await base44.asServiceRole.entities.PassengerAccessCredential.get(id).catch(error => {
    if (error.status === 404 || error.response?.status === 404) return null;
    throw error;
  });
  if (!credential || credential.company_id !== device.company_id) return false;
  const owner = credential.contact_id ? person.source === 'contact' && person.id === credential.contact_id
    : !!credential.user_id && person.member_user_id === credential.user_id;
  return owner && (kind === 'qr' ? credential.qr_hash : credential.token_hash) === hash;
}