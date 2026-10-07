import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { findPhoneDriver, driverVehicles, normEmail } from '../../shared/driverPhone.ts';
import { sendPushToTokens } from '../../shared/fcm.ts';

// The driver phone app. Drivers sign in with their own Google account; the
// server matches that email to a Driver record an administrator switched on
// for the phone app (see shared/driverPhone.ts). Nothing here trusts the
// signed-in person's role, and every bus, message and document is checked
// against the driver's own company and assigned buses.
//
// The phone never sends its location: tracking stays on the bus tablet.

const PHONE_CHANNELS = ['dispatch', 'company'];
const REPORT_TYPES = ['breakdown', 'accident', 'delay', 'other'];
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const TIME_ZONE = 'America/Grenada';
const localDay = (date) => new Date(date).toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

// The walk-around check before getting in. Fixed list, so every phone check
// reads the same in Inspection history; problems become mechanic faults.
const WALKAROUND = [
  { id: 'tyres', section: 'Outside', item: 'Tyres and wheels', critical: 'High' },
  { id: 'lights', section: 'Outside', item: 'Lights and indicators', critical: 'High' },
  { id: 'mirrors', section: 'Outside', item: 'Mirrors', critical: 'Medium' },
  { id: 'windscreen', section: 'Outside', item: 'Windscreen and wipers', critical: 'Medium' },
  { id: 'body', section: 'Outside', item: 'Bodywork (no new damage)', critical: 'Low' },
  { id: 'leaks', section: 'Outside', item: 'No leaks under the bus', critical: 'High' },
  { id: 'doors', section: 'Inside', item: 'Doors and emergency exits', critical: 'High' },
  { id: 'interior', section: 'Inside', item: 'Seats, belts and floor', critical: 'Medium' },
  { id: 'safety_kit', section: 'Inside', item: 'First aid kit and fire extinguisher', critical: 'Medium' },
];
const SEVERITY = { Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical' };
const MAX_WALKAROUND_PHOTOS = 6;

// "Start with the driver app" codes, as the tablet shows them (see
// driverSession phone_unlock_code). Typed codes may include spaces or dashes.
const UNLOCK_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
function unlockCodeFrom(value) {
  const raw = String(value || '').trim();
  const fromLink = /[?&]code=([^&#\s]+)/i.exec(raw);
  return decodeURIComponent(fromLink ? fromLink[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}
async function claimFailuresExhausted(base44, userId) {
  const rows = await base44.asServiceRole.entities.VerificationAttempt.filter({ scope: 'phone-claim:' + userId }, '-created_date', 10);
  return rows.filter((r) => Date.parse(r.attempted_at) > Date.now() - 15 * 60_000).length >= 10;
}
const noteClaimFailure = (base44, userId) => base44.asServiceRole.entities.VerificationAttempt.create({ scope: 'phone-claim:' + userId, attempted_at: new Date().toISOString() });

// When a shift starts or ends nobody is riding any more: close out anyone
// the boarding tablet still counts as aboard (same as the bus tablet does).
async function offboardEveryone(base44, { companyId, companyName, vehicleId, vehicleName, at }) {
  const db = base44.asServiceRole.entities;
  const rows = [];
  for (let skip = 0; ; skip += 500) {
    const batch = await db.StaffCheckIn.filter({ company_id: companyId, vehicle_id: vehicleId }, '-created_date', 500, skip);
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  const latest = new Map();
  for (const row of rows) {
    const key = row.card_tag || row.staff_name;
    if (!key) continue;
    const prev = latest.get(key);
    if (!prev || Date.parse(row.created_date) > Date.parse(prev.created_date)) latest.set(key, row);
  }
  const aboard = [...latest.values()].filter((r) => r.status === 'boarded');
  if (!aboard.length) return;
  await db.StaffCheckIn.bulkCreate(aboard.map((r) => ({
    staff_name: r.staff_name, staff_picture_url: r.staff_picture_url || '', card_tag: r.card_tag,
    status: 'off_board', boarded_at: new Date(at).toISOString(), check_in_method: 'manual',
    company_id: companyId, company_name: companyName, vehicle_id: vehicleId, vehicle_name: r.vehicle_name || vehicleName || '',
  })));
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function sanitize(value) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim();
}
function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const flagActive = (on, until) => !!on && !!until && new Date(until).getTime() > Date.now();
// "Jane D." — enough for a driver to greet someone at the stop.
function shortName(full) {
  const parts = sanitize(full).split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Passenger';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

// --- Company access (same rules as driverSession / notifyAdminMessage) ---
async function liveMembership(base44, row) {
  if (!row.expires_at && !row.code_hash) return true; // Explicit admin approval.
  if (!row.code_hash || (row.scope !== 'passenger' && !(Date.parse(row.expires_at) > Date.now()))) return false;
  const company = await base44.asServiceRole.entities.Company.get(row.company_id).catch(() => null);
  if (!company) return false;
  return row.code_hash === await digest(company.access_code || '');
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function approvedCompanies(base44, user, scope) {
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ user_id: user.id, active: true }, '-updated_date', 100);
  const approved = [];
  for (const row of rows) if (row.scope === scope && await liveMembership(base44, row)) approved.push(row.company_id);
  return approved;
}
async function approvedPassengerMemberships(base44, companyId) {
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ company_id: companyId, active: true, scope: 'passenger' }, '-updated_date', 5000);
  const company = rows.some((row) => row.code_hash) ? await base44.asServiceRole.entities.Company.get(companyId).catch(() => null) : null;
  const codeHash = company ? await digest(company.access_code || '') : null;
  return rows.filter((row) => (!row.expires_at && !row.code_hash) || (row.code_hash && row.code_hash === codeHash));
}
async function recipientRows(db, name, query) {
  const rows = [];
  for (let skip = 0; skip < 10000; skip += 500) {
    const batch = await db[name].filter(query, '-created_date', 500, skip);
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
  throw new Error('Notification recipient set is too large');
}
// Admins always; a company's own manager on the 'company' channel.
async function pushTokensForChannel(base44, channel, companyId) {
  const db = base44.asServiceRole.entities;
  const roles = channel === 'company' ? ['admin', 'company'] : ['admin'];
  const users = await recipientRows(db, 'User', { role: { $in: roles } });
  const tokens = new Set();
  for (const user of users) {
    if (!user.email) continue;
    if (user.role === 'company' && !(await approvedCompanies(base44, user, 'manager')).includes(companyId)) continue;
    for (const row of await recipientRows(db, 'PushToken', { email: user.email })) {
      if (typeof row.token === 'string' && row.token) tokens.add(row.token);
    }
  }
  return [...tokens];
}
async function notify(base44, channel, companyId, payload) {
  try {
    const serviceAccountJson = secrets.get('FIREBASE_SERVICE_ACCOUNT');
    if (!serviceAccountJson) return;
    await sendPushToTokens(serviceAccountJson, await pushTokensForChannel(base44, channel, companyId), payload);
  } catch { /* alerts are best effort; the record is already saved */ }
}

// --- What the phone shows ---
function busSummary(v) {
  return {
    id: v.id, name: sanitize(v.name) || 'Bus', plate_number: v.plate_number || '', fleet_number: v.fleet_number || '',
    type: v.type || '', capacity: v.capacity ?? null, route_id: v.route_id || '',
    tracking_active: !!v.tracking_active, last_location_update: v.last_location_update || null,
  };
}
function sortedStops(route) {
  return [...(route?.stops || [])]
    .map((s, i) => ({ name: sanitize(s.name) || `Stop ${i + 1}`, lat: Number.isFinite(Number(s.lat)) ? Number(s.lat) : null, lng: Number.isFinite(Number(s.lng)) ? Number(s.lng) : null, order: Number.isFinite(Number(s.order)) ? Number(s.order) : i }))
    .sort((a, b) => a.order - b.order);
}

// Passengers who ride this bus, each listed at the stop nearest their
// pinned pickup point (as on the bus tablet). Names only: no addresses,
// phone numbers or pickup coordinates leave the server.
async function pickupsFor(base44, companyId, vehicleId, stops) {
  const db = base44.asServiceRole.entities;
  const memberships = await approvedPassengerMemberships(base44, companyId);
  const membershipByUser = new Map(memberships.map((m) => [m.user_id, m]));
  const userIds = [...membershipByUser.keys()].filter(Boolean);
  const [users, contacts] = await Promise.all([
    userIds.length ? db.User.filter({ id: { $in: userIds } }, '-updated_date', 5000) : [],
    db.Contact.filter({ company_id: companyId }, '-updated_date', 2000),
  ]);
  const userByEmail = new Map(users.filter((u) => u.email && membershipByUser.has(u.id)).map((u) => [normEmail(u.email), u]));
  const people = [];
  const seen = new Set();
  for (const c of contacts) {
    if (c.company_id !== companyId || !['staff', 'passenger'].includes(c.type)) continue;
    const u = userByEmail.get(normEmail(c.email)) || {};
    const bus = c.vehicle_id || membershipByUser.get(u.id)?.vehicle_id || '';
    if (bus && bus !== vehicleId) continue;
    if (c.email) seen.add(normEmail(c.email));
    people.push({
      name: u.display_name || c.name || u.full_name,
      lat: c.pickup_lat ?? u.pickup_lat ?? u.home_lat, lng: c.pickup_lng ?? u.pickup_lng ?? u.home_lng,
      pickup_name: c.pickup_name || u.pickup_name || '',
      skipping: flagActive(u.skip_pickup_today, u.skip_pickup_until), late: flagActive(u.late_snooze_active, u.late_until),
    });
  }
  for (const [email, u] of userByEmail) {
    if (seen.has(email) || !['staff', 'passenger'].includes(u.role)) continue;
    const bus = membershipByUser.get(u.id)?.vehicle_id || '';
    if (bus && bus !== vehicleId) continue;
    people.push({
      name: u.display_name || u.full_name, lat: u.pickup_lat ?? u.home_lat, lng: u.pickup_lng ?? u.home_lng,
      pickup_name: u.pickup_name || '',
      skipping: flagActive(u.skip_pickup_today, u.skip_pickup_until), late: flagActive(u.late_snooze_active, u.late_until),
    });
  }
  const located = stops.filter((s) => s.lat != null && s.lng != null);
  return people.map((p) => {
    let stop = '';
    if (p.lat != null && p.lng != null && located.length) {
      let best = null;
      for (const s of located) { const d = haversineMeters(Number(p.lat), Number(p.lng), s.lat, s.lng); if (!best || d < best.d) best = { d, name: s.name }; }
      stop = best.name;
    } else if (p.pickup_name && stops.some((s) => s.name === sanitize(p.pickup_name))) {
      stop = sanitize(p.pickup_name);
    }
    return { name: shortName(p.name), stop, skipping: p.skipping, late: p.late };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function shiftSummary(s, email = '') {
  if (!s) return null;
  return {
    id: s.id, mine: !!email && normEmail(s.driver_email) === email, started_with: s.started_with || 'tablet',
    started_at: s.started_at || null, ended_at: s.ended_at || null,
    duration_minutes: s.duration_minutes ?? null, driver_name: sanitize(s.driver_name), vehicle_name: sanitize(s.vehicle_name),
  };
}
function phoneMessage(m, email) {
  return {
    id: m.id, channel: m.channel || 'staff', sender_role: m.sender_role || '', sender_name: sanitize(m.sender_name),
    text: m.text || '', message_type: m.message_type || 'text', media_url: m.media_url || '', created_date: m.created_date || null,
    mine: m.sender_role === 'driver' && normEmail(m.sender_email) === email,
  };
}

async function pickBus(base44, driver, vehicleId) {
  const buses = await driverVehicles(base44, driver);
  if (vehicleId == null || vehicleId === '') return { buses, bus: buses[0] || null };
  if (typeof vehicleId !== 'string') fail(400, 'Invalid bus');
  const bus = buses.find((v) => v.id === vehicleId);
  if (!bus) fail(403, 'This bus is not assigned to you');
  return { buses, bus };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.email) return Response.json({ error: 'Sign in to continue', code: 'SIGN_IN_REQUIRED' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { driver, reason } = await findPhoneDriver(base44, user.email);
    if (!driver) {
      return Response.json({
        error: reason === 'ambiguous'
          ? 'Your email is on more than one company\'s driver list. Ask your administrator to fix it.'
          : 'Ask your administrator to put this email on your driver record and switch on "Can use the phone app".',
        code: 'NOT_A_DRIVER',
      }, { status: 403 });
    }
    const email = normEmail(user.email);
    const companyId = driver.company_id;
    const db = base44.asServiceRole.entities;
    const action = body?.action;

    switch (action) {
      case 'me': {
        const buses = await driverVehicles(base44, driver);
        const company = await db.Company.get(companyId).catch(() => null);
        return Response.json({
          driver: { name: sanitize(driver.full_name) || 'Driver', email: driver.email || '', phone: driver.phone || '', employee_id: driver.employee_id || '', photo_url: driver.photo_url || '' },
          company: { id: companyId, name: sanitize(company?.name || driver.company_name), logo_url: company?.logo_url || '' },
          buses: buses.map(busSummary),
        });
      }

      case 'today': {
        const { buses, bus } = await pickBus(base44, driver, body.vehicle_id);
        if (!bus) return Response.json({ buses: [], bus: null, route: null, pickups: [], shift: null, last_shift: null, notices: [], contacts: null, workplace: null });
        const [route, shifts, broadcasts, company, workplaces, inspections] = await Promise.all([
          bus.route_id ? db.Route.get(bus.route_id).catch(() => null) : null,
          db.DriverShift.filter({ vehicle_id: bus.id }, '-started_at', 5).catch(() => []),
          db.Broadcast.filter({ company_id: companyId }, '-created_date', 30).catch(() => []),
          db.Company.get(companyId).catch(() => null),
          db.Workplace.filter({ company_id: companyId }, '-updated_date', 5).catch(() => []),
          db.Inspection.filter({ vehicle_id: bus.id }, '-created_date', 10).catch(() => []),
        ]);
        const walk = inspections.find((i) => i.company_id === companyId && i.trigger === 'driver_phone' && localDay(i.created_date) === localDay(Date.now()));
        const routeOk = route && route.company_id === companyId;
        const stops = routeOk ? sortedStops(route) : [];
        const pickups = await pickupsFor(base44, companyId, bus.id, stops);
        const busShifts = shifts.filter((s) => s.company_id === companyId);
        const weekAgo = Date.now() - 7 * 86400_000;
        const notices = broadcasts
          .filter((b) => b.company_id === companyId && Date.parse(b.created_date) > weekAgo)
          .filter((b) => (b.driver_email ? normEmail(b.driver_email) === email : b.type === 'info' && !b.is_reply))
          .slice(0, 5)
          .map((b) => ({ id: b.id, title: sanitize(b.title), message: sanitize(b.message), created_date: b.created_date || null }));
        const workplace = workplaces.find((w) => w.company_id === companyId);
        return Response.json({
          buses: buses.map(busSummary), bus: busSummary(bus),
          route: routeOk ? { id: route.id, name: sanitize(route.name), stops } : null,
          pickups,
          shift: shiftSummary(busShifts.find((s) => !s.ended_at), email),
          last_shift: shiftSummary(busShifts.find((s) => s.ended_at), email),
          walkaround: walk ? { status: walk.status, created_date: walk.created_date, driver_name: sanitize(walk.driver_name) } : null,
          notices,
          contacts: { dispatch_phone: company?.secretary_phone || '', manager_phone: company?.boss_phone || '' },
          workplace: workplace ? { name: sanitize(workplace.name) || 'Workplace' } : null,
        });
      }

      case 'messages': {
        const { bus } = await pickBus(base44, driver, body.vehicle_id);
        if (!bus) return Response.json({ messages: [] });
        const rows = await db.GroupMessage.filter({ vehicle_id: bus.id }, '-created_date', 200);
        const messages = rows
          .filter((m) => m.company_id === companyId && PHONE_CHANNELS.includes(m.channel))
          .slice(0, 100).reverse().map((m) => phoneMessage(m, email));
        return Response.json({ messages });
      }

      case 'send': {
        const { bus } = await pickBus(base44, driver, body.vehicle_id);
        if (!bus) fail(400, 'No bus is assigned to you');
        const channel = PHONE_CHANNELS.includes(body.channel) ? body.channel : 'dispatch';
        const text = sanitize(body.text).slice(0, 1000);
        if (!text) fail(400, 'Type a message first');
        const message = await db.GroupMessage.create({
          vehicle_id: bus.id, vehicle_name: bus.name, company_id: companyId, company_name: bus.company_name || driver.company_name || '',
          channel, sender_role: 'driver', sender_name: sanitize(driver.full_name) || 'Driver', sender_email: user.email, sender_id: user.id,
          text, message_type: 'text',
        });
        await notify(base44, channel, companyId, {
          title: `${sanitize(bus.name) || 'Bus'} · ${sanitize(driver.full_name) || 'Driver'}`,
          body: text.slice(0, 500),
          data: { type: 'group_message', vehicle_id: bus.id, channel },
        });
        return Response.json({ message: phoneMessage(message, email) });
      }

      case 'report': {
        const { bus } = await pickBus(base44, driver, body.vehicle_id);
        const type = REPORT_TYPES.includes(body.type) ? body.type : 'other';
        const details = sanitize(body.details).slice(0, 2000);
        if (!details) fail(400, 'Say what happened');
        const photos = body.photos == null ? [] : body.photos;
        if (!Array.isArray(photos) || photos.length > MAX_PHOTOS) fail(400, `Up to ${MAX_PHOTOS} photos`);
        const files = photos.map((p, i) => {
          if (!p || typeof p.data_base64 !== 'string' || !PHOTO_TYPES.includes(p.mime_type)) fail(400, 'Photos must be JPEG, PNG or WebP');
          if (p.data_base64.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) fail(413, 'A photo is too large');
          let bytes;
          try { bytes = base64ToBytes(p.data_base64); } catch { fail(400, 'A photo could not be read'); }
          const ext = p.mime_type.split('/')[1].replace('jpeg', 'jpg');
          return new File([bytes], `report-${Date.now()}-${i + 1}.${ext}`, { type: p.mime_type });
        });
        // Report photos are private: only admins can open them, through a
        // short-lived link.
        const photoUris = [];
        for (const file of files) {
          const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
          if (!uploaded?.file_uri) fail(502, 'A photo could not be uploaded');
          photoUris.push(uploaded.file_uri);
        }
        const incident = await db.Incident.create({
          vehicle_id: bus?.id || '', vehicle_name: bus?.name || '', company_id: companyId, company_name: bus?.company_name || driver.company_name || '',
          driver_name: sanitize(driver.full_name), driver_email: driver.email || user.email,
          type, details, occurred_at: new Date().toISOString(), status: 'open',
          photo_uris: photoUris, source: 'driver_phone',
        });
        await notify(base44, 'dispatch', companyId, {
          title: `Problem reported · ${sanitize(bus?.name) || sanitize(driver.full_name) || 'Driver'}`,
          body: `${type[0].toUpperCase()}${type.slice(1)}: ${details.slice(0, 200)}`,
          data: { type: 'incident', incident_id: incident.id },
        });
        return Response.json({ ok: true, incident: { id: incident.id, type, photos: photoUris.length } });
      }

      case 'claim_bus': {
        if (await claimFailuresExhausted(base44, user.id)) fail(429, 'Too many wrong codes. Wait 15 minutes, or use the bus PIN.');
        const code = unlockCodeFrom(body.code);
        if (!UNLOCK_CODE.test(code)) { await noteClaimFailure(base44, user.id); fail(400, 'That isn\'t a bus code. It has 6 letters and numbers.'); }
        const rows = await db.PhoneUnlock.filter({ code_hash: await digest('phone-unlock:' + code) }, '-created_date', 3);
        const row = rows.find((r) => r.status === 'pending' && Date.parse(r.expires_at) > Date.now());
        // Another company's tablet reads exactly like a wrong code.
        if (!row || row.company_id !== companyId) {
          await noteClaimFailure(base44, user.id);
          fail(404, 'That code didn\'t work. Codes last 2 minutes: tap "Start with the driver app" on the tablet again.');
        }
        const buses = await driverVehicles(base44, driver);
        const bus = buses.find((v) => v.id === row.vehicle_id);
        if (!bus) {
          const other = await db.Vehicle.get(row.vehicle_id).catch(() => null);
          fail(403, `${sanitize(other?.name) || 'This bus'} isn't assigned to you. Ask dispatch to assign it, or use the bus PIN.`);
        }
        const open = (await db.DriverShift.filter({ vehicle_id: bus.id }, '-started_at', 5)).find((x) => x.company_id === companyId && !x.ended_at);
        if (open && normEmail(open.driver_email) && normEmail(open.driver_email) !== email) {
          fail(409, `${sanitize(bus.name)} already has a shift open for ${sanitize(open.driver_name) || 'another driver'}. End it on the tablet first, or ask dispatch.`);
        }
        const now = new Date();
        let shift = open;
        if (!shift) {
          shift = await db.DriverShift.create({
            vehicle_id: bus.id, vehicle_name: bus.name, company_id: companyId, company_name: bus.company_name || driver.company_name || '',
            driver_name: sanitize(driver.full_name), driver_email: driver.email, device_id: row.device_id,
            started_at: now.toISOString(), started_with: 'phone',
          });
          try { await offboardEveryone(base44, { companyId, companyName: shift.company_name, vehicleId: bus.id, vehicleName: bus.name, at: now.getTime() }); }
          catch { /* the shift still starts; the boarding tablet corrects anyone left aboard */ }
        }
        await db.PhoneUnlock.update(row.id, {
          status: 'claimed', driver_id: driver.id, driver_email: driver.email, driver_name: sanitize(driver.full_name),
          claimed_at: now.toISOString(), shift_id: shift.id,
        });
        return Response.json({ ok: true, bus: busSummary(bus), shift: shiftSummary(shift, email), resumed: !!open });
      }

      case 'end_shift': {
        const buses = await driverVehicles(base44, driver);
        const ids = new Set(buses.map((b) => b.id));
        const mine = (await db.DriverShift.filter({ company_id: companyId }, '-started_at', 50))
          .filter((x) => !x.ended_at && ids.has(x.vehicle_id) && normEmail(x.driver_email) === email)
          .filter((x) => !body.vehicle_id || x.vehicle_id === body.vehicle_id);
        const shift = mine[0];
        if (!shift) fail(404, 'You have no shift open.');
        const end = Date.now();
        const startMs = Date.parse(shift.started_at);
        const ended = await db.DriverShift.update(shift.id, {
          ended_at: new Date(end).toISOString(), duration_minutes: Number.isFinite(startMs) ? Math.max(0, Math.round((end - startMs) / 60000)) : 0, ended_with: 'phone',
        });
        try { await offboardEveryone(base44, { companyId, companyName: shift.company_name, vehicleId: shift.vehicle_id, vehicleName: shift.vehicle_name, at: end }); }
        catch { /* the shift is still ended */ }
        return Response.json({ ok: true, shift: shiftSummary({ ...shift, ...ended }, email) });
      }

      case 'walkaround': {
        const { bus } = await pickBus(base44, driver, body.vehicle_id);
        if (!bus) fail(400, 'No bus is assigned to you');
        const answers = Array.isArray(body.items) ? body.items : [];
        const byId = new Map(answers.filter((a) => a && typeof a.id === 'string').map((a) => [a.id, a]));
        if (WALKAROUND.some((w) => !byId.has(w.id))) fail(400, 'Check every item first');
        const withPhotos = answers.filter((a) => typeof a?.photo_data === 'string' && a.photo_data);
        if (withPhotos.length > MAX_WALKAROUND_PHOTOS) fail(400, `Up to ${MAX_WALKAROUND_PHOTOS} photos`);
        if (withPhotos.some((a) => a.photo_data.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4)) fail(413, 'A photo is too large');
        for (const w of WALKAROUND) {
          const a = byId.get(w.id);
          if (a.condition === 'FAILED' && !sanitize(a.notes) && !a.photo_data) fail(400, `Say what's wrong with: ${w.item}`);
        }
        const results = [];
        for (const w of WALKAROUND) {
          const a = byId.get(w.id);
          const condition = a.condition === 'FAILED' ? 'FAILED' : 'GOOD';
          const notes = sanitize(a.notes).slice(0, 1000);
          let photo_url = '';
          if (typeof a.photo_data === 'string' && a.photo_data) {
            let bytes;
            try { bytes = base64ToBytes(a.photo_data); } catch { fail(400, 'A photo could not be read'); }
            const uploaded = await base44.asServiceRole.integrations.Core.UploadPublicFile({ file: new File([bytes], `walkaround-${Date.now()}-${w.id}.jpg`, { type: 'image/jpeg' }) });
            if (typeof uploaded?.file_url !== 'string' || !uploaded.file_url.startsWith('https://')) fail(502, 'A photo could not be uploaded');
            photo_url = uploaded.file_url;
          }
          results.push({ section_name: w.section, item_name: w.item, zone: '', critical: w.critical, condition, notes, photo_url });
        }
        const failed = results.filter((r) => r.condition === 'FAILED');
        const passed = !failed.length;
        const now = new Date().toISOString();
        const name = sanitize(driver.full_name) || 'Driver';
        const base = { vehicle_id: bus.id, vehicle_name: bus.name, company_id: companyId, company_name: bus.company_name || driver.company_name || '' };
        const inspection = await db.Inspection.create({
          ...base, driver_name: name, driver_email: driver.email, date: localDay(now),
          status: passed ? 'passed' : 'failed', template_name: 'Walk-around (driver app)', trigger: 'driver_phone',
          results, checklist: {}, needs_service: !passed,
          service_notes: passed ? '' : 'Problems: ' + failed.map((f) => f.item_name + (f.notes ? ` (${f.notes})` : '')).join('; ').slice(0, 1500),
        });
        // The same per-item rows a mechanic's check writes, so Inspection
        // history counts the driver's walk-around too.
        for (const r of results) {
          await db.InspectionResult.create({
            ...base, inspection_name: 'Walk-around (driver app)', section_name: r.section_name, inspection_item: r.item_name,
            condition: r.condition, fault_found: r.condition === 'FAILED', fault_description: r.condition === 'FAILED' ? r.notes : '',
            photo_url: r.photo_url || undefined, repair_required: r.condition === 'FAILED', notes: r.notes,
            inspector_name: `${name} (driver)`, inspection_date: now,
          });
        }
        if (failed.length) {
          const settings = (await db.MaintenanceSettings.list().catch(() => []))[0];
          if (settings?.auto_create_faults !== false) {
            for (const f of failed) {
              await db.Fault.create({
                ...base, title: f.item_name.slice(0, 80),
                description: (f.notes || 'Reported as a problem in the walk-around check.') + ' (walk-around, driver app)',
                source: 'inspection', inspection_id: inspection.id, severity: SEVERITY[f.critical] || 'medium',
                status: 'open', photo_url: f.photo_url || undefined, repair_required: true, reported_by: name,
              });
            }
          }
          await notify(base44, 'dispatch', companyId, {
            title: `Walk-around problem · ${sanitize(bus.name)}`,
            body: failed.map((f) => f.item_name).join(', ').slice(0, 200),
            data: { type: 'inspection', inspection_id: inspection.id },
          });
        }
        return Response.json({ ok: true, inspection: { id: inspection.id, status: inspection.status, problems: failed.length } });
      }

      case 'hours': {
        const since = Date.now() - 35 * 86400_000;
        const shifts = (await db.DriverShift.filter({ company_id: companyId }, '-started_at', 1000))
          .filter((x) => normEmail(x.driver_email) === email && Date.parse(x.started_at) > since)
          .map((x) => ({
            id: x.id, vehicle_name: sanitize(x.vehicle_name), started_at: x.started_at, ended_at: x.ended_at || null,
            minutes: x.ended_at ? (x.duration_minutes ?? Math.round((Date.parse(x.ended_at) - Date.parse(x.started_at)) / 60000)) : null,
            started_with: x.started_with || 'tablet',
          }));
        return Response.json({ shifts });
      }

      case 'documents': {
        const rows = (await db.DriverDocument.filter({ driver_id: driver.id }, '-updated_date', 50))
          .filter((d) => d.company_id === companyId);
        const documents = [];
        for (const d of rows) {
          let url = '';
          if (d.file_uri) {
            try { url = (await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: d.file_uri, expires_in: 120 }))?.signed_url || ''; }
            catch { url = ''; }
          }
          documents.push({ id: d.id, kind: d.kind || 'other', document_number: d.document_number || '', expiry_date: d.expiry_date || '', file_name: d.file_name || '', url });
        }
        return Response.json({ documents });
      }

      case 'register_push': {
        const token = body.token;
        if (typeof token !== 'string' || token.length < 20 || token.length > 4096) fail(400, 'Invalid notification token');
        // Only this person's own rows for this phone are touched.
        const mine = (await db.PushToken.filter({ token }, '-created_date', 10)).filter((row) => normEmail(row.email) === email);
        const data = { token, email: user.email, role: 'driver_phone', company_id: companyId, device_id: '' };
        if (mine[0]) await db.PushToken.update(mine[0].id, data);
        else await db.PushToken.create(data);
        return Response.json({ ok: true });
      }

      case 'unregister_push': {
        const token = body.token;
        if (typeof token !== 'string' || !token) fail(400, 'Invalid notification token');
        const rows = await db.PushToken.filter({ token, role: 'driver_phone' }, '-created_date', 5);
        for (const row of rows) if (normEmail(row.email) === email) await db.PushToken.delete(row.id).catch(() => {});
        return Response.json({ ok: true });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return Response.json({ error: status === 500 ? 'Something went wrong. Try again.' : error.message }, { status });
  }
}