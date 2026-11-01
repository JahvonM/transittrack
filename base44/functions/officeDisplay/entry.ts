import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { forwardToSupabase } from '../../shared/forwardToSupabase.ts';
import { reserveAttempt } from '../../shared/atomicOps.ts';
import { streamingConfig, supportIce, validateSupportSdp, supportNotice, publicSupport, supportBinding } from '../../shared/tabletStreaming.ts';
import { supportRequest } from '../../shared/tabletSupportPolicy.ts';
import {
  FEED_MS, MAX_CAMERAS, PAIRED_TTL_MS, PAIRING_TTL_MS, WINDOW_TTL_MS, BOARDING_LOOKBACK_MS,
  cameraCapable, cleanSettings, displaySettings, fail, feedBoardings, feedExceptions, feedJobs, feedMaintenance,
  feedShifts, feedTablets, feedVehicles, inScope, layoutsInUse, localDayStart, normalizeCode, pairingCode,
  publicDisplay, randomToken, sha256Hex,
} from '../../shared/officeDisplay.ts';

// Admin → Office displays, and the screens themselves (/display, /display/pair).
//
//   Administrators: list, save, delete, blank, revoke, window_open,
//     window_renew, window_close, window_close_all, pair_approve,
//     camera_start, camera_stop.
//   A display, with its own display credential (never an administrator's
//     sign-in): feed, camera_status, camera_viewer, camera_answer, camera_end.
//   Anyone (a new screen): pair_start, pair_poll. Rate limited.
//
// A display credential only ever reads that display's feed and watches camera
// views an administrator started for it. It is stored as a hash, ends when the
// administrator who issued it is no longer an administrator, and is cleared by
// close, revoke or delete. Rules for what a feed contains are in
// base44/shared/officeDisplay.ts.

const TOKEN = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_DISPLAYS = 20;
const ONLINE_MS = 2 * 60_000;
const SEEN_WRITE_MS = 45_000;
const ADMIN_ACTIONS = ['list', 'save', 'delete', 'blank', 'revoke', 'window_open', 'window_renew', 'window_close', 'window_close_all', 'pair_approve', 'camera_start', 'camera_stop'];
const DISPLAY_ACTIONS = ['feed', 'camera_status', 'camera_viewer', 'camera_answer', 'camera_end'];
const PUBLIC_ACTIONS = ['pair_start', 'pair_poll'];
const ENDED = ['ended', 'denied', 'failed', 'expired'];
const isEnded = (s: any) => !!s.ended_at || ENDED.includes(s.state);
const iso = (t: number) => new Date(t).toISOString();
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
const credentialHash = (token: string) => sha256Hex('office-display:' + token);
// Ends a screen's access with a reason the screen shows; the screen clears
// what it was showing.
const accessEnded = (message = 'This screen is no longer connected. Set it up again from Office displays.') =>
  Object.assign(new Error(message), { status: 401, code: 'access_ended' });

function clientAddress(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return (req.headers.get('cf-connecting-ip') || forwarded.split(',')[0] || 'unknown').trim().slice(0, 64);
}
const idOf = (v: unknown) => (typeof v === 'string' && ID.test(v) ? v : null);
const idList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(idOf).filter(Boolean) as string[])] : []);
const same = (a: string[] = [], b: string[] = []) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export default async function (req: Request) {
  const forwarded = await forwardToSupabase(req, 'officeDisplay');
  if (forwarded) return forwarded;
  try {
    if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
    if (Number(req.headers.get('Content-Length') || 0) > 80_000) return json({ error: 'Request too large' }, 413);
    const raw = await req.text();
    if (raw.length > 80_000) return json({ error: 'Request too large' }, 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request' }, 400); }
    const action = body?.action;
    if (![...ADMIN_ACTIONS, ...DISPLAY_ACTIONS, ...PUBLIC_ACTIONS].includes(action)) return json({ error: 'Invalid request' }, 400);
    const base44 = createClientFromRequest(req), db = base44.asServiceRole.entities;
    const now = Date.now();

    const audit = (actor: any, summary: string, recordId: string, entity = 'OfficeDisplay') => db.AuditLog.create({
      actor_role: actor?.role === 'admin' ? 'admin' : 'display', actor_email: actor?.email || '', actor_name: actor?.full_name || actor?.name || '',
      action: 'update', entity, record_id: recordId, page: '/admin/office-displays', summary: String(summary).slice(0, 300),
    }).catch(() => {});

    // Camera views, ended the same way Admin → Fleet ends its own
    // (tabletSupport): the tablet sees the session end on its next check.
    const finish = async (s: any, state: string, actor: any, why: string) => {
      if (isEnded(s)) return;
      await db.TabletSupportSession.update(s.id, { state, ended_at: iso(Date.now()), offer_sdp: '', answer_sdp: '', failure_code: null });
      await audit(actor, `Office display camera view ${state} (${why}) · session ${s.id}`, s.device_id, 'KioskDevice');
    };
    const stopCameras = async (d: any, actor: any, why: string) => {
      for (const c of d.camera_sessions || []) {
        const s = await db.TabletSupportSession.get(c.session_id).catch(() => null);
        if (s && s.display_id === d.id) await finish(s, 'ended', actor, why).catch(() => {});
      }
      if ((d.camera_sessions || []).length) await db.OfficeDisplay.update(d.id, { camera_sessions: [] });
      d.camera_sessions = [];
    };
    const clearCredential = async (d: any, extra: any = {}) => {
      await db.OfficeDisplay.update(d.id, { credential_hash: null, credential_expires_at: null, credential_issued_by: null, ...extra });
    };

    // ---------------------------------------------------------------- public
    if (action === 'pair_start') {
      const ip = await sha256Hex('display-pair-ip:' + clientAddress(req));
      if (!(await reserveAttempt(base44, 'display-pair-ip:' + ip, 10, 3600_000)) || !(await reserveAttempt(base44, 'display-pair-all', 200, 3600_000))) {
        return json({ error: 'Too many pairing codes from this network. Try again in an hour.' }, 429);
      }
      const code = pairingCode(), poll = randomToken();
      const expires = iso(now + PAIRING_TTL_MS);
      await db.OfficeDisplayPairing.create({ code_hash: await sha256Hex('display-code:' + code), poll_hash: await sha256Hex('display-poll:' + poll), expires_at: expires });
      // Tidy a few old codes; nothing depends on it.
      db.OfficeDisplayPairing.filter({ expires_at: { $lt: iso(now - 86_400_000) } }, 'expires_at', 20)
        .then((rows: any[]) => Promise.all(rows.map((r) => db.OfficeDisplayPairing.delete(r.id)))).catch(() => {});
      return json({ code, poll_secret: poll, expires_at: expires });
    }
    if (action === 'pair_poll') {
      if (!TOKEN.test(body.poll_secret || '')) return json({ error: 'This code has expired. Get a new one.', code: 'expired' }, 410);
      const pollHash = await sha256Hex('display-poll:' + body.poll_secret);
      const ip = await sha256Hex('display-poll-ip:' + clientAddress(req));
      if (!(await reserveAttempt(base44, 'display-poll-ip:' + ip, 600, PAIRING_TTL_MS)) || !(await reserveAttempt(base44, 'display-poll:' + pollHash, 200, PAIRING_TTL_MS))) {
        return json({ error: 'Checking too often. Wait a moment.' }, 429);
      }
      const [p] = await db.OfficeDisplayPairing.filter({ poll_hash: pollHash }, '-created_date', 1);
      if (!p || p.used_at) return json({ error: 'This code has already been used or has expired. Get a new one.', code: 'expired' }, 410);
      if (!p.approved_display_id) {
        if (!(Date.parse(p.expires_at) > now)) return json({ error: 'This code has expired. Get a new one.', code: 'expired' }, 410);
        return json({ status: 'waiting', expires_at: p.expires_at });
      }
      // Approved: hand over a credential once. Approval must have been in time
      // and the screen must collect it within a few minutes.
      if (!(Date.parse(p.approved_at) <= Date.parse(p.expires_at)) || now - Date.parse(p.approved_at) > 5 * 60_000) {
        return json({ error: 'This code has expired. Get a new one.', code: 'expired' }, 410);
      }
      const d = await db.OfficeDisplay.get(p.approved_display_id).catch(() => null);
      const approver = p.approved_by ? await db.User.get(p.approved_by).catch(() => null) : null;
      await db.OfficeDisplayPairing.update(p.id, { used_at: iso(now) });
      if (!d || d.kind !== 'paired' || d.status === 'revoked' || approver?.role !== 'admin') return json({ error: 'Pairing was cancelled. Get a new code.', code: 'expired' }, 410);
      const token = randomToken();
      // A newer token replaces an older one, so only one screen holds it.
      await db.OfficeDisplay.update(d.id, {
        credential_hash: await credentialHash(token), credential_expires_at: iso(now + PAIRED_TTL_MS), credential_issued_by: approver.id,
        paired_at: iso(now), last_seen_at: iso(now), camera_sessions: [],
      });
      await audit(approver, `Paired screen connected · ${d.name}`, d.id);
      return json({ status: 'paired', display_token: token, display: displaySettings(d), access_until: iso(now + PAIRED_TTL_MS) });
    }

    // --------------------------------------------------------------- display
    if (DISPLAY_ACTIONS.includes(action)) {
      if (!TOKEN.test(body.display_token || '')) throw accessEnded();
      const [d] = await db.OfficeDisplay.filter({ credential_hash: await credentialHash(body.display_token) }, '-updated_date', 1);
      if (!d) {
        const ip = await sha256Hex('display-bad:' + clientAddress(req));
        if (!(await reserveAttempt(base44, 'display-bad:' + ip, 60, 600_000))) return json({ error: 'Too many attempts. Wait a few minutes.' }, 429);
        throw accessEnded();
      }
      const issuer = d.credential_issued_by ? await db.User.get(d.credential_issued_by).catch(() => null) : null;
      if (d.status === 'revoked' || !(Date.parse(d.credential_expires_at) > now) || issuer?.role !== 'admin') {
        await stopCameras(d, null, 'display access ended').catch(() => {});
        await clearCredential(d).catch(() => {});
        throw accessEnded(d.kind === 'window' ? 'This display window was closed from the main app. Open it again from Office displays.' : undefined);
      }
      if (!(await reserveAttempt(base44, 'display-calls:' + d.id, 40, 60_000))) return json({ error: 'Updating too often. Wait a moment.' }, 429);
      const actor = { role: 'display', email: '', full_name: 'Office display: ' + d.name };

      // A display's camera view, checked again on every call: still its own,
      // in time, started by someone who is still an administrator, on a
      // tablet that is still active and still in this display's buses.
      const cameraCheck = async (sessionId: unknown) => {
        const id = idOf(sessionId);
        if (!id || !(d.camera_sessions || []).some((c: any) => c.session_id === id)) return { ended: true, s: null };
        const s = await db.TabletSupportSession.get(id).catch(() => null);
        if (!s || s.display_id !== d.id) return { ended: true, s: null };
        if (isEnded(s)) return { ended: true, s };
        if (!(Date.parse(s.expires_at) > Date.now())) { await finish(s, 'expired', actor, '10 minutes'); return { ended: true, s: { ...s, state: 'expired', ended_at: iso(Date.now()) } }; }
        const config = streamingConfig();
        const dev = await db.KioskDevice.get(s.device_id).catch(() => null);
        const requester = await db.User.get(s.requested_by).catch(() => null);
        if (!config || s.transport !== 'webrtc' || requester?.role !== 'admin' || !cameraCapable(dev) || !supportBinding(s, dev)
          || d.blanked || d.layout !== 'cameras' || !inScope(d, dev.company_id) || ((d.vehicle_ids || []).length && !(d.vehicle_ids || []).includes(dev.vehicle_id))) {
          await finish(s, 'ended', actor, 'authorization changed');
          return { ended: true, s: { ...s, state: 'ended', ended_at: iso(Date.now()) } };
        }
        return { ended: false, s, config };
      };
      const cameraView = (s: any, deviceId: string) => ({
        session_id: s?.id || null, device_id: deviceId, state: s ? publicSupport(s).state : 'ended', expires_at: s?.expires_at || null,
        offer_ready: !!s?.offer_sdp && !isEnded(s), answered: !!s?.answer_sdp,
      });

      if (action === 'feed') {
        if (now - (Date.parse(d.last_seen_at) || 0) > SEEN_WRITE_MS) await db.OfficeDisplay.update(d.id, { last_seen_at: iso(now) }).catch(() => {});
        const head = { display: displaySettings(d), access_until: d.credential_expires_at, generated_at: iso(now), next_feed_ms: FEED_MS };
        if (d.blanked) {
          if ((d.camera_sessions || []).length) await stopCameras(d, actor, 'screen blanked');
          return json({ ...head, blanked: true });
        }
        if (d.layout !== 'cameras' && (d.camera_sessions || []).length) await stopCameras(d, actor, 'layout changed');
        const use = layoutsInUse(d);
        const needs = (...l: string[]) => l.some((x) => use.has(x));
        const companyIds = d.company_ids || [];
        const inCompanies = { company_id: { $in: companyIds } };
        const unavailable: string[] = [];
        // One source failing marks that part unavailable; the rest still shows.
        const source = async (name: string, wanted: boolean, run: () => Promise<any[]>) => {
          if (!wanted) return [];
          try { const rows = await run(); return Array.isArray(rows) ? rows : []; } catch { unavailable.push(name); return []; }
        };
        const from = localDayStart(now);
        const [companies, vehicles, kiosks, checkIns, shifts, todays, underWay, exceptions, faults, schedules, inspections] = await Promise.all([
          Promise.all(companyIds.map((id: string) => db.Company.get(id).catch(() => null))),
          source('vehicles', true, () => db.Vehicle.filter(inCompanies, 'name', 200)),
          source('tablets', needs('fleet', 'cameras'), () => db.KioskDevice.filter({ ...inCompanies, status: 'active' }, '-last_seen', 300)),
          source('boardings', needs('fleet'), () => db.StaffCheckIn.filter({ ...inCompanies, created_date: { $gte: iso(now - BOARDING_LOOKBACK_MS) } }, '-created_date', 2000)),
          source('shifts', needs('fleet', 'dispatch'), () => db.DriverShift.filter(inCompanies, '-started_at', 150)),
          source('jobs', needs('fleet', 'dispatch'), () => db.Trip.filter({ ...inCompanies, scheduled_time: { $gte: iso(from), $lt: iso(from + 86_400_000) } }, 'scheduled_time', 300)),
          source('jobs', needs('fleet', 'dispatch'), () => db.Trip.filter({ ...inCompanies, status: { $in: ['on_the_way', 'arrived'] } }, '-scheduled_time', 100)),
          source('exceptions', needs('dispatch'), () => db.RideException.filter({ ...inCompanies, at: { $gte: iso(from) } }, '-at', 100)),
          source('faults', needs('maintenance'), () => db.Fault.filter({ ...inCompanies, status: { $in: ['open', 'in_progress'] } }, '-created_date', 200)),
          source('maintenance', needs('maintenance'), () => db.MaintenanceSchedule.filter({ ...inCompanies, status: { $in: ['due', 'overdue'] } }, '-updated_date', 200)),
          source('inspections', needs('maintenance'), () => db.Inspection.filter({ ...inCompanies, status: 'failed' }, '-date', 100)),
        ]);
        const trips = [...new Map([...todays, ...underWay].map((t: any) => [t.id, t])).values()];
        const out: any = {
          ...head, blanked: false, unavailable: [...new Set(unavailable)],
          companies: companies.filter(Boolean).map((c: any) => ({ id: c.id, name: c.name || '', logo_url: /^https:\/\//.test(c.logo_url || '') ? c.logo_url : '' })),
          vehicles: feedVehicles(d, vehicles),
        };
        if (needs('fleet', 'cameras')) out.tablets = feedTablets(d, kiosks);
        if (needs('fleet')) out.boardings = await feedBoardings(d, checkIns, now);
        if (needs('fleet', 'dispatch')) { out.shifts = feedShifts(d, shifts); out.jobs = feedJobs(d, trips, now); }
        if (needs('dispatch')) out.exceptions = feedExceptions(d, exceptions, now);
        if (needs('maintenance')) out.maintenance = feedMaintenance(d, { faults, schedules, inspections, vehicles }, now);
        if (d.layout === 'cameras') {
          const views = [];
          for (const c of d.camera_sessions || []) { const r = await cameraCheck(c.session_id); views.push(cameraView(r.s, c.device_id)); }
          out.cameras = views;
          out.camera_choices = (d.camera_device_ids || []).length;
        }
        return json(out);
      }
      if (action === 'camera_status') {
        const views = [];
        for (const c of d.camera_sessions || []) { const r = await cameraCheck(c.session_id); views.push(cameraView(r.s, c.device_id)); }
        return json({ cameras: views });
      }
      if (action === 'camera_end') {
        const ids = body.session_id ? [idOf(body.session_id)] : (d.camera_sessions || []).map((c: any) => c.session_id);
        for (const id of ids) {
          if (!id || !(d.camera_sessions || []).some((c: any) => c.session_id === id)) continue;
          const s = await db.TabletSupportSession.get(id).catch(() => null);
          if (s && s.display_id === d.id) await finish(s, 'ended', actor, body.reason === 'closed' ? 'display closed' : 'stopped on the display');
        }
        return json({ ok: true });
      }
      const r: any = await cameraCheck(body.session_id);
      if (r.ended) return json({ error: 'Viewing session ended', code: 'ended' }, 410);
      const s = r.s;
      if (action === 'camera_viewer') {
        // One connection per session: a reload or reconnect never picks a
        // camera view back up. An administrator starts a new one.
        if (s.answer_sdp) {
          await finish(s, 'ended', actor, 'display reconnected');
          return json({ error: 'Viewing session ended', code: 'ended' }, 410);
        }
        if (!s.offer_sdp || !['connecting', 'active'].includes(s.state)) return json({ error: 'Waiting for the tablet', code: 'waiting' }, 409);
        await audit(actor, `Office display camera viewer authorized · ${d.name} · session ${s.id}`, s.device_id, 'KioskDevice');
        return json({ id: s.id, sdp: s.offer_sdp, ...await supportIce(r.config, s, 'display') });
      }
      if (action === 'camera_answer') {
        if (!s.offer_sdp || s.state !== 'connecting') return json({ error: 'Waiting for the tablet', code: 'waiting' }, 409);
        const sdp = validateSupportSdp(body.sdp, 'answer');
        if (s.answer_sdp && s.answer_sdp !== sdp) return json({ error: 'Viewing session ended', code: 'ended' }, 410);
        if (!s.answer_sdp) { await audit(actor, `Office display camera answer · ${d.name} · session ${s.id}`, s.device_id, 'KioskDevice'); await db.TabletSupportSession.update(s.id, { answer_sdp: sdp }); }
        return json({ ok: true });
      }
      return json({ error: 'Invalid request' }, 400);
    }

    // ---------------------------------------------------------- administrator
    const admin = await base44.auth.me().catch(() => null);
    if (!admin?.id) return json({ error: 'Sign in required' }, 401);
    if (admin.role !== 'admin') return json({ error: 'Administrators only' }, 403);
    if (!(await reserveAttempt(base44, 'display-admin:' + admin.id, 120, 60_000))) return json({ error: 'Too many changes at once. Wait a moment.' }, 429);
    const load = async (id: unknown) => {
      const key = idOf(id);
      const d = key ? await db.OfficeDisplay.get(key).catch(() => null) : null;
      if (!d) fail(404, 'That display was not found');
      return d;
    };
    const view = async (d: any) => {
      const cams = [];
      for (const c of d.camera_sessions || []) {
        const s = await db.TabletSupportSession.get(c.session_id).catch(() => null);
        const expired = s && !isEnded(s) && !(Date.parse(s.expires_at) > now);
        cams.push({ session_id: c.session_id, device_id: c.device_id, state: !s ? 'ended' : expired ? 'expired' : publicSupport(s).state, expires_at: s?.expires_at || null });
      }
      const p = publicDisplay(d, now);
      return { ...p, online: p.connected && now - (Date.parse(d.last_seen_at) || 0) <= ONLINE_MS, cameras: cams };
    };

    if (action === 'list') {
      const [displays, companies] = await Promise.all([db.OfficeDisplay.list('name', MAX_DISPLAYS + 5), db.Company.list('name', 500)]);
      const companyIds = companies.map((c: any) => c.id);
      const [vehicles, kiosks] = await Promise.all([
        companyIds.length ? db.Vehicle.filter({ company_id: { $in: companyIds } }, 'name', 500) : [],
        companyIds.length ? db.KioskDevice.filter({ company_id: { $in: companyIds }, kiosk_type: 'driver', status: 'active' }, '-last_seen', 300) : [],
      ]);
      const vehicleName = new Map(vehicles.map((v: any) => [v.id, v.name || 'Bus']));
      return json({
        displays: await Promise.all(displays.map(view)),
        companies: companies.map((c: any) => ({ id: c.id, name: c.name || 'Company' })),
        vehicles: vehicles.map((v: any) => ({ id: v.id, name: v.name || 'Bus', plate_number: v.plate_number || '', company_id: v.company_id })),
        cameras: kiosks.filter(cameraCapable).filter((k: any) => k.vehicle_id).map((k: any) => ({ id: k.id, vehicle_id: k.vehicle_id, vehicle_name: vehicleName.get(k.vehicle_id) || k.vehicle_name || 'Bus', label: k.label || 'Driver tablet', company_id: k.company_id })),
        streaming: !!streamingConfig(),
        limits: { window_ttl_ms: WINDOW_TTL_MS, paired_ttl_ms: PAIRED_TTL_MS, camera_ms: 10 * 60_000, max_cameras: MAX_CAMERAS, max_displays: MAX_DISPLAYS },
      });
    }

    if (action === 'save') {
      const existing = body.display_id ? await load(body.display_id) : null;
      if (!existing && (await db.OfficeDisplay.list('-created_date', MAX_DISPLAYS + 1)).length >= MAX_DISPLAYS) fail(409, `Up to ${MAX_DISPLAYS} displays`);
      const companies = await db.Company.list('name', 500);
      const wantedCompanies = idList(body.settings?.company_ids);
      const vehicles = wantedCompanies.length ? await db.Vehicle.filter({ company_id: { $in: wantedCompanies } }, 'name', 500) : [];
      const clean: any = cleanSettings(body.settings, { companies, vehicles, creating: !existing });
      // Cameras chosen for the Cameras + map layout: driver tablets in scope.
      if (clean.camera_device_ids.length) {
        const kiosks = await db.KioskDevice.filter({ company_id: { $in: clean.company_ids }, kiosk_type: 'driver' }, '-last_seen', 300);
        clean.camera_device_ids = clean.camera_device_ids.filter((id: string) => {
          const k = kiosks.find((x: any) => x.id === id);
          return k && k.vehicle_id && (!clean.vehicle_ids.length || clean.vehicle_ids.includes(k.vehicle_id));
        });
      }
      if (existing) {
        // Changing what a screen may see ends its camera views; an
        // administrator starts them again on purpose.
        const scopeChanged = existing.layout !== clean.layout || !same(existing.company_ids, clean.company_ids) || !same(existing.vehicle_ids, clean.vehicle_ids) || !same(existing.camera_device_ids, clean.camera_device_ids);
        if (scopeChanged && (existing.camera_sessions || []).length) await stopCameras(existing, admin, 'display settings changed');
        const saved = await db.OfficeDisplay.update(existing.id, clean);
        await audit(admin, `Office display changed · ${clean.name}`, existing.id);
        return json({ display: await view({ ...existing, ...clean, ...(saved || {}), camera_sessions: existing.camera_sessions }) });
      }
      const created = await db.OfficeDisplay.create({ ...clean, status: 'active', blanked: false, camera_sessions: [] });
      await audit(admin, `Office display added · ${clean.name} (${clean.kind === 'window' ? 'monitor on this computer' : 'paired screen'})`, created.id);
      return json({ display: await view(created) });
    }

    if (action === 'window_close_all') {
      // Signing out of the desktop app: the display windows it opened lose
      // access now rather than when their two hours run out.
      const open = await db.OfficeDisplay.filter({ kind: 'window', credential_issued_by: admin.id }, 'name', MAX_DISPLAYS + 5);
      for (const w of open) { await stopCameras(w, admin, 'signed out'); await clearCredential(w); }
      if (open.length) await audit(admin, `Office display windows closed on sign-out (${open.length})`, open[0].id);
      return json({ ok: true, closed: open.length });
    }
    const d = await load(body.display_id);
    if (action === 'delete') {
      await stopCameras(d, admin, 'display deleted');
      await db.OfficeDisplay.delete(d.id);
      await audit(admin, `Office display deleted · ${d.name}`, d.id);
      return json({ ok: true });
    }
    if (action === 'blank') {
      const blanked = body.blanked === true;
      if (blanked) await stopCameras(d, admin, 'screen blanked');
      await db.OfficeDisplay.update(d.id, { blanked });
      await audit(admin, `Office display ${blanked ? 'blanked' : 'shown again'} · ${d.name}`, d.id);
      return json({ display: await view({ ...d, blanked }) });
    }
    if (action === 'revoke') {
      await stopCameras(d, admin, 'access revoked');
      await clearCredential(d, { status: 'revoked' });
      await audit(admin, `Office display access revoked · ${d.name}`, d.id);
      return json({ display: await view({ ...d, status: 'revoked', credential_hash: null, credential_expires_at: null }) });
    }
    if (action === 'window_open') {
      if (d.kind !== 'window') fail(409, 'Pair this screen with a code instead');
      await stopCameras(d, admin, 'display window reopened');
      const token = randomToken(), until = iso(now + WINDOW_TTL_MS);
      await db.OfficeDisplay.update(d.id, { status: 'active', credential_hash: await credentialHash(token), credential_expires_at: until, credential_issued_by: admin.id, last_seen_at: null });
      await audit(admin, `Office display window opened · ${d.name}`, d.id);
      // Returned once, to the desktop app, which keeps it in memory for the
      // display window. Never stored or shown in plain text.
      return json({ display_token: token, access_until: until, display: displaySettings(d) });
    }
    if (action === 'window_renew') {
      if (d.kind !== 'window' || !d.credential_hash || d.credential_issued_by !== admin.id || !(Date.parse(d.credential_expires_at) > now)) {
        return json({ error: 'Open the display again', code: 'reopen' }, 409);
      }
      const until = iso(now + WINDOW_TTL_MS);
      await db.OfficeDisplay.update(d.id, { credential_expires_at: until });
      return json({ ok: true, access_until: until });
    }
    if (action === 'window_close') {
      await stopCameras(d, admin, 'display window closed');
      if (d.kind === 'window') await clearCredential(d);
      await audit(admin, `Office display window closed · ${d.name}`, d.id);
      return json({ ok: true });
    }
    if (action === 'pair_approve') {
      if (d.kind !== 'paired') fail(409, 'This display opens on a monitor connected to this computer');
      if (!(await reserveAttempt(base44, 'display-approve:' + admin.id, 20, 600_000))) fail(429, 'Too many codes tried. Wait 10 minutes.');
      const code = normalizeCode(body.code);
      if (code.length !== 6) fail(400, 'Enter the 6-character code shown on the screen');
      const rows = await db.OfficeDisplayPairing.filter({ code_hash: await sha256Hex('display-code:' + code) }, '-created_date', 5);
      const open = rows.filter((p: any) => !p.used_at && !p.approved_display_id && Date.parse(p.expires_at) > now);
      if (open.length !== 1) fail(404, "That code isn't valid or has expired. Check the code on the screen, or refresh it there.");
      await stopCameras(d, admin, 'screen paired again');
      // A new pairing replaces the old screen's access.
      await clearCredential(d, { status: 'active' });
      await db.OfficeDisplayPairing.update(open[0].id, { approved_display_id: d.id, approved_by: admin.id, approved_at: iso(now) });
      await audit(admin, `Paired screen approved · ${d.name}`, d.id);
      return json({ ok: true, display: await view({ ...d, status: 'active', credential_hash: null }) });
    }
    if (action === 'camera_start') {
      if (d.layout !== 'cameras') fail(409, 'Switch this display to Cameras + map first');
      if (d.blanked) fail(409, 'Show the screen again first');
      if (d.status === 'revoked' || !d.credential_hash || !(Date.parse(d.credential_expires_at) > now)) fail(409, 'Open or pair this display first');
      if (!streamingConfig()) fail(503, 'Direct camera viewing is not enabled yet');
      const wanted = (idList(body.device_ids).length ? idList(body.device_ids) : d.camera_device_ids || []).filter((id: string) => (d.camera_device_ids || []).includes(id)).slice(0, MAX_CAMERAS);
      if (!wanted.length) fail(400, 'Choose the cameras for this display first');
      await stopCameras(d, admin, 'camera views restarted');
      const sessions: any[] = [], results: any[] = [];
      for (const id of wanted) {
        const dev = await db.KioskDevice.get(id).catch(() => null);
        try {
          if (!cameraCapable(dev)) fail(409, 'This tablet needs the direct-viewing kiosk update');
          if (!inScope(d, dev.company_id) || ((d.vehicle_ids || []).length && !(d.vehicle_ids || []).includes(dev.vehicle_id))) fail(403, 'Not one of this display\'s buses');
          if (supportNotice(dev)) {
            const prior = await db.TabletSupportSession.get(dev.support_request.id).catch(() => null);
            if (prior && !isEnded(prior) && Date.parse(prior.expires_at) > now) fail(409, 'Someone is already viewing this camera');
          }
          const built = supportRequest(admin, dev, 'camera_back', now);
          const s = await db.TabletSupportSession.create({
            ...built, transport: 'webrtc', requested_name: String(admin.full_name || 'Administrator').slice(0, 80),
            company_id: dev.company_id, vehicle_id: dev.vehicle_id || '', kiosk_type: dev.kiosk_type, display_id: d.id,
          });
          await db.KioskDevice.update(dev.id, { support_request: { id: s.id, expires_at: s.expires_at } });
          await audit(admin, `Office display camera view requested · ${d.name} · back camera · session ${s.id}`, dev.id, 'KioskDevice');
          sessions.push({ session_id: s.id, device_id: dev.id });
          results.push({ device_id: id, ok: true, expires_at: s.expires_at });
        } catch (e: any) {
          results.push({ device_id: id, ok: false, error: e?.status && e.status < 500 ? e.message : 'Could not start this camera' });
        }
      }
      await db.OfficeDisplay.update(d.id, { camera_sessions: sessions });
      return json({ results, display: await view({ ...d, camera_sessions: sessions }) });
    }
    if (action === 'camera_stop') {
      await stopCameras(d, admin, 'stopped from Office displays');
      return json({ display: await view({ ...d, camera_sessions: [] }) });
    }
    return json({ error: 'Invalid request' }, 400);
  } catch (e: any) {
    const status = e?.status && e.status < 500 ? e.status : 503;
    return json({ error: status < 500 ? e.message : 'Office displays are unavailable right now. Try again shortly.', ...(e?.code ? { code: e.code } : {}) }, status);
  }
}
