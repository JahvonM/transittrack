import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Kiosk tablets are unauthenticated (paired by device ID, like driverSession),
// so every write here goes through the service role.
async function resolveKioskDevice(base44, deviceId) {
  if (!deviceId || typeof deviceId !== 'string') return null;
  try {
    const device = await base44.asServiceRole.entities.KioskDevice.get(deviceId);
    if (!device || !device.paired || device.status !== 'active') return null;
    return device;
  } catch { return null; }
}

// Same merge as driverSession's loadStaff (duplicated — functions can't
// import across each other in this runtime): registered staff Users plus
// Contact records of type 'staff', matched on email, both scoped to the
// device's company. Badge/QR check-in matches against nfc_tag_id /
// nfc_card_tag on whichever record represents that person.
async function loadStaffDirectory(base44, companyId) {
  const [users, contacts] = await Promise.all([
    base44.asServiceRole.entities.User.list(),
    base44.asServiceRole.entities.Contact.filter({ type: 'staff' }, '-updated_date', 500),
  ]);
  const userByEmail = new Map(
    users.filter((u) => u.role === 'staff' && u.company_id === companyId)
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
        nfc_tag: c.nfc_card_tag || u.nfc_tag_id || '',
        access_code: c.access_code || u.access_code || '',
        one_time_code: u.one_time_code || '', one_time_code_expires_at: u.one_time_code_expires_at || null,
      };
    }),
    ...orphanUsers.map((u) => ({
      source: 'user', id: u.id, full_name: u.full_name || u.email || 'Staff',
      email: u.email || '', photo_url: u.photo_url || '', nfc_tag: u.nfc_tag_id || '',
      access_code: u.access_code || '',
      one_time_code: u.one_time_code || '', one_time_code_expires_at: u.one_time_code_expires_at || null,
    })),
  ];
}

function randomDigits(len) {
  let out = '';
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
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

const VEHICLE_ONLY_ACTIONS = new Set(['check_in', 'lookup_tag', 'lookup_code']);

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
    const device = await resolveKioskDevice(base44, device_id);
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

    switch (action) {
      // --- bus_boarding: manual entry (search-as-you-type staff picker) ---
      case 'search_staff': {
        const q = sanitize(body.query).toLowerCase();
        if (q.length < 1) return Response.json({ staff: [] });
        const directory = await loadStaffDirectory(base44, companyId);
        const matches = directory.filter((s) => s.full_name.toLowerCase().includes(q)).slice(0, 20);
        return Response.json({ staff: matches.map((s) => ({ id: s.id, full_name: s.full_name, photo_url: s.photo_url })) });
      }

      // --- bus_boarding: NFC tap lookup, before confirming ---
      case 'lookup_tag': {
        const directory = await loadStaffDirectory(base44, companyId);
        const person = directory.find((s) => s.nfc_tag && s.nfc_tag === sanitize(body.card_tag));
        if (!person) return Response.json({ error: 'badge_not_registered' }, { status: 404 });
        const status = await nextStatus(base44, vehicleId, 'card_tag', person.nfc_tag || person.id);
        return Response.json({ staff: { id: person.id, full_name: person.full_name, photo_url: person.photo_url }, next_status: status });
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
          person = directory.find((s) => s.one_time_code && s.one_time_code === code && s.one_time_code_expires_at && new Date(s.one_time_code_expires_at).getTime() > now);
          codeType = 'one_time';
        }
        if (!person) return Response.json({ error: 'code_not_recognized' }, { status: 404 });
        const status = await nextStatus(base44, vehicleId, 'card_tag', person.nfc_tag || person.id);
        return Response.json({ staff: { id: person.id, full_name: person.full_name, photo_url: person.photo_url }, next_status: status, code_type: codeType });
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
        if (person.source === 'user') await base44.asServiceRole.entities.User.update(person.id, { access_code: code });
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
        const cardTag = person?.nfc_tag || person?.id || sanitize(staff_id) || sanitize(staff_name);
        const status = ['boarded', 'off_board'].includes(requestedStatus)
          ? requestedStatus
          : await nextStatus(base44, vehicleId, 'card_tag', cardTag);
        const resolvedVehicleName = vehicleName || (await resolveVehicleName(base44, vehicleId));
        const record = await base44.asServiceRole.entities.StaffCheckIn.create({
          staff_name: person?.full_name || sanitize(staff_name) || 'Staff',
          staff_picture_url: person?.photo_url || '',
          card_tag: cardTag, status, boarded_at: new Date().toISOString(),
          company_id: companyId, company_name: companyName,
          vehicle_id: vehicleId, vehicle_name: resolvedVehicleName,
          check_in_method: ['nfc', 'qr', 'manual', 'code'].includes(method) ? method : 'manual',
        });
        // A one-time code is single-use — burn it now that it's actually been
        // used to check in, not at lookup time (cancelling the confirm screen
        // shouldn't waste it).
        if (code_type === 'one_time' && person?.source === 'user') {
          await base44.asServiceRole.entities.User.update(person.id, { one_time_code: '', one_time_code_expires_at: null });
        }
        return Response.json({ record });
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
