import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
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

const CHAT_CHANNELS = ['staff', 'company', 'dispatch', 'mechanic'];

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function resolveDriverDevice(base44, deviceId) {
  if (!deviceId || typeof deviceId !== 'string') return null;
  try {
    const device = await base44.asServiceRole.entities.KioskDevice.get(deviceId);
    if (!device || !device.paired || device.status !== 'active' || device.kiosk_type !== 'driver') return null;
    return device;
  } catch { return null; }
}

async function loadVehicle(base44, vehicleId) {
  if (!vehicleId) return null;
  try { return await base44.asServiceRole.entities.Vehicle.get(vehicleId); }
  catch { return null; }
}

async function loadStaff(base44, companyId) {
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
  const merged = [
    ...companyContacts.map((c) => {
      const u = userByEmail.get((c.email || '').toLowerCase()) || {};
      return {
        id: c.id, full_name: c.name || u.full_name, email: c.email || u.email, phone: c.phone || u.phone,
        home_lat: c.pickup_lat != null ? c.pickup_lat : u.home_lat,
        home_lng: c.pickup_lng != null ? c.pickup_lng : u.home_lng,
        pickup_name: c.pickup_name, dropoff_name: c.dropoff_name, nfc_card_tag: c.nfc_card_tag,
        skip_pickup_today: u.skip_pickup_today || false,
      };
    }),
    ...orphanUsers.map((u) => ({
      id: u.id, full_name: u.full_name, email: u.email, phone: u.phone,
      home_lat: u.home_lat, home_lng: u.home_lng, pickup_name: undefined, dropoff_name: undefined,
      nfc_card_tag: undefined, skip_pickup_today: u.skip_pickup_today || false,
    })),
  ];
  return merged;
}

function sanitize(value) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim();
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

export default async function(req) {
  try {
    const body = await req.json();
    const { device_id, action } = body;

    const base44 = createClientFromRequest(req);
    const device = await resolveDriverDevice(base44, device_id);
    if (!device) return Response.json({ error: 'Invalid or unpaired driver device' }, { status: 401 });

    const companyId = device.company_id;
    const companyName = device.company_name;
    const vehicleId = device.vehicle_id;
    if (!vehicleId) return Response.json({ error: 'No vehicle assigned to this device' }, { status: 400 });

    await base44.asServiceRole.entities.KioskDevice.update(device_id, { last_seen: new Date().toISOString() });

    switch (action) {
      case 'heartbeat': {
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        const [staff, broadcasts, checkIns, groupMessages] = await Promise.all([
          loadStaff(base44, companyId),
          base44.asServiceRole.entities.Broadcast.filter({}, '-created_date', 20),
          base44.asServiceRole.entities.StaffCheckIn.filter({ vehicle_id: vehicleId }, '-created_date', 20),
          base44.asServiceRole.entities.GroupMessage.filter({ vehicle_id: vehicleId }, '-created_date', 200),
        ]);
        const driverEmail = vehicle.driver_email || '';
        const relevantBroadcasts = broadcasts.filter((b) => {
          const targeted = b.driver_email && b.driver_email === driverEmail;
          const broadcast = !b.driver_email && b.type === 'info';
          return targeted || broadcast;
        });
        let route = null;
        if (vehicle.route_id) {
          try { route = await base44.asServiceRole.entities.Route.get(vehicle.route_id); }
          catch { /* route may be missing */ }
        }
        return Response.json({
          vehicle, driver_name: vehicle.driver_name || '', driver_pin: vehicle.driver_pin || '',
          company_id: companyId, company_name: companyName, staff, route,
          broadcasts: relevantBroadcasts, check_ins: checkIns.filter((c) => c.status === 'boarded'),
          group_messages: [...groupMessages].reverse(),
        });
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
        return Response.json({ inspection });
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
        const { text } = body;
        if (!text || typeof text !== 'string' || !text.trim())
          return Response.json({ error: 'text required' }, { status: 400 });
        const vehicle = await loadVehicle(base44, vehicleId);
        if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
        const cleanText = sanitize(text);
        const message = await base44.asServiceRole.entities.GroupMessage.create({
          vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
          sender_role: 'driver', sender_name: vehicle.driver_name || 'Driver', text: cleanText,
        });
        try {
          const serviceAccountJson = secrets.get('FIREBASE_SERVICE_ACCOUNT');
          if (serviceAccountJson) {
            const adminTokens = await base44.asServiceRole.entities.PushToken.filter({ role: 'admin' });
            if (adminTokens.length) {
              await sendPushToTokens(serviceAccountJson, adminTokens.map((t) => t.token), {
                title: `${vehicle.name} · ${vehicle.driver_name || 'Driver'}`,
                body: cleanText,
                data: { type: 'group_message', vehicle_id: vehicleId },
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
        if (!recipient || !recipient.company_id || recipient.company_id !== (vehicle.company_id || companyId))
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
        const update = { status };
        if (status === 'on_the_way') update.started_at = new Date().toISOString();
        if (status === 'arrived') update.arrived_at = new Date().toISOString();
        if (status === 'completed') update.completed_at = new Date().toISOString();
        const trip = await base44.asServiceRole.entities.Trip.update(trip_id, update);
        return Response.json({ trip });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}