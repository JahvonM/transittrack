import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { boardingSecretHash, currentBoardingCode } from '../../shared/boardingCredentials.ts';
import { reserveAttempt, claimOnce, createOnce } from '../../shared/atomicOps.ts';


async function liveMembership(base44, row) {
 if (!row.expires_at && !row.code_hash) return true; // Explicit admin approval.
 if (!row.code_hash || (row.scope !== 'passenger' && !(Date.parse(row.expires_at) > Date.now()))) return false;
 const company=await base44.asServiceRole.entities.Company.get(row.company_id).catch(()=>null);
 if(!company) return false;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(company.access_code || ''));
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return row.code_hash===hash;
}

async function approvedCompanies(base44, user, scope) {
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ user_id: user.id, active: true }, '-updated_date', 100);
  const approved=[];
  for(const row of rows) if(row.scope === (scope || (user.role === 'company' ? 'manager' : 'passenger')) && await liveMembership(base44,row)) approved.push(row.company_id);
  return approved;
}
async function approvedPassengerMemberships(base44, companyId) {
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ company_id: companyId, active: true, scope: 'passenger' }, '-updated_date', 5000);
  const live=[];
  for(const row of rows) if(await liveMembership(base44,row)) live.push(row);
  return live;
}
async function approvedStaffIds(base44, companyId) {
  return new Set((await approvedPassengerMemberships(base44,companyId)).map(row=>row.user_id));
}
// Random device credentials are stored only as hashes in protected DeviceCredential.
// Existing development tablets remain legacy-compatible until explicitly re-paired.
const LEGACY_DEVICE_CUTOFF = Date.parse('2026-10-03T23:35:39Z');
async function deviceDigest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
function sameDigest(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function authenticatedTablet(base44, device, token) {
  if (!device || !device.paired || device.status !== 'active') return false;
  const credentials = await base44.asServiceRole.entities.DeviceCredential.filter({ device_id: device.id }, '-issued_at', 1);
  const credential = credentials[0];
  if (!credential) return false;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  if (!(Date.parse(credential.expires_at) > Date.now())) return false;
  if (credential.company_id !== device.company_id || credential.vehicle_id !== (device.vehicle_id || '') || credential.kiosk_type !== device.kiosk_type) return false;
  if (!sameDigest(credential.pairing_code_hash, await deviceDigest(device.pairing_code || ''))) return false;
  return sameDigest(credential.token_hash, await deviceDigest(token));
}

// A tablet paired before the credential ledger existed has no credential to
// check, so its device record still authorises it — the one place a tokenless
// device is accepted. Delete this block once every tablet has been re-paired
// (see security-tests/tablet-repairing-plan.md); the verifier above is already
// strictly token-based, so that deletion is the whole migration.
async function legacyDeviceAccepted(base44, device) {
  if (!device || device.paired !== true || device.status !== 'active') return false;
  const created = Date.parse(device.created_date);
  if (!(Number.isFinite(created) && created < LEGACY_DEVICE_CUTOFF)) return false;
  const credentials = await base44.asServiceRole.entities.DeviceCredential.filter({ device_id: device.id }, '-issued_at', 1);
  return credentials.length === 0;
}

// Token, or an un-migrated device record. Used to resolve which device a
// request came from; it never authorises an action on its own.
async function deviceAccepted(base44, device, token) {
  return (await authenticatedTablet(base44, device, token)) || legacyDeviceAccepted(base44, device);
}


// Kiosk tablets are unauthenticated (paired by device ID, like driverSession),
// so every write here goes through the service role.
async function resolveKioskDevice(base44, deviceId, token) {
  if (!deviceId || typeof deviceId !== 'string') return null;
  try {
    const device = await base44.asServiceRole.entities.KioskDevice.get(deviceId);
    if (!device || device.kiosk_type === 'driver' || !(await deviceAccepted(base44, device, token))) return null;
    return device;
  } catch { return null; }
}

// Same merge as driverSession's loadStaff (duplicated — functions can't
// import across each other in this runtime): registered staff Users plus
// Contact records of type 'staff', matched on email, both scoped to the
// device's company. Badge/QR check-in matches against nfc_tag_id /
// nfc_card_tag on whichever record represents that person.
async function loadStaffDirectory(base44, companyId) {
  const approvedRows = await approvedPassengerMemberships(base44,companyId);
  const approvedIds = new Set(approvedRows.map(row=>row.user_id));
  const assignments = new Map(approvedRows.map(row=>[row.user_id,row]));
  const [users, contacts] = await Promise.all([
    base44.asServiceRole.entities.User.list(),
    base44.asServiceRole.entities.Contact.filter({ company_id: companyId }, '-updated_date', 500),
  ]);
  const activeCards = await base44.asServiceRole.entities.NfcCard.filter({ company_id: companyId, is_active: true }, '-issue_date', 3000);
  const cardForUser = id => activeCards.find(c => c.holder_source === 'user' && c.holder_id === id && (!c.expiry_date || c.expiry_date >= new Date().toISOString().slice(0,10)))?.card_uid || '';
  const userByEmail = new Map(
    users.filter((u) => ['staff','passenger'].includes(u.role) && approvedIds.has(u.id))
      .map((u) => [(u.email || '').toLowerCase(), u])
  );
  const companyContacts = contacts.filter((c) => c.company_id === companyId && ['staff','passenger'].includes(c.type));
  const contactEmails = new Set(companyContacts.map((c) => (c.email || '').toLowerCase()));
  const orphanUsers = [...userByEmail.values()].filter((u) => !contactEmails.has((u.email || '').toLowerCase()));
  return [
    ...companyContacts.map((c) => {
      const u = userByEmail.get((c.email || '').toLowerCase()) || {};
      return {
        source: 'contact', member_user_id: u.id || '', id: c.id, full_name: c.name || u.full_name || 'Staff',
        email: c.email || u.email || '', photo_url: u.photo_url || '',
        nfc_tag: c.nfc_card_tag || cardForUser(u.id),
        access_code: c.access_code || '',
        one_time_code: u.one_time_code || '', one_time_code_expires_at: u.one_time_code_expires_at || null,
        vehicle_id: c.vehicle_id || '', vehicle_name: c.vehicle_name || '',
      };
    }),
    ...orphanUsers.map((u) => ({
      source: 'user', member_user_id: u.id, id: u.id, full_name: u.full_name || u.email || 'Staff',
      email: u.email || '', photo_url: u.photo_url || '', nfc_tag: cardForUser(u.id),
      access_code: '',
      one_time_code: u.one_time_code || '', one_time_code_expires_at: u.one_time_code_expires_at || null,
      vehicle_id: assignments.get(u.id)?.vehicle_id || '', vehicle_name: assignments.get(u.id)?.vehicle_name || '',
    })),
  ];
}



function sanitize(value) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001f]/g, '').replace(/[<>]/g, '').trim();
}

async function resolveVehicleName(base44, vehicleId) {
  if (!vehicleId) return '';
  try { return (await base44.asServiceRole.entities.Vehicle.get(vehicleId))?.name || ''; }
  catch { return ''; }
}

// Toggles boarded/off_board based on the most recent record for this exact
// person (matched by card_tag when there is one, else by name) on this bus —
// used only as a *suggested* default now; the kiosk always lets the person
// pick boarding/exiting explicitly (see 'check_in' below).
async function nextStatus(base44, vehicleId, matchKey, matchValue) {
  const rows = await base44.asServiceRole.entities.StaffCheckIn.filter(
    { vehicle_id: vehicleId, [matchKey]: matchValue }, '-created_date', 1
  );
  return rows[0]?.status === 'boarded' ? 'off_board' : 'boarded';
}

// A check-in saved on the tablet while offline carries the time it really
// happened; accept it if it's plausible (not in the future, not days old).
function occurredAt(value) {
  const t = value ? new Date(value).getTime() : NaN;
  const now = Date.now();
  if (Number.isFinite(t) && t <= now + 60_000 && t >= now - 72 * 3600_000) return new Date(t).toISOString();
  return new Date(now).toISOString();
}

// A passenger's card or code only works on the bus they're assigned to in
// Admin → Card issuing. Returns the refusal to send back, or null if fine.
function wrongBus(person, vehicleId) {
  if (!person || !vehicleId) return null;
  if (!person.vehicle_id) {
    return { error: 'no_bus', staff_name: person.full_name, message: `${person.full_name} isn't assigned to a bus yet. Ask the office to pick their bus in Card issuing.` };
  }
  if (person.vehicle_id !== vehicleId) {
    return { error: 'wrong_bus', staff_name: person.full_name, bus_name: person.vehicle_name || '', message: `${person.full_name} rides ${person.vehicle_name || 'another bus'}, not this one.` };
  }
  return null;
}

const VEHICLE_ONLY_ACTIONS = new Set(['check_in', 'lookup_tag', 'lookup_code']);

// Tablet response contract: whitelist fields; never forward entire entity records.
function tabletFields(row, fields) {
  if (!row) return null;
  return Object.fromEntries(fields.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]));
}
function tabletVehicle(row) {
  const out = tabletFields(row, ['id', 'name', 'type', 'plate_number', 'company_id', 'company_name', 'capacity', 'route_id', 'current_lat', 'current_lng', 'speed', 'heading', 'status', 'driver_name', 'driver_email', 'image_url', 'model_3d', 'tracking_active', 'remote_tracking_lock', 'last_location_update', 'current_odometer']);
  if (out && Array.isArray(row.trail)) out.trail = row.trail.map((t) => tabletFields(t, ['lat', 'lng', 't']));
  return out;
}
function tabletRoute(row, companyId) {
  if (!row || row.company_id !== companyId) return null;
  return { ...tabletFields(row, ['id', 'name', 'type', 'active', 'company_id']), stops: (row.stops || []).map((s) => tabletFields(s, ['name', 'lat', 'lng', 'order'])) };
}
function tabletCheckIn(row) {
  return tabletFields(row, ['id', 'staff_name', 'staff_picture_url', 'status', 'boarded_at', 'created_date', 'vehicle_id', 'vehicle_name', 'check_in_method']);
}
function boardingStats(rows) {
  const latest = new Map();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Grenada' });
  let todayCount = 0;
  for (const row of rows || []) {
    const key = row.card_tag || row.staff_name;
    const prev = latest.get(key);
    if (!prev || Date.parse(row.created_date) > Date.parse(prev.created_date)) latest.set(key, row);
    if (row.status === 'boarded' && new Date(row.created_date).toLocaleDateString('en-CA', { timeZone: 'America/Grenada' }) === today) todayCount++;
  }
  return { occupancy: [...latest.values()].filter((r) => r.status === 'boarded').length, today_count: todayCount };
}
async function tabletCheckIns(base44, companyId, vehicleId) {
  if (!companyId || !vehicleId) return [];
  const rows = [];
  for (let skip = 0; ; skip += 500) {
    const batch = await base44.asServiceRole.entities.StaffCheckIn.filter({ company_id: companyId, vehicle_id: vehicleId }, '-created_date', 500, skip);
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}

async function hashSecret(value) {
 const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}
function randomSecret() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join(''); }
function randomDigits(len) {
 let out = '';
 while (out.length < len) { const b = crypto.getRandomValues(new Uint8Array(1))[0]; if (b < 250) out += b % 10; }
 return out;
}
// Attempt limiting moved to shared/atomicOps.ts: the count and the write must
// not interleave with a concurrent call, so they now run inside one lock.
async function issueGrant(base44, device, purpose, subject, ttlMs, binding={}) {
 const secret = randomSecret();
 await base44.asServiceRole.entities.VerificationGrant.create({
 token_hash: await hashSecret(secret), device_id: device.id, company_id: device.company_id,
 ...binding, vehicle_id: device.vehicle_id, pairing_code_hash: await hashSecret(device.pairing_code || ''), purpose, subject, expires_at: new Date(Date.now()+ttlMs).toISOString(),
 });
 return secret;
}
async function validGrant(base44, device, token, purpose, subject) {
 if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
 const rows = await base44.asServiceRole.entities.VerificationGrant.filter({ token_hash: await hashSecret(token) }, '-created_date', 1);
 const row = rows[0];
 return !!row && row.pairing_code_hash === await hashSecret(device.pairing_code || '') && row.device_id === device.id && row.company_id === device.company_id && row.vehicle_id === device.vehicle_id && row.purpose === purpose && row.subject === subject && Date.parse(row.expires_at) > Date.now();
}

async function currentCard(base44,companyId,person,uid) {
 if(!uid)return {valid:false};
 const rows=await base44.asServiceRole.entities.NfcCard.filter({card_uid:uid},'-updated_date',2);
 if(rows.length>1)return {valid:false};
 const card=rows[0];
 // Unregistered legacy Contact tags remain development-compatible. A ledger
 // record, including a revoked one, takes precedence over a copied legacy tag.
 if(!card)return {valid:true,card_id:''};
 const expiry=card.expiry_date?Date.parse(card.expiry_date):null;
 const today=Date.parse(new Date().toISOString().slice(0,10));
 const owner=(card.holder_source==='contact'&&person.source==='contact'&&card.holder_id===person.id)||
  (card.holder_source==='user'&&card.holder_id===person.member_user_id);
 return {valid:card.company_id===companyId&&card.is_active===true&&!card.revoked_at&&owner&&
  (expiry===null||(Number.isFinite(expiry)&&expiry>=today)),card_id:card.id};
}
async function boardingBinding(base44,device,person,kind) {
 const binding={auth_kind:kind,subject_source:person.source,member_user_id:person.member_user_id||''};
 if(kind==='card') {
  const card=await currentCard(base44,device.company_id,person,person.nfc_tag);
  if(!card.valid)return null;
  binding.card_id=card.card_id;binding.card_tag_hash=await hashSecret(person.nfc_tag);
 }
 return binding;
}
async function currentBoardingEligibility(base44,device,person,token,method) {
 const rows=await base44.asServiceRole.entities.VerificationGrant.filter({token_hash:await hashSecret(token)},'-created_date',1);
 const row=rows[0];if(!row||!['card','code'].includes(row.auth_kind)||!row.subject_source)return false;
 if(row.subject_source&&row.subject_source!==person.source)return false;
 if(row.member_user_id) {
  const user=await base44.asServiceRole.entities.User.get(row.member_user_id).catch(error=>{if(error.status===404||error.response?.status===404)return null;throw error;});
  if(!user||!['staff','passenger'].includes(user.role)||!(await approvedStaffIds(base44,device.company_id)).has(user.id))return false;
  if(person.member_user_id!==user.id)return false;
 }
 // The QR scanner submits a boarding credential, not an NFC card UID.
 const cardMethod=method==='nfc';
 if(row.auth_kind&&row.auth_kind!==(cardMethod?'card':'code'))return false;
 if(!cardMethod&&row.credential_version&&!(await currentBoardingCode(base44,device,person,row.credential_version)))return false;
 if(cardMethod) {
  const card=await currentCard(base44,device.company_id,person,person.nfc_tag);
  if(!card.valid)return false;
  if(row.card_tag_hash&&row.card_tag_hash!==await hashSecret(person.nfc_tag))return false;
  if(row.card_id&&row.card_id!==card.card_id)return false;
 }
 return true;
}

async function allocatePassengerCode(base44,person,companyId) {
 const db=base44.asServiceRole.entities;let code='',token_hash='';
 for(let i=0;i<50;i++) {
  const candidate=randomDigits(12);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(candidate));
  const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const [protectedRows,legacyContacts]=await Promise.all([db.PassengerAccessCredential.filter({token_hash:hash},'-updated_date',1),db.Contact.filter({access_code:candidate},'-updated_date',1)]);
  if(!protectedRows.length&&!legacyContacts.length){code=candidate;token_hash=hash;break;}
 }
 if(!code)throw Object.assign(new Error('Could not allocate a unique code'),{status:503});
 const user=person.source==='user';
 const identity=user?{user_id:person.id}:{contact_id:person.id};
 const old=await db.PassengerAccessCredential.filter(identity,'-updated_date',1);
 const data={user_id:user?person.id:'',contact_id:user?'':person.id,company_id:companyId,token_hash,issued_at:new Date().toISOString()};
 if(old[0])await db.PassengerAccessCredential.update(old[0].id,data);else await db.PassengerAccessCredential.create(data);
 // New Contact codes are never persisted as plaintext. Legacy rows need reissue.
 if(!user)await db.Contact.update(person.id,{access_code:''});
 return code;
}
export default async function(req) {
  try {
    const body = await req.json();
    const { device_id, action } = body;
    const base44 = createClientFromRequest(req);

    // Two ways to call this function: a paired kiosk tablet (device_id —
    // unauthenticated, the device itself is the credential), or an admin
    // managing badges directly from their own logged-in session (no device,
    // just a real authenticated admin + an explicit company_id). The second
    // path never trusts a client-asserted role — it's always re-checked
    // server-side against the actual session, same pattern as
    // notifyAdminMessage's auth.me() check.
    const device = await resolveKioskDevice(base44, device_id, body.device_token);
    let companyId, companyName, vehicleId, vehicleName;
    if (device) {
      companyId = device.company_id; companyName = device.company_name;
      vehicleId = device.vehicle_id; vehicleName = device.vehicle_name;
    } else {
      // auth.me() throws (rather than resolving null) when the request
      // carries no session at all — treat that the same as "not an admin".
      let user = null;
      try { user = await base44.auth.me(); } catch { user = null; }
      if (!user || user.role !== 'admin') return Response.json({ error: 'Invalid or unpaired kiosk device' }, { status: 401 });
      companyId = sanitize(body.company_id);
      if (!companyId) return Response.json({ error: 'company_id required' }, { status: 400 });
      companyName = ''; vehicleId = null; vehicleName = '';
    }
    if (VEHICLE_ONLY_ACTIONS.has(action) && !vehicleId) {
      return Response.json({ error: 'This action requires a paired kiosk device' }, { status: 400 });
    }

    if (device && ['lookup_tag', 'lookup_code'].includes(action) && !(await reserveAttempt(base44, 'passenger-lookup:' + device.id, 20, 60_000))) return Response.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });

    if(body.queue_replay && (!body.expected_device_id || !body.expected_company_id || !body.expected_vehicle_id)) return Response.json({error:'Legacy saved check-in lacks its original assignment; export for review'},{status:409});
    if(!device && (body.expected_device_id || body.expected_vehicle_id)) return Response.json({error:'Tablet assignment metadata requires a paired tablet'},{status:400});
    const matchesAssignment = (value) => (!value.expected_device_id || value.expected_device_id===device?.id) && (!value.expected_company_id || value.expected_company_id===companyId) && (!value.expected_vehicle_id || value.expected_vehicle_id===vehicleId);
    if(!matchesAssignment(body) || (action==='upload_track' && Array.isArray(body.points) && body.points.some(p=>!matchesAssignment(p||{})))) return Response.json({error:'Saved work belongs to a different tablet assignment'},{status:409});

    switch (action) {
      // --- bus_boarding: manual entry (search-as-you-type staff picker) ---
      case 'search_staff': {
        const q = sanitize(body.query).toLowerCase();
        if (q.length < 1) return Response.json({ staff: [] });
        const directory = await loadStaffDirectory(base44, companyId);
        const matches = directory.filter((s) => s.full_name.toLowerCase().includes(q)).slice(0, 20);
        return Response.json({ staff: matches.map((s) => ({ id: s.id, full_name: s.full_name, photo_url: s.photo_url })) });
      }

      // --- bus_boarding: the list a tablet keeps so cards and keypad codes
      // still work with no WiFi (refreshed every few minutes when online) ---
      case 'offline_directory': {
        if (!device || device.kiosk_type !== 'bus_boarding' || !vehicleId) return Response.json({ error: 'Assigned bus boarding tablets only' }, { status: 403 });
        const directory = await loadStaffDirectory(base44, companyId);
        const staff = [];
        for (const person of directory) {
          if (person.vehicle_id !== vehicleId || !person.nfc_tag) continue;
          if (!(await currentCard(base44,companyId,person,person.nfc_tag)).valid) continue;
          staff.push({ id: person.id, full_name: person.full_name, photo_url: person.photo_url,
            card_fingerprint: await hashSecret(device.id + ':' + person.nfc_tag.toUpperCase()) });
        }
        const generated_at = new Date().toISOString();
        const expires_at = new Date(Date.now() + 24 * 3600_000).toISOString();
        const directory_grant = await issueGrant(base44,device,'boarding-directory',device.id,24 * 3600_000);
        return Response.json({ version: 1, device_id: device.id, company_id: companyId, vehicle_id: vehicleId,
          generated_at, expires_at, directory_grant, staff });
      }

      // --- bus_boarding: NFC tap lookup, before confirming ---
      case 'lookup_tag': {
        const directory = await loadStaffDirectory(base44, companyId);
        const person = directory.find((s) => s.nfc_tag && s.nfc_tag === sanitize(body.card_tag));
        if (!person) return Response.json({ error: 'badge_not_registered' }, { status: 404 });
        const refusal = wrongBus(person, vehicleId);
        if (refusal) return Response.json(refusal, { status: 403 });
        const binding=await boardingBinding(base44,device,person,'card');
        if(!binding)return Response.json({error:'Card no longer authorized'},{status:403});
        const status = await nextStatus(base44, vehicleId, 'card_tag', person.nfc_tag || person.id);
        return Response.json({ staff: { id: person.id, full_name: person.full_name, photo_url: person.photo_url }, next_status: status, verification_grant: await issueGrant(base44, device, 'boarding', person.id, 24 * 3600_000,binding) });
      }

      // Permanent personal QR, chosen keypad code, or a legacy temporary code.
      case 'lookup_code': {
        const code = sanitize(body.code);
        if (!code || code.length > 64) return Response.json({ error: 'Valid boarding code required' }, { status: 400 });
        const directory = await loadStaffDirectory(base44, companyId);
        const now = Date.now();
        const permanentQr = /^[a-f0-9]{64}$/.test(code);
        const legacyMatches=permanentQr?[]:directory.filter(s=>s.access_code&&s.access_code===code);
        const credentials = permanentQr
          ? (await base44.asServiceRole.entities.PassengerAccessCredential.filter({ company_id: companyId, qr_hash: await boardingSecretHash(code) }, { limit: 2 })).items
          : await base44.asServiceRole.entities.PassengerAccessCredential.filter({ company_id: companyId, token_hash: await hashSecret(code) }, '-updated_date', 2);
        if (legacyMatches.length + credentials.length > 1) return Response.json({error:'Ambiguous keypad code; request reissue'},{status:409});
        let person=legacyMatches[0];
        let codeType = permanentQr ? 'permanent_qr' : 'access';
        const credential=credentials[0];
        let credentialVersion = legacyMatches[0] ? 'legacy:' + await hashSecret(code) : credential ? credential.id + ':' + (permanentQr ? 'qr:' + credential.qr_hash : 'pin:' + credential.token_hash) : '';
        if(!person&&credential?.contact_id)person=directory.find(s=>s.source==='contact'&&s.id===credential.contact_id);
        else if(!person&&credential?.user_id) {
          const user=await base44.asServiceRole.entities.User.get(credential.user_id);
          person=user?directory.find(s=>s.id===user.id||(s.email&&s.email.toLowerCase()===(user.email||'').toLowerCase())):null;
        }
        if (!person && !permanentQr) {
          credentialVersion = '';
          const credentials = await base44.asServiceRole.entities.PassengerOneTimeCredential.filter({ company_id: companyId, token_hash: await hashSecret(code) }, '-created_date', 2);
          const credential = credentials.find(c => !c.consumed_at && Date.parse(c.expires_at) > now);
          const user = credential ? await base44.asServiceRole.entities.User.get(credential.user_id) : null;
          person = user ? directory.find(s => s.id === user.id || (s.email && s.email.toLowerCase() === (user.email || '').toLowerCase())) : null;
          codeType = 'one_time';
        }
        if (!person) return Response.json({ error: 'code_not_recognized' }, { status: 404 });
        if (credential?.user_id && person.member_user_id !== credential.user_id) return Response.json({ error: 'Passenger company access is no longer active' }, { status: 403 });
        const refusal = wrongBus(person, vehicleId);
        if (refusal) return Response.json(refusal, { status: 403 });
        if (codeType === 'one_time') {
          const credentials = await base44.asServiceRole.entities.PassengerOneTimeCredential.filter({ company_id: companyId, token_hash: await hashSecret(code) }, '-created_date', 2);
          const current = credentials.find(c => !c.consumed_at && Date.parse(c.expires_at) > Date.now());
          if (!current) return Response.json({ error: 'code_not_recognized' }, { status: 404 });
          // Exactly one lookup may spend a one-time code: two tablets, or a
          // double tap, read the same unused row and would both accept it.
          if (!claimOnce('one-time:' + current.id, 30 * 60_000)) return Response.json({ error: 'This code has already been used. Ask for a new one.' }, { status: 409 });
          await base44.asServiceRole.entities.PassengerOneTimeCredential.update(current.id, { consumed_at: new Date().toISOString() });
        }
        const status = await nextStatus(base44, vehicleId, 'card_tag', person.nfc_tag || person.id);
        const binding = { ...await boardingBinding(base44,device,person,'code'), ...(credentialVersion ? { credential_version: credentialVersion } : {}) };
        return Response.json({ staff: { id: person.id, full_name: person.full_name, photo_url: person.photo_url }, next_status: status, code_type: codeType, verification_grant: await issueGrant(base44, device, 'boarding', person.id, 24 * 3600_000,binding) });
      }

      // --- admin app (Staff Directory): generate a persistent access code for
      // a staff member, typed on the bus boarding kiosk's keypad in place of
      // an NFC tap. (NFC cards are issued in Admin > Card issuing.) ---
      case 'generate_access_code': {
        if (device) return Response.json({ error: 'Keypad codes are managed by admins' }, { status: 403 });
        const { staff_id } = body;
        if (!staff_id) return Response.json({ error: 'staff_id required' }, { status: 400 });
        const directory = await loadStaffDirectory(base44, companyId);
        const person = directory.find((s) => s.id === sanitize(staff_id));
        if (!person) return Response.json({ error: 'Staff member not found' }, { status: 404 });
        const code=await allocatePassengerCode(base44,person,companyId);
        return Response.json({ code, staff: { id: person.id, full_name: person.full_name } });
      }

      // --- bus_boarding: confirm boarding/exiting. The person always picks
      // explicitly (status is required from the client) — next_status from
      // lookup_tag/lookup_code is only ever a suggested default the UI
      // highlights, never the sole option, since a missed tap or skipped
      // stop would otherwise leave no way to correct a wrong guess. ---
      case 'check_in': {
        const { staff_id, staff_name, method, code_type, status: requestedStatus } = body;
        if (!staff_id && !staff_name) return Response.json({ error: 'staff_id or staff_name required' }, { status: 400 });
        const requestId = body.client_request_id;
        if(requestId !== undefined && (typeof requestId!=='string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))) return Response.json({error:'Invalid request ID'},{status:400});
        if(requestId && !['boarded','off_board'].includes(requestedStatus)) return Response.json({error:'Explicit boarding status required'},{status:400});
        const requestHash = await hashSecret(JSON.stringify({staff:sanitize(staff_id)||sanitize(staff_name),status:requestedStatus,method:method||'manual',occurred_at:body.occurred_at||null}));
        if(requestId) {
          const previous=await base44.asServiceRole.entities.StaffCheckIn.filter({device_id:device.id,company_id:companyId,vehicle_id:vehicleId,client_request_id:requestId},'-created_date',1);
          if(previous[0]) {
            if(previous[0].request_hash!==requestHash) return Response.json({error:'Request ID reused with different data'},{status:409});
            return Response.json({record:tabletCheckIn(previous[0]),deduplicated:true});
          }
        }
        if(requestId && body.occurred_at !== undefined) {
          const time = Date.parse(body.occurred_at);
          if(!Number.isFinite(time) || time>Date.now()+60000 || time<Date.now()-72*3600_000) return Response.json({error:'Invalid check-in timestamp'},{status:400});
        }
        const directory = await loadStaffDirectory(base44, companyId);
        const person = directory.find((s) => s.id === sanitize(staff_id)) || null;
        let locallyVerified = false;
        if (method === 'nfc' && body.directory_grant && device && person?.nfc_tag &&
            await validGrant(base44,device,body.directory_grant,'boarding-directory',device.id)) {
          const fingerprint = await hashSecret(device.id + ':' + person.nfc_tag.toUpperCase());
          locallyVerified = sameDigest(body.card_fingerprint,fingerprint) &&
            (await currentCard(base44,companyId,person,person.nfc_tag)).valid;
        }
        if (['nfc', 'qr', 'code'].includes(method) && !locallyVerified && (!person || !(await validGrant(base44, device, body.verification_grant, 'boarding', person.id)) || !(await currentBoardingEligibility(base44,device,person,body.verification_grant,method)))) return Response.json({ error: 'Card authorization expired or changed. Refresh the tablet passenger list.' }, { status: 403 });
        // Directory grants are reusable for offline card verification. Lookup
        // grants authorize one completed check-in. Identical request-ID retries
        // already returned above. Save the digest with the record so a failed
        // create leaves the grant retryable. Sequential protection only;
        // concurrent exclusion still needs atomic storage.
        let boardingGrantHash = '';
        if (['nfc', 'qr', 'code'].includes(method) && !locallyVerified) {
          boardingGrantHash = await hashSecret(body.verification_grant);
          const used = await base44.asServiceRole.entities.StaffCheckIn.filter({
            device_id: device.id, company_id: companyId, vehicle_id: vehicleId,
            boarding_grant_hash: boardingGrantHash,
          }, '-created_date', 1);
          if (used.length) return Response.json({ error: 'This boarding authorization has already been used. Tap or enter your code again.' }, { status: 403 });
        }
        const refusal = wrongBus(person, vehicleId);
        if (refusal) return Response.json(refusal, { status: 403 });
        const cardTag = person?.nfc_tag || person?.id || sanitize(staff_id) || sanitize(staff_name);
        const status = ['boarded', 'off_board'].includes(requestedStatus)
          ? requestedStatus
          : await nextStatus(base44, vehicleId, 'card_tag', cardTag);
        const resolvedVehicleName = vehicleName || (await resolveVehicleName(base44, vehicleId));
        // Two identical requests (a retry racing the original) create one
        // check-in and both get that same record back.
        const record = await createOnce(requestId ? 'checkin:' + device.id + ':' + requestId : null, () => base44.asServiceRole.entities.StaffCheckIn.create({
          ...(requestId ? {client_request_id:requestId,request_hash:requestHash,device_id:device.id} : {}),
          ...(boardingGrantHash ? {boarding_grant_hash:boardingGrantHash,device_id:device.id} : {}),
          staff_name: person?.full_name || sanitize(staff_name) || 'Staff',
          staff_picture_url: person?.photo_url || '',
          card_tag: cardTag, status, boarded_at: occurredAt(body.occurred_at),
          company_id: companyId, company_name: companyName,
          vehicle_id: vehicleId, vehicle_name: resolvedVehicleName,
          check_in_method: ['nfc', 'qr', 'manual', 'code'].includes(method) ? method : 'manual',
        }));
        // A summary failure must not turn a completed write into a retry.
        let stats = {};
        try { stats = boardingStats(await tabletCheckIns(base44, companyId, vehicleId)); } catch { /* heartbeat refreshes counts later */ }
        return Response.json({ record: tabletCheckIn(record), ...stats });
      }

      // --- front_desk: visitor sign-in with a captured signature ---
      case 'front_desk_sign_in': {
        const { full_name, company_name: visitorCompanyName, reason, signature_base64 } = body;
        const name = sanitize(full_name);
        if (!name) return Response.json({ error: 'full_name required' }, { status: 400 });
        let signatureUrl = '';
        if (signature_base64) {
          try {
            const b64 = String(signature_base64).replace(/^data:image\/\w+;base64,/, '');
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const file = new File([bytes], `signature-${Date.now()}.png`, { type: 'image/png' });
            const uploaded = await base44.asServiceRole.integrations.Core.UploadPublicFile({ file });
            signatureUrl = uploaded.file_url;
          } catch { /* signature is a nice-to-have — sign-in still records without it */ }
        }
        const signIn = await base44.asServiceRole.entities.FrontDeskSignIns.create({
          full_name: name, company_name: sanitize(visitorCompanyName), reason: sanitize(reason),
          signature_url: signatureUrl, signed_at: new Date().toISOString(),
        });
        return Response.json({ sign_in: signIn });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.status?error.message:'Request failed' }, { status: error.status||500 });
  }
}