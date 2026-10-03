import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
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


// Status from the TransitTrack Helper Android app on the tablet (battery, card
// reader, USB GPS...), relayed by the kiosk page. Shown in Admin → Kiosk Tablets.
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

export default async function(req) {
  try {
    const body = await req.json();
    const { device_id } = body;

    if (!device_id || typeof device_id !== 'string') {
      return Response.json({ error: 'Device ID required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    const device = await base44.asServiceRole.entities.KioskDevice.get(device_id);
    // `paired` must be checked here too, not just `status` — an admin
    // regenerating this device's pairing code (KioskTablets.jsx's
    // Regenerate/Reactivate actions) sets paired:false but leaves
    // status:'active'. Without this check the tablet keeps heartbeating
    // successfully and looking completely normal while every real action
    // (kioskCheckIn's resolveKioskDevice requires both) silently 401s.
    if (!(await authenticatedTablet(base44, device, body.device_token))) {
      return Response.json({ error: 'Device authentication required' }, { status: 401 });
    }

    // Update last_seen — kiosk is unauthenticated, use service role
    const helperHealth = cleanHelperHealth(body.helper_health);
    const appHealth = cleanAppHealth(body.app_health);
    await base44.asServiceRole.entities.KioskDevice.update(device_id, {
      last_seen: new Date().toISOString(),
      ...(helperHealth ? { helper_health: helperHealth } : {}),
      ...(appHealth ? { app_health: appHealth } : {}),
    });

    let company_logo_url = '';
    if (device.company_id) {
      try {
        const company = await base44.asServiceRole.entities.Company.get(device.company_id);
        company_logo_url = company?.logo_url || '';
      } catch { /* company may have been removed */ }
    }

    let context = null;
    if (device.kiosk_type === 'bus_boarding' && device.vehicle_id) {
      const vehicle = await base44.asServiceRole.entities.Vehicle.get(device.vehicle_id);
      if (!vehicle || vehicle.company_id !== device.company_id) return Response.json({ error: 'Vehicle assignment mismatch' }, { status: 403 });
      const [route, rows, ads] = await Promise.all([
        vehicle.route_id ? base44.asServiceRole.entities.Route.get(vehicle.route_id).catch(() => null) : null,
        tabletCheckIns(base44, device.company_id, device.vehicle_id),
        base44.asServiceRole.entities.Advertisement.filter({ active: true }, 'order', 500),
      ]);
      context = { vehicle: tabletVehicle(vehicle), route: tabletRoute(route, device.company_id),
        ...boardingStats(rows), ads: ads.map((a) => tabletFields(a, ['id', 'title', 'message', 'image_url', 'link', 'order', 'active'])) };
    }

    return Response.json({
      ok: true,
      context,
      device_id: device.id,
      label: device.label,
      company_id: device.company_id,
      company_name: device.company_name,
      company_logo_url,
      vehicle_id: device.vehicle_id,
      vehicle_name: device.vehicle_name,
      kiosk_type: device.kiosk_type,
      paired: device.paired,
      directory_sent_at: device.directory_sent_at || null,
      update_requested_at: device.update_requested_at || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}