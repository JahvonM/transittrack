import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';


async function liveMembership(base44, row) {
 if (!row.expires_at && !row.code_hash) return true; // Explicit admin approval.
 if (!(Date.parse(row.expires_at) > Date.now()) || !row.code_hash) return false;
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
async function approvedStaffIds(base44, companyId) {
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ company_id: companyId, active: true, scope: 'passenger' }, '-updated_date', 5000);
  const ids=new Set();
  for(const row of rows) if(await liveMembership(base44,row)) ids.add(row.user_id);
  return ids;
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
  if (!credential) {
    // No upgrade based on possession of an ID. Only older records may use legacy auth.
    const created = Date.parse(device.created_date);
    return Number.isFinite(created) && created < LEGACY_DEVICE_CUTOFF;
  }
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  if (!(Date.parse(credential.expires_at) > Date.now())) return false;
  if (credential.company_id !== device.company_id || credential.vehicle_id !== (device.vehicle_id || '') || credential.kiosk_type !== device.kiosk_type) return false;
  if (!sameDigest(credential.pairing_code_hash, await deviceDigest(device.pairing_code || ''))) return false;
  return sameDigest(credential.token_hash, await deviceDigest(token));
}


// Kiosk tablets are unauthenticated (paired by device ID, like driverSession),
// so every write here goes through the service role.
async function resolveKioskDevice(base44, deviceId, token) {
  if (!deviceId || typeof deviceId !== 'string') return null;
  try {
    const device = await base44.asServiceRole.entities.KioskDevice.get(deviceId);
    if (!device || device.kiosk_type === 'driver' || !(await authenticatedTablet(base44, device, token))) return null;
    return device;
  } catch { return null; }
}

// Same merge as driverSession's loadStaff (duplicated — functions can't
// import across each other in this runtime): registered staff Users plus
// Contact records of type 'staff', matched on email, both scoped to the
// device's company. Badge/QR check-in matches against nfc_tag_id /
// nfc_card_tag on whichever record represents that person.
async function loadStaffDirectory(base44, companyId) {
  const approvedIds = await approvedStaffIds(base44, companyId);
  const [users, contacts] = await Promise.all([
    base44.asServiceRole.entities.User.list(),
    base44.asServiceRole.entities.Contact.filter({ type: 'staff', company_id: companyId }, '-updated_date', 500),
  ]);
  const activeCards = await base44.asServiceRole.entities.NfcCard.filter({ company_id: companyId, is_active: true }, '-issue_date', 3000);
  const cardForUser = id => activeCards.find(c => c.holder_source === 'user' && c.holder_id === id && (!c.expiry_date || c.expiry_date >= new Date().toISOString().slice(0,10)))?.card_uid || '';
  const userByEmail = new Map(
    users.filter((u) => u.role === 'staff' && approvedIds.has(u.id))
      .map((u) => [(u.email || '').toLowerCase(), u])
  );
  const companyContacts = contacts.filter((c) => c.company_id === companyId);
  const contactEmails = new Set(companyContacts.map((c) => (c.email || '').toLowerCase()));
  const orphanUsers = [...userByEmail.values()].filter((u) => !contactEmails.has((u.email || '').toLowerCase()));
  return [
    ...companyContacts.map((c) => {
      const u = userByEmail.get((c.email || '').toLowerCase()) || {};
      return {
        source: 'contact', id: c.id, full_name: c.name || u.full_name || 'Staff',
        email: c.email || u.email || '', photo_url: u.photo_url || '',
        nfc_tag: c.nfc_card_tag || cardForUser(u.id),
        access_code: c.access_code || '',
        one_time_code: u.one_time_code || '', one_time_code_expires_at: u.one_time_code_expires_at || null,
        vehicle_id: c.vehicle_id || '', vehicle_name: c.vehicle_name || '',
      };
    }),
    ...orphanUsers.map((u) => ({
      source: 'user', id: u.id, full_name: u.full_name || u.email || 'Staff',
      email: u.email || '', photo_url: u.photo_url || '', nfc_tag: cardForUser(u.id),
      access_code: '',
      one_time_code: u.one_time_code || '', one_time_code_expires_at: u.one_time_code_expires_at || null,
      vehicle_id: '', vehicle_name: '',
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
async function reserveAttempt(base44, key, limit, windowMs) {
 const rows = await base44.asServiceRole.entities.VerificationAttempt.filter({ scope: key }, '-created_date', limit);
 const recent = rows.filter(r => Date.parse(r.attempted_at) > Date.now() - windowMs);
 if (recent.length >= limit) return false;
 await base44.asServiceRole.entities.VerificationAttempt.create({ scope: key, attempted_at: new Date().toISOString() });
 return true;
}
async function issueGrant(base44, device, purpose, subject, ttlMs) {
 const secret = randomSecret();
 await base44.asServiceRole.entities.VerificationGrant.create({
 token_hash: await hashSecret(secret), device_id: device.id, company_id: device.company_id,
 vehicle_id: device.vehicle_id, pairing_code_hash: await hashSecret(device.pairing_code || ''), purpose, subject, expires_at: new Date(Date.now()+ttlMs).toISOString(),
 });
 return secret;
}
async function validGrant(base44, device, token, purpose, subject) {
 if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
 const rows = await base44.asServiceRole.entities.VerificationGrant.filter({ token_hash: await hashSecret(token) }, '-created_date', 1);
 const row = rows[0];
 return !!row && row.pairing_code_hash === await hashSecret(device.pairing_code || '') && row.device_id === device.id && row.company_id === device.company_id && row.vehicle_id === device.vehicle_id && row.purpose === purpose && row.subject === subject && Date.parse(row.expires_at) > Date.now();
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
        if (!device) return Response.json({ error: 'Tablets only' }, { status: 403 });
        return Response.json({ generated_at: new Date().toISOString(), staff: [], verification_online_only: true });
      }

      // --- bus_boarding: NFC tap lookup, before confirming ---
      case 'lookup_tag': {
        const directory = await loadStaffDirectory(base44, companyId);
        const person = directory.find((s) => s.nfc_tag && s.nfc_tag === sanitize(body.card_tag));
        if (!person) return Response.json({ error: 'badge_not_registered' }, { status: 404 });
        const refusal = wrongBus(person, vehicleId);
        if (refusal) return Response.json(refusal, { status: 403 });
        const status = await nextStatus(base44, vehicleId, 'card_tag', person.nfc_tag || person.id);
        return Response.json({ staff: { id: person.id, full_name: person.full_name, photo_url: person.photo_url }, next_status: status, verification_grant: await issueGrant(base44, device, 'boarding', person.id, 24 * 3600_000) });
      }

      // --- bus_boarding: keypad code entry — either a permanent, admin-
      // assigned access_code, or a staff member's own temporary one_time_code
      // (self-generated from their app when they forgot their badge) ---
      case 'lookup_code': {
        const code = sanitize(body.code);
        if (!code) return Response.json({ error: 'code required' }, { status: 400 });
        const directory = await loadStaffDirectory(base44, companyId);
        const now = Date.now();
        let person = directory.find((s) => s.access_code && s.access_code === code);
        let codeType = 'access';
        if (!person) {
          const credentials = await base44.asServiceRole.entities.PassengerAccessCredential.filter({ company_id: companyId, token_hash: await hashSecret(code) }, '-updated_date', 2);
          const user = credentials[0] ? await base44.asServiceRole.entities.User.get(credentials[0].user_id) : null;
          person = user ? directory.find(s => s.id === user.id || (s.email && s.email.toLowerCase() === (user.email || '').toLowerCase())) : null;
        }
        if (!person) {
          const credentials = await base44.asServiceRole.entities.PassengerOneTimeCredential.filter({ company_id: companyId, token_hash: await hashSecret(code) }, '-created_date', 2);
          const credential = credentials.find(c => !c.consumed_at && Date.parse(c.expires_at) > now);
          const user = credential ? await base44.asServiceRole.entities.User.get(credential.user_id) : null;
          person = user ? directory.find(s => s.id === user.id || (s.email && s.email.toLowerCase() === (user.email || '').toLowerCase())) : null;
          codeType = 'one_time';
        }
        if (!person) return Response.json({ error: 'code_not_recognized' }, { status: 404 });
        const refusal = wrongBus(person, vehicleId);
        if (refusal) return Response.json(refusal, { status: 403 });
        if (codeType === 'one_time') {
          const credentials = await base44.asServiceRole.entities.PassengerOneTimeCredential.filter({ company_id: companyId, token_hash: await hashSecret(code) }, '-created_date', 2);
          const current = credentials.find(c => !c.consumed_at && Date.parse(c.expires_at) > Date.now());
          if (!current) return Response.json({ error: 'code_not_recognized' }, { status: 404 });
          await base44.asServiceRole.entities.PassengerOneTimeCredential.update(current.id, { consumed_at: new Date().toISOString() });
        }
        const status = await nextStatus(base44, vehicleId, 'card_tag', person.nfc_tag || person.id);
        return Response.json({ staff: { id: person.id, full_name: person.full_name, photo_url: person.photo_url }, next_status: status, code_type: codeType, verification_grant: await issueGrant(base44, device, 'boarding', person.id, 24 * 3600_000) });
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
        const existingCodes = new Set(directory.map((s) => s.access_code).filter(Boolean));
        let code = randomDigits(5);
        for (let i = 0; i < 5 && existingCodes.has(code); i++) code = randomDigits(5);
        if (existingCodes.has(code)) return Response.json({ error: 'Could not allocate a unique code' }, { status: 503 });
        if (person.source === 'user') {
          const old = await base44.asServiceRole.entities.PassengerAccessCredential.filter({ user_id: person.id }, '-updated_date', 1);
          const data = { user_id: person.id, company_id: companyId, token_hash: await hashSecret(code) };
          if (old[0]) await base44.asServiceRole.entities.PassengerAccessCredential.update(old[0].id, data);
          else await base44.asServiceRole.entities.PassengerAccessCredential.create(data);
        }
        else await base44.asServiceRole.entities.Contact.update(person.id, { access_code: code });
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
        const directory = await loadStaffDirectory(base44, companyId);
        const person = directory.find((s) => s.id === sanitize(staff_id)) || null;
        if (['nfc', 'qr', 'code'].includes(method) && (!person || !(await validGrant(base44, device, body.verification_grant, 'boarding', person.id)))) return Response.json({ error: 'Online credential verification required' }, { status: 403 });
        const refusal = wrongBus(person, vehicleId);
        if (refusal) return Response.json(refusal, { status: 403 });
        const cardTag = person?.nfc_tag || person?.id || sanitize(staff_id) || sanitize(staff_name);
        const status = ['boarded', 'off_board'].includes(requestedStatus)
          ? requestedStatus
          : await nextStatus(base44, vehicleId, 'card_tag', cardTag);
        const resolvedVehicleName = vehicleName || (await resolveVehicleName(base44, vehicleId));
        const record = await base44.asServiceRole.entities.StaffCheckIn.create({
          staff_name: person?.full_name || sanitize(staff_name) || 'Staff',
          staff_picture_url: person?.photo_url || '',
          card_tag: cardTag, status, boarded_at: occurredAt(body.occurred_at),
          company_id: companyId, company_name: companyName,
          vehicle_id: vehicleId, vehicle_name: resolvedVehicleName,
          check_in_method: ['nfc', 'qr', 'manual', 'code'].includes(method) ? method : 'manual',
        });
        // A one-time code is single-use — burn it now that it's actually been
        // used to check in, not at lookup time (cancelling the confirm screen
        // shouldn't waste it).
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
            const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
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
    return Response.json({ error: error.message }, { status: 500 });
  }
}
