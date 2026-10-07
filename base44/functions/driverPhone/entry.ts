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

function shiftSummary(s) {
  if (!s) return null;
  return {
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
          : 'This account is not set up for the driver app. Ask your administrator to add your email to your driver record.',
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
        const [route, shifts, broadcasts, company, workplaces] = await Promise.all([
          bus.route_id ? db.Route.get(bus.route_id).catch(() => null) : null,
          db.DriverShift.filter({ vehicle_id: bus.id }, '-started_at', 5).catch(() => []),
          db.Broadcast.filter({ company_id: companyId }, '-created_date', 30).catch(() => []),
          db.Company.get(companyId).catch(() => null),
          db.Workplace.filter({ company_id: companyId }, '-updated_date', 5).catch(() => []),
        ]);
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
          shift: shiftSummary(busShifts.find((s) => !s.ended_at)),
          last_shift: shiftSummary(busShifts.find((s) => s.ended_at)),
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
