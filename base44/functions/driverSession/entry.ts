import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

async function approvedCompanies(base44, user, scope) {
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ user_id: user.id, active: true }, '-updated_date', 100);
  return rows.filter(r => r.scope === (scope || (user.role === 'company' ? 'manager' : 'passenger'))).map(r => r.company_id);
}
async function approvedStaffIds(base44, companyId) {
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ company_id: companyId, active: true, scope: 'passenger' }, '-updated_date', 5000);
  return new Set(rows.map(r => r.user_id));
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

import { secrets } from 'base44:runtime';

// --- Firebase Cloud Messaging (push) helpers — duplicated per-function, see notifyStaffPickup/entry.ts ---
function base64UrlEncode(bytes) {
  const arr = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
async function getFcmAccessToken(serviceAccount) {
  const { client_email, private_key, token_uri } = serviceAccount;
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claimsB64 = base64UrlEncode(encoder.encode(JSON.stringify({
    iss: client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: token_uri, exp: now + 3600, iat: now,
  })));
  const signingInput = `${headerB64}.${claimsB64}`;
  const cryptoKey = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signingInput));
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;
  const res = await fetch(token_uri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`FCM auth failed: ${data.error_description || data.error || res.status}`);
  return data.access_token;
}
async function sendPushToToken(serviceAccountJson, token, payload) {
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getFcmAccessToken(serviceAccount);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ message: { token, notification: { title: payload.title, body: payload.body }, data: payload.data || {}, webpush: { fcm_options: { link: '/' } } } }),
    });
    return res.ok;
  } catch { return false; }
}
async function sendPushToTokens(serviceAccountJson, tokens, payload) {
  await Promise.all(tokens.map((t) => sendPushToToken(serviceAccountJson, t, payload)));
}

// Chat channels each reach a different audience beyond the always-included
// admin: 'company' also reaches that company's own manager, 'mechanic' also
// reaches the maintenance team. 'staff' and 'dispatch' are admin-only targets
// (staff themselves are already looking at the thread live via subscribe).
async function pushTokensForChannel(base44, channel, companyId) {
  const queries = [base44.asServiceRole.entities.PushToken.filter({ role: 'admin' })];
  if (channel === 'company' && companyId) {
    queries.push(base44.asServiceRole.entities.PushToken.filter({ role: 'company', company_id: companyId }));
  }
  if (channel === 'mechanic') {
    queries.push(base44.asServiceRole.entities.PushToken.filter({ role: 'mechanic' }));
  }
  const results = await Promise.all(queries);
  return [...new Set(results.flat().map((t) => t.token))];
}

// When a bus leaves a stop, the next stop on its route is "one stop away":
// push to passengers of this company who saved that stop as their favourite
// and switched stop alerts on. Leaving each stop happens once per pass, so
// this naturally sends one alert per bus per stop.
async function notifyStopAhead(base44, route, departedName, vehicle, companyId) {
  const serviceAccountJson = secrets.get('FIREBASE_SERVICE_ACCOUNT');
  if (!serviceAccountJson) return;
  const idx = route.stops.findIndex((s) => s.name === departedName);
  const next = idx >= 0 ? route.stops[idx + 1] : null;
  if (!next?.name) return;
  const users = await base44.asServiceRole.entities.User.filter({ favorite_stop: next.name, stop_alerts: true });
  const approvedIds = await approvedStaffIds(base44, companyId);
  const emails = users.filter((u) => approvedIds.has(u.id) && u.email).map((u) => u.email);
  if (!emails.length) return;
  const tokenLists = await Promise.all(emails.map((email) => base44.asServiceRole.entities.PushToken.filter({ email })));
  const tokens = [...new Set(tokenLists.flat().map((t) => t.token))];
  if (!tokens.length) return;
  await sendPushToTokens(serviceAccountJson, tokens, {
    title: `${vehicle.name} is one stop away`,
    body: `It just left ${departedName}. Your stop, ${next.name}, is next.`,
    data: { type: 'stop_ahead', vehicle_id: vehicle.id, stop: next.name },
  });
}

const CHAT_CHANNELS = ['staff', 'company', 'dispatch', 'mechanic'];

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function resolveDriverDevice(base44, deviceId, token) {
  if (!deviceId || typeof deviceId !== 'string') return null;
  try {
    const device = await base44.asServiceRole.entities.KioskDevice.get(deviceId);
    if (!device || device.kiosk_type !== 'driver' || !(await authenticatedTablet(base44, device, token))) return null;
    return device;
  } catch { return null; }
}

async function loadVehicle(base44, vehicleId) {
  if (!vehicleId) return null;
  try { return await base44.asServiceRole.entities.Vehicle.get(vehicleId); }
  catch { return null; }
}

// "Skip today" and "running late" carry an expiry so they switch themselves
// off; a flag with no expiry (set before expiries existed) counts as expired.
const flagActive = (on, until) => !!on && !!until && new Date(until).getTime() > Date.now();

async function loadStaff(base44, companyId) {
  const approvedIds = await approvedStaffIds(base44, companyId);
  const [users, contacts] = await Promise.all([
    base44.asServiceRole.entities.User.list(),
    base44.asServiceRole.entities.Contact.filter({ type: 'staff' }, '-updated_date', 500),
  ]);
  const userByEmail = new Map(
    users.filter((u) => u.role === 'staff' && approvedIds.has(u.id))
      .map((u) => [(u.email || '').toLowerCase(), u])
  );
  const companyContacts = contacts.filter((c) => c.company_id === companyId);
  const contactEmails = new Set(companyContacts.map((c) => (c.email || '').toLowerCase()));
  const orphanUsers = [...userByEmail.values()].filter((u) => !contactEmails.has((u.email || '').toLowerCase()));
  const merged = [
    ...companyContacts.map((c) => {
      const u = userByEmail.get((c.email || '').toLowerCase()) || {};
      return {
        id: c.id, full_name: c.name || u.full_name, email: c.email || u.email, phone: c.phone || u.phone,
        home_lat: c.pickup_lat != null ? c.pickup_lat : u.home_lat,
        home_lng: c.pickup_lng != null ? c.pickup_lng : u.home_lng,
        pickup_name: c.pickup_name, dropoff_name: c.dropoff_name,
        skip_pickup_today: flagActive(u.skip_pickup_today, u.skip_pickup_until),
        late_snooze_active: flagActive(u.late_snooze_active, u.late_until),
      };
    }),
    ...orphanUsers.map((u) => ({
      id: u.id, full_name: u.full_name, email: u.email, phone: u.phone,
      home_lat: u.home_lat, home_lng: u.home_lng, pickup_name: undefined, dropoff_name: undefined,
      skip_pickup_today: flagActive(u.skip_pickup_today, u.skip_pickup_until),
      late_snooze_active: flagActive(u.late_snooze_active, u.late_until),
    })),
  ];
  return merged;
}

function sanitize(value) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim();
}

// When a queued offline action really happened; anything implausible
// (more than a minute ahead, or older than 3 days) falls back to now.
function occurredAt(value) {
  const t = value ? new Date(value).getTime() : NaN;
  const now = Date.now();
  if (!Number.isFinite(t) || t > now + 60_000 || t < now - 72 * 3600_000) return new Date(now);
  return new Date(Math.min(t, now));
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Driving-event thresholds. These are heuristics derived from GPS speed deltas
// between periodic pings (~8s apart) — not true accelerometer-based detection
// (which would need phone/tablet sensor data we don't have access to here).
const HARD_BRAKE_MS2 = 2.5; // average deceleration over the interval
const RAPID_ACCEL_MS2 = 2.5; // average acceleration over the interval
const MAX_GAP_SEC = 25; // ignore deltas across gaps this large (offline periods, teleports)
const ARRIVAL_RADIUS_M = 120; // "at a stop" radius for place alerts
const PING_LOG_INTERVAL_MS = 60000; // location-history resolution for the replay timeline

// Inspection templates sent to drivers for this tablet's company.
// Templates sent to this bus's driver app: right company, and either every
// bus or one of the buses picked for it.
function driverTemplates(templates, companyId, vehicleId) {
  return (templates || [])
    .filter((t) => (t.audience === 'driver' || t.audience === 'both') && (!t.company_id || t.company_id === companyId))
    .filter((t) => !Array.isArray(t.driver_vehicle_ids) || !t.driver_vehicle_ids.length || t.driver_vehicle_ids.includes(vehicleId))
    .map((t) => ({
      id: t.id, name: t.name, sections: t.sections || [],
      driver_trigger: t.driver_trigger || 'start_of_day', driver_days: t.driver_days || [],
      driver_times: Array.isArray(t.driver_times) ? t.driver_times : [],
      driver_from_time: t.driver_from_time || '', driver_required: t.driver_required !== false,
      driver_sent_at: t.driver_sent_at || null, xray_layout: t.xray_layout || '',
    }));
}

const SEVERITY = { Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical' };

// Status from the TransitTrack Helper Android app on the tablet (battery, card
// reader, USB GPS...), relayed by the driver page. Shown in Admin → Kiosk Tablets.
function cleanHelperHealth(h: unknown): Record<string, unknown> | null {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
  const o = h as Record<string, unknown>;
  const str = (v: unknown, n: number) =>
    typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').slice(0, n) : undefined;
  const out: Record<string, unknown> = { reported_at: new Date().toISOString() };
  const version = str(o.version, 16); if (version) out.version = version;
  if (typeof o.battery === 'number' && Number.isFinite(o.battery)) out.battery = Math.max(0, Math.min(100, Math.round(o.battery)));
  if (typeof o.charging === 'boolean') out.charging = o.charging;
  if (typeof o.parked === 'boolean') out.parked = o.parked;
  const reader = str(o.reader, 40); if (reader) out.reader = reader;
  const gps = str(o.gps, 40); if (gps) out.gps = gps;
  const hotspot = str(o.hotspot, 40); if (hotspot) out.hotspot = hotspot;
  const lastCard = str(o.last_card_at, 40); if (lastCard) out.last_card_at = lastCard;
  return out;
}

// What the TransitTrack app itself reports (build, uploads waiting, last GPS
// fix, card reader in use). Shown in Admin → Fleet health.
function cleanAppHealth(h: unknown): Record<string, unknown> | null {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
  const o = h as Record<string, unknown>;
  const str = (v: unknown, n: number) =>
    typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').slice(0, n) : undefined;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100000, Math.round(v))) : undefined);
  const date = (v: unknown) => { const s = str(v, 40); return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : undefined; };
  const out: Record<string, unknown> = { reported_at: new Date().toISOString() };
  const set = (k: string, v: unknown) => { if (v !== undefined) out[k] = v; };
  set('build', str(o.build, 24));
  if (typeof o.online === 'boolean') out.online = o.online;
  set('queued_gps', num(o.queued_gps));
  set('queued_checkins', num(o.queued_checkins));
  set('queued_jobs', num(o.queued_jobs));
  set('last_gps_fix', date(o.last_gps_fix));
  set('reader', str(o.reader, 24));
  set('saved_list_at', date(o.saved_list_at));
  set('saved_list_count', num(o.saved_list_count));
  return out;
}
const MAX_INSPECTION_PHOTOS = 25;
const MAX_PHOTO_B64 = 3_000_000;

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

async function pinHash(pin, salt) {
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
 const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 600000, hash: 'SHA-256' }, key, 256);
 return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2,'0')).join('');
}
async function setProtectedPin(base44, vehicle, pin) {
 const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('');
 const data = { vehicle_id: vehicle.id, company_id: vehicle.company_id, salt, pin_hash: pin ? await pinHash(pin, salt) : '', enabled: !!pin };
 const rows = await base44.asServiceRole.entities.DriverPinCredential.filter({ vehicle_id: vehicle.id }, '-updated_date', 1);
 if (rows[0]) await base44.asServiceRole.entities.DriverPinCredential.update(rows[0].id, data);
 else await base44.asServiceRole.entities.DriverPinCredential.create(data);
 await base44.asServiceRole.entities.Vehicle.update(vehicle.id, { driver_pin: '' });
}
async function verifyProtectedPin(base44, vehicle, pin) {
 if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return false;
 const rows = await base44.asServiceRole.entities.DriverPinCredential.filter({ vehicle_id: vehicle.id }, '-updated_date', 1);
 const row = rows[0];
 if (row) return row.enabled === true && row.company_id === vehicle.company_id && (await pinHash(pin, row.salt)) === row.pin_hash;
 // Development migration only: successful verification moves the old PIN to a protected hash.
 if (pin !== vehicle.driver_pin) return false;
 await setProtectedPin(base44, vehicle, pin);
 return true;
}

export default async function(req) {
  try {
    const body = await req.json();
    const { device_id, action } = body;

    const base44 = createClientFromRequest(req);
    const device = await resolveDriverDevice(base44, device_id, body.device_token);
    if (!device) return Response.json({ error: 'Invalid or unpaired driver device' }, { status: 401 });

    const companyId = device.company_id;
    const companyName = device.company_name;
    const vehicleId = device.vehicle_id;
    if (!vehicleId) return Response.json({ error: 'No vehicle assigned to this device' }, { status: 400 });

    if (!['heartbeat', 'verify_pin', 'register_push_token', 'sos'].includes(action) && !(await validGrant(base44, device, body.driver_grant, 'driver', vehicleId))) return Response.json({ error: 'Driver PIN verification required' }, { status: 401 });

    const helperHealth = cleanHelperHealth(body.helper_health);
    const appHealth = cleanAppHealth(body.app_health);
    await base44.asServiceRole.entities.KioskDevice.update(device_id, {
      last_seen: new Date().toISOString(),
      // Sent once per app start: how this tablet draws maps (for support).
      ...(typeof body.device_info === 'string' ? { device_info: sanitize(body.device_info).slice(0, 400) } : {}),
      ...(helperHealth ? { helper_health: helperHealth } : {}),
      ...(appHealth ? { app_health: appHealth } : {}),
    });

    switch (action) {
      case 'verify_pin': {
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle || vehicle.company_id !== companyId) return Response.json({ error: 'Vehicle assignment mismatch' }, { status: 403 });
        if (!(await reserveAttempt(base44, 'driver-pin:' + vehicleId, 5, 15 * 60_000))) return Response.json({ error: 'Too many PIN attempts. Try again in 15 minutes.' }, { status: 429 });
        if (!(await verifyProtectedPin(base44, vehicle, body.pin))) return Response.json({ error: 'Incorrect PIN or no PIN configured' }, { status: 403 });
        return Response.json({ ok: true, driver_grant: await issueGrant(base44, device, 'driver', vehicleId, 12 * 3600_000) });
      }
      case 'heartbeat': {
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        if (vehicle.company_id !== companyId) return Response.json({ error: 'Vehicle assignment mismatch' }, { status: 403 });
        const [staff, broadcasts, checkIns, groupMessages, vehicleTrips, openShifts, allTemplates, recentInspections] = await Promise.all([
          loadStaff(base44, companyId),
          base44.asServiceRole.entities.Broadcast.filter({}, '-created_date', 20),
          tabletCheckIns(base44, companyId, vehicleId),
          base44.asServiceRole.entities.GroupMessage.filter({ vehicle_id: vehicleId }, '-created_date', 200),
          base44.asServiceRole.entities.Trip.filter({ vehicle_id: vehicleId }, 'scheduled_time', 100).catch(() => []),
          base44.asServiceRole.entities.DriverShift.filter({ vehicle_id: vehicleId }, '-started_at', 3).catch(() => []),
          base44.asServiceRole.entities.InspectionTemplate.list().catch(() => []),
          base44.asServiceRole.entities.Inspection.filter({ vehicle_id: vehicleId }, '-created_date', 30).catch(() => []),
        ]);
        const trips = vehicleTrips.filter((t) => ['scheduled', 'on_the_way', 'arrived'].includes(t.status));
        const driverEmail = vehicle.driver_email || '';
        const relevantBroadcasts = broadcasts.filter((b) => {
          if (b.company_id && b.company_id !== companyId) return false;
          const targeted = b.driver_email && b.driver_email === driverEmail;
          const broadcast = !b.driver_email && b.type === 'info';
          return targeted || broadcast;
        });
        let route = null;
        if (vehicle.route_id) {
          try { route = await base44.asServiceRole.entities.Route.get(vehicle.route_id); }
          catch { /* route may be missing */ }
        }
        let emergencyContacts = { boss_phone: '', secretary_phone: '' };
        try { const company = await base44.asServiceRole.entities.Company.get(companyId); emergencyContacts = { boss_phone: company?.boss_phone || '', secretary_phone: company?.secretary_phone || '' }; } catch { /* optional contacts */ }
        return Response.json({
          vehicle: tabletVehicle(vehicle), driver_name: vehicle.driver_name || '', has_driver_pin: !!vehicle.driver_pin || !!(await base44.asServiceRole.entities.DriverPinCredential.filter({ vehicle_id: vehicleId }, '-updated_date', 1))[0]?.enabled,
          company_id: companyId, company_name: companyName, staff, route: tabletRoute(route, companyId), emergency_contacts: emergencyContacts, ...boardingStats(checkIns),
          broadcasts: relevantBroadcasts, check_ins: checkIns.slice(0, 20).filter((c) => c.status === 'boarded').map(tabletCheckIn),
          group_messages: [...groupMessages].reverse(), trips,
          open_shift: openShifts.find((s) => !s.ended_at) || null,
          inspection_templates: driverTemplates(allTemplates, companyId, vehicleId),
          recent_inspections: recentInspections.map((i) => ({
            id: i.id, template_id: i.template_id || null, template_name: i.template_name || null,
            status: i.status, created_date: i.created_date,
          })),
          update_requested_at: device.update_requested_at || null,
        });
      }

      case 'start_shift': {
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        const open = (await base44.asServiceRole.entities.DriverShift.filter({ vehicle_id: vehicleId }, '-started_at', 5))
          .filter((s) => !s.ended_at);
        if (open.length) return Response.json({ shift: open[0] });
        const shift = await base44.asServiceRole.entities.DriverShift.create({
          vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
          driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
          device_id, started_at: occurredAt(body.occurred_at).toISOString(),
        });
        return Response.json({ shift });
      }

      case 'end_shift': {
        const open = (await base44.asServiceRole.entities.DriverShift.filter({ vehicle_id: vehicleId }, '-started_at', 5))
          .filter((s) => !s.ended_at);
        if (!open.length) return Response.json({ shift: null });
        const endAt = occurredAt(body.occurred_at);
        const ended = [];
        for (const s of open) {
          const startMs = new Date(s.started_at).getTime();
          const endMs = Math.max(endAt.getTime(), startMs || 0);
          const minutes = Math.max(0, Math.round((endMs - startMs) / 60000));
          ended.push(await base44.asServiceRole.entities.DriverShift.update(s.id, {
            ended_at: new Date(endMs).toISOString(), duration_minutes: minutes,
            notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : s.notes,
          }));
        }
        return Response.json({ shift: ended[0] });
      }

      case 'start_tracking': {
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        await base44.asServiceRole.entities.Vehicle.update(vehicleId, { tracking_active: true });
        return Response.json({ ok: true });
      }

      case 'stop_tracking': {
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        if (vehicle.remote_tracking_lock)
          return Response.json({ error: 'Tracking locked by admin' }, { status: 403 });
        await base44.asServiceRole.entities.Vehicle.update(vehicleId, { tracking_active: false });
        return Response.json({ ok: true });
      }

      case 'update_location': {
        const { lat, lng, speed, status, trail, log_speeding } = body;
        if (typeof lat !== 'number' || typeof lng !== 'number')
          return Response.json({ error: 'lat and lng required' }, { status: 400 });
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });

        const now = new Date();
        const newSpeed = speed || 0;
        const prevSpeed = typeof vehicle.speed === 'number' ? vehicle.speed : null;
        const prevTime = vehicle.last_location_update ? new Date(vehicle.last_location_update).getTime() : null;
        const dtSec = prevTime ? (now.getTime() - prevTime) / 1000 : null;

        // Once a vehicle is in 'emergency' (SOS), the driver's own routine
        // location heartbeat must NOT silently clear it back to 'on_trip' —
        // that was the bug making the admin SOS alert vanish a few seconds
        // after firing. Emergency can only be cleared by an explicit admin
        // action (Vehicle.update from the dashboard), never by a heartbeat.
        const routineStatus = status || 'on_trip';
        const update = { current_lat: lat, current_lng: lng, speed: newSpeed, status: vehicle.status === 'emergency' ? 'emergency' : routineStatus, last_location_update: now.toISOString() };
        if (trail) update.trail = trail;

        // --- Driving-event detection: hard braking / rapid acceleration / possible crash ---
        // Heuristic only (GPS speed deltas between ~8s pings), not true accelerometer sensing.
        let drivingEvent = null;
        if (prevSpeed != null && dtSec != null && dtSec > 0.5 && dtSec <= MAX_GAP_SEC) {
          const deltaMs2 = (newSpeed - prevSpeed) / dtSec;
          const prevKmh = prevSpeed * 3.6;
          const newKmh = newSpeed * 3.6;
          // "Possible crash": was moving at a meaningful clip and is now essentially
          // stopped. NOTE: at this ~8s GPS ping rate we cannot reliably tell a real
          // collision from completely normal braking for a red light or stop sign—
          // any real impact happens in under a second, then the vehicle sits still
          // for the rest of the reporting window, so the *averaged* deceleration
          // looks the same either way. That averaging is exactly why this used to
          // auto-declare a vehicle-wide emergency (full-screen admin alert, WhatsApp
          // to the boss) on totally ordinary stops. It's still logged below as a
          // driving event + incident for review, but it no longer escalates to
          // 'emergency' on its own — only the driver's own SOS button (or admin
          // reviewing the incident) can do that now.
          if (prevKmh >= 40 && newKmh <= 5 && dtSec <= 15) {
            drivingEvent = 'crash';
          } else if (deltaMs2 <= -HARD_BRAKE_MS2) {
            drivingEvent = 'hard_brake';
          } else if (deltaMs2 >= RAPID_ACCEL_MS2) {
            drivingEvent = 'rapid_accel';
          }
        }
        // --- Place alerts: geofence arrival/departure at the vehicle's route stops ---
        if (vehicle.route_id) {
          let route = null;
          try { route = await base44.asServiceRole.entities.Route.get(vehicle.route_id); } catch { /* route may be missing */ }
          if (route?.stops?.length) {
            let nearest = null;
            let nearestDist = Infinity;
            route.stops.forEach((s) => {
              if (s.lat == null || s.lng == null) return;
              const d = haversineMeters(lat, lng, s.lat, s.lng);
              if (d < nearestDist) { nearestDist = d; nearest = s; }
            });
            const prevNearId = vehicle.near_stop_id || '';
            const nowNearId = nearest && nearestDist <= ARRIVAL_RADIUS_M ? (nearest.name || '') : '';
            if (nowNearId !== prevNearId) {
              update.near_stop_id = nowNearId;
              if (nowNearId) {
                await base44.asServiceRole.entities.Broadcast.create({
                  type: vehicle.type === 'taxi' ? 'taxi_arrived' : 'bus_arrived',
                  title: `${vehicle.name} arrived`, message: `${vehicle.name} has arrived at ${nowNearId}.`,
                  vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
                  driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
                }).catch(() => {});
              } else if (prevNearId) {
                await base44.asServiceRole.entities.Broadcast.create({
                  type: 'info', title: `${vehicle.name} departed`, message: `${vehicle.name} has left ${prevNearId}.`,
                  vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
                  driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
                }).catch(() => {});
                try { await notifyStopAhead(base44, route, prevNearId, vehicle, companyId); }
                catch { /* alerts are best-effort */ }
              }
            }
          }
        }

        await base44.asServiceRole.entities.Vehicle.update(vehicleId, update);

        // --- Location history, for the "replay this vehicle's day" timeline ---
        // Throttled to roughly once a minute so a day of history stays a manageable size.
        const lastPingAt = vehicle.last_ping_logged_at ? new Date(vehicle.last_ping_logged_at).getTime() : 0;
        if (now.getTime() - lastPingAt >= PING_LOG_INTERVAL_MS) {
          await base44.asServiceRole.entities.LocationPing.create({
            vehicle_id: vehicleId, company_id: companyId, lat, lng, speed: newSpeed, recorded_at: now.toISOString(),
          }).catch(() => {});
          await base44.asServiceRole.entities.Vehicle.update(vehicleId, { last_ping_logged_at: now.toISOString() }).catch(() => {});
        }

        if (log_speeding) {
          await base44.asServiceRole.entities.Incident.create({
            vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
            driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
            type: 'speeding', details: `Speed recorded at ${Math.round((speed || 0) * 3.6)} km/h`, occurred_at: now.toISOString(),
          });
        }

        if (drivingEvent) {
          await base44.asServiceRole.entities.DrivingEvent.create({
            vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
            driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
            type: drivingEvent, speed_before_kmh: Math.round((prevSpeed || 0) * 3.6), speed_after_kmh: Math.round(newSpeed * 3.6),
            lat, lng, occurred_at: now.toISOString(),
          }).catch(() => {});

          if (drivingEvent === 'crash') {
            await base44.asServiceRole.entities.Incident.create({
              vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
              driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
              type: 'other', details: `Possible hard stop detected (auto, unconfirmed) — sudden speed drop from ${Math.round((prevSpeed || 0) * 3.6)} km/h. Not auto-escalated to SOS; review and use the SOS/incident tools if this needs a real response.`, occurred_at: now.toISOString(),
            }).catch(() => {});
          }
        }

        return Response.json({ ok: true, driving_event: drivingEvent });
      }

      // GPS points the tablet saved while it had no connection. They go into
      // the location history at the time they were taken (thinned to about
      // one a minute, like live tracking), skipping times already stored, so
      // a retried upload can't duplicate. The bus's live position only moves
      // if these points are newer than the last one the server saw. Driving
      // events and stop alerts are not raised from old points.
      case 'upload_track': {
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        const nowMs = Date.now();
        const points = (Array.isArray(body.points) ? body.points : []).slice(0, 300)
          .map((p) => ({ t: new Date(p?.t).getTime(), lat: Number(p?.lat), lng: Number(p?.lng), speed: Number(p?.speed) }))
          .filter((p) => Number.isFinite(p.t) && p.t <= nowMs + 60_000 && p.t >= nowMs - 72 * 3600_000
            && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
          .sort((a, b) => a.t - b.t);
        if (!points.length) return Response.json({ ok: true, stored: 0 });

        const from = points[0].t - PING_LOG_INTERVAL_MS;
        const to = points[points.length - 1].t + PING_LOG_INTERVAL_MS;
        const pings = base44.asServiceRole.entities.LocationPing;
        const existing = (await pings.filter({ vehicle_id: vehicleId, recorded_at: { $gte: new Date(from).toISOString(), $lte: new Date(to).toISOString() } }, '-recorded_at', 1000)
          .catch(() => pings.filter({ vehicle_id: vehicleId }, '-recorded_at', 1000)).catch(() => []))
          .map((r) => new Date(r.recorded_at).getTime())
          .filter((t) => Number.isFinite(t) && t >= from && t <= to);
        const taken = [...existing];
        // Already have a point within a minute of this one (from live tracking
        // or an earlier upload of the same batch)? Then skip it.
        const near = (t) => taken.some((x) => Math.abs(x - t) < PING_LOG_INTERVAL_MS);
        const rows = [];
        let lastKept = -Infinity;
        for (const p of points) {
          if (p.t - lastKept < PING_LOG_INTERVAL_MS || near(p.t)) continue;
          rows.push({ vehicle_id: vehicleId, company_id: companyId, lat: p.lat, lng: p.lng, speed: Number.isFinite(p.speed) ? p.speed : 0, recorded_at: new Date(p.t).toISOString() });
          taken.push(p.t);
          lastKept = p.t;
        }
        if (rows.length) await base44.asServiceRole.entities.LocationPing.bulkCreate(rows);

        const newest = points[points.length - 1];
        const lastSeen = vehicle.last_location_update ? new Date(vehicle.last_location_update).getTime() : 0;
        if (newest.t > lastSeen) {
          await base44.asServiceRole.entities.Vehicle.update(vehicleId, {
            current_lat: newest.lat, current_lng: newest.lng, speed: Number.isFinite(newest.speed) ? newest.speed : 0,
            last_location_update: new Date(newest.t).toISOString(),
          }).catch(() => {});
        }
        return Response.json({ ok: true, stored: rows.length, received: points.length });
      }

      case 'sos': {
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        await base44.asServiceRole.entities.Vehicle.update(vehicleId, { status: 'emergency' });
        const incident = await base44.asServiceRole.entities.Incident.create({
          vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
          driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
          type: 'emergency', details: 'SOS triggered by driver via long-press.', occurred_at: new Date().toISOString(),
        });
        try {
          const serviceAccountJson = secrets.get('FIREBASE_SERVICE_ACCOUNT');
          if (serviceAccountJson) {
            const adminTokens = await base44.asServiceRole.entities.PushToken.filter({ role: 'admin' });
            if (adminTokens.length) {
              await sendPushToTokens(serviceAccountJson, adminTokens.map((t) => t.token), {
                title: '🚨 SOS — ' + vehicle.name,
                body: `${vehicle.driver_name || 'Driver'} triggered SOS. Open the admin dashboard now.`,
                data: { type: 'sos', vehicle_id: vehicleId },
              });
            }
          }
        } catch { /* push is best-effort — the in-app takeover still works */ }
        return Response.json({ incident });
      }

      case 'register_push_token': {
        const { token } = body;
        if (!token || typeof token !== 'string') return Response.json({ error: 'token required' }, { status: 400 });
        const existing = await base44.asServiceRole.entities.PushToken.filter({ token });
        if (!existing.length) {
          await base44.asServiceRole.entities.PushToken.create({ token, device_id: String(device_id), role: 'driver', company_id: companyId });
        }
        return Response.json({ ok: true });
      }

      case 'cancel_sos': {
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        if (vehicle.status === 'emergency') {
          await base44.asServiceRole.entities.Vehicle.update(vehicleId, { status: 'on_trip' });
          await base44.asServiceRole.entities.Incident.create({
            vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
            driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
            type: 'other', details: 'SOS cancelled by driver (false alarm).', occurred_at: new Date().toISOString(),
          }).catch(() => {});
        }
        return Response.json({ ok: true });
      }

      case 'submit_inspection': {
        const { checklist, odometer, fuel, status, service_notes } = body;
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        const passed = status !== 'failed';
        const inspection = await base44.asServiceRole.entities.Inspection.create({
          driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
          vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
          date: new Date().toISOString().slice(0, 10), status: passed ? 'passed' : 'failed',
          checklist: checklist || {}, odometer_reading: odometer ? Number(odometer) : undefined,
          fuel_level: Number(fuel) || 0, needs_service: !passed, service_notes: service_notes || '',
        });
        if (odometer) await base44.asServiceRole.entities.Vehicle.update(vehicleId, { current_odometer: Number(odometer) });
        // A failed inspection also raises a proper Fault for the mechanic
        // queue (richer than the old needs_service flag alone — severity,
        // status workflow, links back to this inspection) unless the
        // mechanic team has turned that off in the global MaintenanceSettings
        // singleton (this is fleet-wide, not per-company — only mechanics
        // control it).
        if (!passed) {
          try {
            const settingsList = await base44.asServiceRole.entities.MaintenanceSettings.list();
            const settings = settingsList[0];
            if (settings?.auto_create_faults !== false) {
              await base44.asServiceRole.entities.Fault.create({
                vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
                title: service_notes ? service_notes.slice(0, 80) : 'Failed pre-trip inspection',
                description: service_notes || 'Auto-created from a failed pre-trip inspection checklist.',
                source: 'inspection', inspection_id: inspection.id, severity: 'medium', status: 'open',
                reported_by: vehicle.driver_name || vehicle.driver_email || 'Driver',
              });
            }
          } catch { /* fault creation is best-effort — never blocks the inspection itself */ }
        }
        return Response.json({ inspection });
      }

      case 'submit_template_inspection': {
        const { template_id, results, odometer, fuel, trigger } = body;
        if (!template_id || !Array.isArray(results) || !results.length)
          return Response.json({ error: 'template_id and results required' }, { status: 400 });
        let template;
        try { template = await base44.asServiceRole.entities.InspectionTemplate.get(template_id); } catch { template = null; }
        if (!template || !['driver', 'both'].includes(template.audience) || (template.company_id && template.company_id !== companyId))
          return Response.json({ error: 'This inspection is not available on this tablet' }, { status: 403 });
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });

        // Photos arrive as base64 inside the submission (so an offline tablet
        // can queue the whole thing); upload each one and keep its URL.
        let photos = 0;
        const clean = [];
        for (const r of results.slice(0, 300)) {
          const condition = r?.condition === 'FAILED' ? 'FAILED' : 'GOOD';
          let photo_url = typeof r?.photo_url === 'string' && r.photo_url.startsWith('https://') ? r.photo_url : '';
          if (!photo_url && typeof r?.photo_data === 'string' && r.photo_data.length < MAX_PHOTO_B64 && photos < MAX_INSPECTION_PHOTOS) {
            try {
              const bytes = base64ToBytes(r.photo_data);
              const file = new File([bytes], `inspection-${Date.now()}-${photos}.jpg`, { type: 'image/jpeg' });
              const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
              photo_url = uploaded.file_url;
              photos += 1;
            } catch { /* keep the result even if its photo failed */ }
          }
          clean.push({
            section_name: sanitize(r?.section_name).slice(0, 120), item_name: sanitize(r?.item_name).slice(0, 200),
            zone: sanitize(r?.zone).slice(0, 40), critical: ['Low', 'Medium', 'High', 'Critical'].includes(r?.critical) ? r.critical : 'Medium',
            condition, notes: sanitize(r?.notes).slice(0, 1000), photo_url,
          });
        }
        const failed = clean.filter((r) => r.condition === 'FAILED');
        const passed = failed.length === 0;
        const now = new Date().toISOString();
        const inspection = await base44.asServiceRole.entities.Inspection.create({
          driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
          vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
          date: now.slice(0, 10), status: passed ? 'passed' : 'failed',
          template_id: template.id, template_name: template.name, trigger: sanitize(trigger).slice(0, 30),
          results: clean, checklist: {},
          odometer_reading: odometer ? Number(odometer) : undefined, fuel_level: fuel != null ? Number(fuel) || 0 : undefined,
          needs_service: !passed,
          service_notes: passed ? '' : 'Problems: ' + failed.map((f) => f.item_name + (f.notes ? ` (${f.notes})` : '')).join('; ').slice(0, 1500),
        });
        if (odometer && Number(odometer) > 0) await base44.asServiceRole.entities.Vehicle.update(vehicleId, { current_odometer: Number(odometer) }).catch(() => {});

        // Same per-item rows mechanics write, so Inspection History and the
        // overdue reminders count driver inspections too.
        const inspectorName = vehicle.driver_name || 'Driver';
        await base44.asServiceRole.entities.InspectionResult.bulkCreate(clean.map((r) => ({
          vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
          inspection_name: template.name, section_name: r.section_name, inspection_item: r.item_name,
          condition: r.condition, fault_found: r.condition === 'FAILED', fault_description: r.condition === 'FAILED' ? r.notes : '',
          photo_url: r.photo_url || undefined, repair_required: r.condition === 'FAILED', notes: r.notes,
          inspector_name: `${inspectorName} (driver)`, inspection_date: now,
        }))).catch(() => {});

        if (failed.length) {
          try {
            const settingsList = await base44.asServiceRole.entities.MaintenanceSettings.list();
            if (settingsList[0]?.auto_create_faults !== false) {
              await base44.asServiceRole.entities.Fault.bulkCreate(failed.map((f) => ({
                vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
                title: f.item_name.slice(0, 80),
                description: (f.notes || 'Reported as a problem in a driver inspection.') + ` — ${template.name}`,
                source: 'inspection', inspection_id: inspection.id, severity: SEVERITY[f.critical] || 'medium',
                status: 'open', photo_url: f.photo_url || undefined, repair_required: true,
                reported_by: inspectorName,
              })));
            }
          } catch { /* fault creation is best-effort — never blocks the inspection itself */ }
        }
        return Response.json({ inspection: { id: inspection.id, template_id: template.id, status: inspection.status, created_date: inspection.created_date } });
      }

      case 'report_incident': {
        const { type, details } = body;
        if (!details || typeof details !== 'string' || !details.trim())
          return Response.json({ error: 'details required' }, { status: 400 });
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        const allowedTypes = ['breakdown', 'accident', 'delay', 'other'];
        const incident = await base44.asServiceRole.entities.Incident.create({
          vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
          driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
          type: allowedTypes.includes(type) ? type : 'other', details: sanitize(details), occurred_at: new Date().toISOString(),
        });
        return Response.json({ incident });
      }

      case 'send_group_message': {
        const { text, channel } = body;
        if (!text || typeof text !== 'string' || !text.trim())
          return Response.json({ error: 'text required' }, { status: 400 });
        const ch = CHAT_CHANNELS.includes(channel) ? channel : 'staff';
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        const cleanText = sanitize(text);
        const message = await base44.asServiceRole.entities.GroupMessage.create({
          vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
          channel: ch, sender_role: 'driver', sender_name: vehicle.driver_name || 'Driver', text: cleanText,
        });
        try {
          const serviceAccountJson = secrets.get('FIREBASE_SERVICE_ACCOUNT');
          if (serviceAccountJson) {
            const tokens = await pushTokensForChannel(base44, ch, companyId);
            if (tokens.length) {
              await sendPushToTokens(serviceAccountJson, tokens, {
                title: `${vehicle.name} · ${vehicle.driver_name || 'Driver'}`,
                body: cleanText,
                data: { type: 'group_message', vehicle_id: vehicleId, channel: ch },
              });
            }
          }
        } catch { /* push is best-effort */ }
        return Response.json({ message });
      }

      case 'send_chat_media': {
        const { channel, message_type, data_base64, mime_type, filename } = body;
        const ch = CHAT_CHANNELS.includes(channel) ? channel : 'staff';
        if (!['image', 'audio'].includes(message_type))
          return Response.json({ error: 'message_type must be image or audio' }, { status: 400 });
        if (!data_base64 || typeof data_base64 !== 'string')
          return Response.json({ error: 'data_base64 required' }, { status: 400 });
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        let mediaUrl;
        try {
          const bytes = base64ToBytes(data_base64);
          const type = mime_type || (message_type === 'image' ? 'image/jpeg' : 'audio/webm');
          const name = filename || `${message_type}-${Date.now()}`;
          const file = new File([bytes], name, { type });
          const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          mediaUrl = uploaded.file_url;
        } catch (e) {
          return Response.json({ error: `Upload failed: ${e.message}` }, { status: 500 });
        }
        const message = await base44.asServiceRole.entities.GroupMessage.create({
          vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
          channel: ch, sender_role: 'driver', sender_name: vehicle.driver_name || 'Driver',
          text: '', message_type, media_url: mediaUrl,
        });
        try {
          const serviceAccountJson = secrets.get('FIREBASE_SERVICE_ACCOUNT');
          if (serviceAccountJson) {
            const tokens = await pushTokensForChannel(base44, ch, companyId);
            if (tokens.length) {
              await sendPushToTokens(serviceAccountJson, tokens, {
                title: `${vehicle.name} · ${vehicle.driver_name || 'Driver'}`,
                body: message_type === 'image' ? '📷 Photo' : '🎤 Voice note',
                data: { type: 'group_message', vehicle_id: vehicleId, channel: ch },
              });
            }
          }
        } catch { /* push is best-effort */ }
        return Response.json({ message });
      }

      case 'edit_group_message': {
        const { message_id, text } = body;
        if (!message_id || !text || typeof text !== 'string' || !text.trim())
          return Response.json({ error: 'message_id and text required' }, { status: 400 });
        const existing = await base44.asServiceRole.entities.GroupMessage.get(message_id).catch(() => null);
        if (!existing || existing.vehicle_id !== vehicleId || existing.sender_role !== 'driver')
          return Response.json({ error: 'Message not found' }, { status: 404 });
        const updated = await base44.asServiceRole.entities.GroupMessage.update(message_id, { text: sanitize(text), edited: true });
        return Response.json({ message: updated });
      }

      case 'delete_group_message': {
        const { message_id } = body;
        if (!message_id) return Response.json({ error: 'message_id required' }, { status: 400 });
        const existing = await base44.asServiceRole.entities.GroupMessage.get(message_id).catch(() => null);
        if (!existing || existing.vehicle_id !== vehicleId || existing.sender_role !== 'driver')
          return Response.json({ error: 'Message not found' }, { status: 404 });
        await base44.asServiceRole.entities.GroupMessage.delete(message_id);
        return Response.json({ ok: true });
      }

      case 'send_broadcast': {
        const { message, title } = body;
        if (!message || typeof message !== 'string') return Response.json({ error: 'message required' }, { status: 400 });
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        const broadcast = await base44.asServiceRole.entities.Broadcast.create({
          type: 'info', title: title || 'Reply', message,
          driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
          vehicle_name: vehicle.name || '', company_id: companyId, company_name: companyName, is_reply: true,
        });
        return Response.json({ broadcast });
      }

      case 'notify_pickup': {
        const { to_email } = body;
        const to = sanitize(to_email);
        if (!to) return Response.json({ error: 'Missing recipient' }, { status: 400 });
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        let recipient = null;
        try {
          const matches = await base44.asServiceRole.entities.User.filter({ email: to });
          recipient = Array.isArray(matches) ? matches[0] : matches;
        } catch { /* tolerate */ }
        if (!recipient || !(await approvedCompanies(base44, recipient, 'passenger')).includes(vehicle.company_id || companyId))
          return Response.json({ error: 'Recipient not in your company' }, { status: 403 });
        const subject = `Your bus is approaching — ${sanitize(vehicle.name)}`;
        const msg = `Hello,\n\n${sanitize(vehicle.name)}${sanitize(vehicle.driver_name) ? ` (driver ${sanitize(vehicle.driver_name)})` : ''} is near your pickup location${sanitize(vehicle.company_name) ? ` for ${sanitize(vehicle.company_name)}` : ''} and will arrive shortly. Please get ready to board.\n\n— TransitTrack`;
        await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body: msg });
        return Response.json({ ok: true });
      }

      case 'update_trip_status': {
        const { trip_id, status } = body;
        if (!trip_id) return Response.json({ error: 'trip_id required' }, { status: 400 });
        // Ownership check: the trip must belong to this device's company (and vehicle).
        let existing = null;
        try { existing = await base44.asServiceRole.entities.Trip.get(trip_id); }
        catch { /* trip may not exist */ }
        if (!existing) return Response.json({ error: 'Trip not found' }, { status: 404 });
        if (existing.company_id !== companyId || existing.vehicle_id !== vehicleId)
          return Response.json({ error: 'Trip does not belong to this device' }, { status: 403 });
        if (!['on_the_way', 'arrived', 'completed'].includes(status))
          return Response.json({ error: 'Invalid status' }, { status: 400 });
        const update = { status };
        if (status === 'on_the_way') update.started_at = new Date().toISOString();
        if (status === 'arrived') update.arrived_at = new Date().toISOString();
        if (status === 'completed') update.completed_at = new Date().toISOString();
        const trip = await base44.asServiceRole.entities.Trip.update(trip_id, update);
        if (status === 'on_the_way') await base44.asServiceRole.entities.Vehicle.update(vehicleId, { status: 'on_trip' });
        if (status === 'completed') await base44.asServiceRole.entities.Vehicle.update(vehicleId, { status: 'idle' });
        return Response.json({ trip });
      }

      case 'sign_trip': {
        // Pickup / drop-off signature captured on the tablet. Drivers have no
        // login, so the upload and trip update run here with the service role.
        const { trip_id, mode, data_base64, mime_type, signed_by } = body;
        if (!trip_id || !['pickup', 'dropoff'].includes(mode))
          return Response.json({ error: 'trip_id and mode required' }, { status: 400 });
        if (!data_base64 || typeof data_base64 !== 'string')
          return Response.json({ error: 'data_base64 required' }, { status: 400 });
        let existing = null;
        try { existing = await base44.asServiceRole.entities.Trip.get(trip_id); }
        catch { /* trip may not exist */ }
        if (!existing) return Response.json({ error: 'Trip not found' }, { status: 404 });
        if (existing.company_id !== companyId || existing.vehicle_id !== vehicleId)
          return Response.json({ error: 'Trip does not belong to this device' }, { status: 403 });
        let fileUrl;
        try {
          const bytes = base64ToBytes(data_base64);
          const file = new File([bytes], `signature-${mode}-${Date.now()}.png`, { type: mime_type || 'image/png' });
          const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          fileUrl = uploaded.file_url;
        } catch (e) {
          return Response.json({ error: `Upload failed: ${e.message}` }, { status: 500 });
        }
        const now = new Date().toISOString();
        const name = String(signed_by || '').slice(0, 120);
        const update = mode === 'pickup'
          ? { pickup_signature_url: fileUrl, pickup_signed_by: name, pickup_signed_at: now }
          : { dropoff_signature_url: fileUrl, dropoff_signed_by: name, dropoff_signed_at: now, status: 'completed', completed_at: now };
        const trip = await base44.asServiceRole.entities.Trip.update(trip_id, update);
        if (mode === 'dropoff') await base44.asServiceRole.entities.Vehicle.update(vehicleId, { status: 'idle' });
        return Response.json({ trip });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}