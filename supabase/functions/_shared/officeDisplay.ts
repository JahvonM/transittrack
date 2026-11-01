// Office displays (Admin → Office displays): read-only operations screens for
// office monitors and TVs. What a display may receive is decided here, on the
// server, from its saved settings: only its companies and buses, and never
// passenger phone numbers, addresses, signatures, card or access credentials.
// Guest names only when an administrator turned them on; driver and client
// names can be turned off. Nothing a display may not show is sent to it.

export const LAYOUTS = ['fleet', 'cameras', 'dispatch', 'maintenance'];
export const ROTATABLE = ['fleet', 'dispatch', 'maintenance'];
export const THEMES = ['dark', 'light'];
export const TEXT_SIZES = ['normal', 'large', 'xlarge'];
export const DENSITIES = ['comfortable', 'compact'];
// A monitor on the admin's own computer: renewed by the desktop app every
// 20 minutes while an administrator is signed in there.
export const WINDOW_TTL_MS = 2 * 60 * 60_000;
// A paired screen: until revoked, re-paired, or 30 days after pairing.
export const PAIRED_TTL_MS = 30 * 24 * 60 * 60_000;
export const PAIRING_TTL_MS = 10 * 60_000;
export const MAX_CAMERAS = 4;
export const FEED_MS = 15_000;
// Grenada is UTC-4 all year (America/Grenada has no daylight saving).
const LOCAL_OFFSET_MS = -4 * 60 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

export async function sha256Hex(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}
// Same-length comparison that doesn't stop at the first difference.
export function sameHash(a: string, b: string) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// Six characters people can read off a TV across a room (no 0/O, 1/I/L).
export function pairingCode() {
  const max = 256 - (256 % CODE_ALPHABET.length);
  let out = '';
  while (out.length < 6) {
    const b = crypto.getRandomValues(new Uint8Array(1))[0];
    if (b < max) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  return out;
}
export const normalizeCode = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

const text = (v: unknown, max = 60) => String(v ?? '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max);
const ids = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x)))] : [];
const oneOf = (v: unknown, list: string[], fallback: string) => (typeof v === 'string' && list.includes(v) ? v : fallback);

// Settings from Admin → Office displays, checked against what exists.
export function cleanSettings(input: any, { companies = [], vehicles = [], creating = false }: any) {
  const name = text(input?.name);
  if (!name) fail(400, 'Give the display a name, such as Office TV');
  const companyIds = ids(input?.company_ids).filter((id) => companies.some((c: any) => c.id === id));
  if (!companyIds.length) fail(400, 'Choose at least one company to show');
  const vehicleIds = ids(input?.vehicle_ids).filter((id) => vehicles.some((v: any) => v.id === id && companyIds.includes(v.company_id)));
  const rotateLayouts = ids(input?.rotate_layouts).filter((l) => ROTATABLE.includes(l));
  const rotate = input?.rotate === true && rotateLayouts.length >= 2;
  const seconds = Math.round(Number(input?.rotate_seconds));
  const out: any = {
    name,
    company_ids: companyIds,
    vehicle_ids: vehicleIds,
    layout: oneOf(input?.layout, LAYOUTS, 'fleet'),
    rotate,
    rotate_layouts: rotateLayouts,
    rotate_seconds: Number.isFinite(seconds) ? Math.min(600, Math.max(20, seconds)) : 60,
    theme: oneOf(input?.theme, THEMES, 'dark'),
    text_size: oneOf(input?.text_size, TEXT_SIZES, 'large'),
    density: oneOf(input?.density, DENSITIES, 'comfortable'),
    show_driver_names: input?.show_driver_names !== false,
    show_client_names: input?.show_client_names !== false,
    show_guest_names: input?.show_guest_names === true,
    camera_device_ids: ids(input?.camera_device_ids).slice(0, MAX_CAMERAS),
  };
  if (creating) out.kind = oneOf(input?.kind, ['window', 'paired'], 'window');
  return out;
}

// For Admin → Office displays. Never the credential.
export function publicDisplay(d: any, now = Date.now()) {
  return {
    id: d.id, name: d.name, kind: d.kind, status: d.status || 'active',
    company_ids: d.company_ids || [], vehicle_ids: d.vehicle_ids || [], layout: d.layout || 'fleet',
    rotate: !!d.rotate, rotate_layouts: d.rotate_layouts || [], rotate_seconds: d.rotate_seconds || 60,
    theme: d.theme || 'dark', text_size: d.text_size || 'large', density: d.density || 'comfortable',
    show_driver_names: d.show_driver_names !== false, show_client_names: d.show_client_names !== false, show_guest_names: d.show_guest_names === true,
    blanked: !!d.blanked, camera_device_ids: d.camera_device_ids || [],
    connected: !!d.credential_hash && Date.parse(d.credential_expires_at) > now,
    access_until: d.credential_hash ? d.credential_expires_at || null : null,
    paired_at: d.paired_at || null, last_seen_at: d.last_seen_at || null,
  };
}

// What the display itself is told about its own settings.
export function displaySettings(d: any) {
  const p = publicDisplay(d);
  return {
    id: p.id, name: p.name, kind: p.kind, layout: p.layout, rotate: p.rotate, rotate_layouts: p.rotate_layouts, rotate_seconds: p.rotate_seconds,
    theme: p.theme, text_size: p.text_size, density: p.density, blanked: p.blanked,
    show_driver_names: p.show_driver_names, show_client_names: p.show_client_names, show_guest_names: p.show_guest_names,
  };
}

export function layoutsInUse(d: any) {
  const set = new Set([d.layout || 'fleet']);
  if (d.rotate) for (const l of d.rotate_layouts || []) if (ROTATABLE.includes(l)) set.add(l);
  return set;
}

// The display's companies, and its buses if it was limited to some.
export function inScope(d: any, companyId: unknown, vehicleId?: unknown) {
  if (!(d.company_ids || []).includes(companyId)) return false;
  const only = d.vehicle_ids || [];
  return !only.length || !vehicleId || only.includes(vehicleId);
}
const busOnly = (d: any, vehicleId: unknown) => { const only = d.vehicle_ids || []; return !only.length || only.includes(vehicleId); };

export function localDayStart(now = Date.now()) {
  const local = now + LOCAL_OFFSET_MS;
  return local - (local % 86_400_000) - LOCAL_OFFSET_MS;
}
const ms = (iso: unknown) => (typeof iso === 'string' ? Date.parse(iso) : NaN);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function feedVehicles(d: any, vehicles: any[]) {
  return vehicles.filter((v) => inScope(d, v.company_id) && busOnly(d, v.id)).map((v) => ({
    id: v.id, name: v.name || 'Bus', fleet_number: v.fleet_number || '', plate_number: v.plate_number || '', company_id: v.company_id,
    type: v.type || 'bus', status: v.status || 'offline', in_service: v.in_service !== false,
    current_lat: num(v.current_lat), current_lng: num(v.current_lng), heading: num(v.heading), speed: num(v.speed),
    last_location_update: v.last_location_update || null, tracking_active: !!v.tracking_active,
    driver_name: d.show_driver_names !== false ? v.driver_name || '' : '',
  })).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
}

// Tablets as connectivity only: when each last checked in, battery. Shaped
// like KioskDevice so the fleet workspace's own rules (src/lib/fleetWorkspace.js)
// read them the same way.
export function feedTablets(d: any, kiosks: any[]) {
  return kiosks.filter((k) => inScope(d, k.company_id) && k.vehicle_id && busOnly(d, k.vehicle_id) && k.paired && k.status === 'active' && !k.personal)
    .map((k) => ({
      id: k.id, vehicle_id: k.vehicle_id, kiosk_type: k.kiosk_type, label: text(k.label, 40), paired: true, status: 'active', last_seen: k.last_seen || null,
      helper_health: { battery: num(k.helper_health?.battery), charging: k.helper_health?.charging === true },
    }));
}

// The McSween kiosk app's direct viewing, on a driver tablet (the road-facing
// camera). Boarding tablets' QR cameras are never offered. Same rule as
// cameraTablets in src/lib/fleetWorkspace.js.
export const cameraCapable = (k: any) => !!k && k.kiosk_type === 'driver' && !k.personal && k.paired && k.status === 'active'
  && k.helper_health?.support_available === true && k.helper_health?.support_transport === 'webrtc';

// Recent boardings, for the on-board count the fleet workspace already shows
// (a ride with no exit stops counting after 6 hours); a person is an opaque
// key, never a name, card or code.
export const BOARDING_LOOKBACK_MS = 7 * 3600_000;
export async function feedBoardings(d: any, checkIns: any[], now = Date.now()) {
  const from = now - BOARDING_LOOKBACK_MS;
  const rows = checkIns.filter((r) => inScope(d, r.company_id) && r.vehicle_id && busOnly(d, r.vehicle_id) && ms(r.boarded_at || r.created_date) >= from);
  return Promise.all(rows.map(async (r) => ({
    vehicle_id: r.vehicle_id, status: r.status, at: r.boarded_at || r.created_date,
    person: (await sha256Hex(d.id + ':' + (r.person_key || r.card_tag || r.staff_name || r.id))).slice(0, 16),
  })));
}

export function feedShifts(d: any, shifts: any[]) {
  return shifts.filter((s) => !s.ended_at && inScope(d, s.company_id) && s.vehicle_id && busOnly(d, s.vehicle_id))
    .map((s) => ({ vehicle_id: s.vehicle_id, started_at: s.started_at || null, driver_name: d.show_driver_names !== false ? s.driver_name || '' : '' }));
}

const JOB_LABEL: Record<string, string> = { airport_pickup: 'Airport pickup', airport_dropoff: 'Airport drop-off', hotel_tour: 'Tour', staff_run: 'Staff run', transfer: 'Transfer' };

// Jobs for today, plus any still under way: what, when, which bus, where
// from and to, and how far along (pickup and drop-off confirmed).
export function feedJobs(d: any, trips: any[], now = Date.now()) {
  const from = localDayStart(now), to = from + 86_400_000;
  return trips.filter((t) => inScope(d, t.company_id) && busOnly(d, t.vehicle_id || null) && t.status !== 'cancelled'
    && (['on_the_way', 'arrived'].includes(t.status) || (ms(t.scheduled_time) >= from && ms(t.scheduled_time) < to)))
    .map((t) => ({
      id: t.id, kind: JOB_LABEL[t.job_type] || (t.route_name ? 'Route' : 'Trip'), route_name: t.job_type ? '' : text(t.route_name, 60), status: t.status || 'scheduled', scheduled_time: t.scheduled_time || null,
      started_at: t.started_at || null, arrived_at: t.arrived_at || null, completed_at: t.completed_at || null,
      vehicle_id: t.vehicle_id || '', vehicle_name: t.vehicle_name || '', driver_name: d.show_driver_names !== false ? t.driver_name || '' : '',
      pickup_name: t.pickup_name || '', dropoff_name: t.dropoff_name || '', guests: num(t.guests), flight_number: t.flight_number || '',
      pickup_confirmed: !!t.pickup_signed_at, dropoff_confirmed: !!t.dropoff_signed_at,
      client_name: d.show_client_names !== false ? t.client_name || '' : '',
      guest_name: d.show_guest_names === true ? t.passenger_name || '' : '',
      // A fact, not a forecast: its time has passed and it hasn't started.
      past_time_not_started: t.status === 'scheduled' && ms(t.scheduled_time) < now,
    }))
    .sort((a, b) => String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || '')));
}

const EXCEPTION_LABEL: Record<string, string> = { no_show: 'Not at pickup', got_on: 'Got on (recorded by driver)', got_off: 'Got off (recorded by driver)' };
export function feedExceptions(d: any, rows: any[], now = Date.now()) {
  const from = localDayStart(now);
  return rows.filter((r) => !r.undone_at && inScope(d, r.company_id) && busOnly(d, r.vehicle_id) && ms(r.at) >= from)
    .map((r) => ({ kind: r.kind, label: EXCEPTION_LABEL[r.kind] || 'Exception', vehicle_id: r.vehicle_id, vehicle_name: r.vehicle_name || '', at: r.at,
      person: d.show_guest_names === true ? r.person_name || '' : '' }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

const SEVERITY: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export function feedMaintenance(d: any, { faults = [], schedules = [], inspections = [], vehicles = [] }: any, now = Date.now()) {
  const scoped = (r: any) => inScope(d, r.company_id) && busOnly(d, r.vehicle_id);
  return {
    faults: faults.filter((f) => scoped(f) && ['open', 'in_progress'].includes(f.status || 'open'))
      .map((f) => ({ id: f.id, vehicle_id: f.vehicle_id, vehicle_name: f.vehicle_name || '', title: text(f.title, 120) || 'Fault', severity: f.severity || 'medium', status: f.status || 'open', repair_required: !!f.repair_required, reported_at: f.created_date || null }))
      .sort((a, b) => (SEVERITY[a.severity] ?? 9) - (SEVERITY[b.severity] ?? 9) || String(a.reported_at).localeCompare(String(b.reported_at))),
    due: schedules.filter((s) => scoped(s) && ['due', 'overdue'].includes(s.status))
      .map((s) => ({ id: s.id, vehicle_id: s.vehicle_id, vehicle_name: s.vehicle_name || '', service_type: text(s.service_type, 80) || 'Service', status: s.status, last_service_date: s.last_service_date || null }))
      .sort((a, b) => (a.status === 'overdue' ? 0 : 1) - (b.status === 'overdue' ? 0 : 1)),
    failed_inspections: inspections.filter((i) => scoped(i) && i.status === 'failed' && ms(i.date || i.created_date) >= now - 7 * 86_400_000)
      .map((i) => ({ id: i.id, vehicle_id: i.vehicle_id, vehicle_name: i.vehicle_name || '', date: i.date || i.created_date, needs_service: !!i.needs_service })),
    unavailable: feedVehicles(d, vehicles).filter((v) => !v.in_service).map((v) => ({ id: v.id, name: v.name })),
  };
}
