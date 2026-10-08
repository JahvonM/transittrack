// A bus's live position update: moves the bus on the map, records its
// history, raises stop arrival/departure alerts ("one stop away") and flags
// hard braking, rapid acceleration and possible crashes. Used by the bus
// tablet (driverSession update_location) and, when dispatch switches backup
// GPS on, by the driver's phone (driverPhone backup_location).
//
// Moved here from driverSession unchanged; a recorded replay
// (gpsLocationSnapshot test) shows the tablet produces exactly the same records.
import { registerStamp, isNewestStamp } from './atomicOps.ts';

// Driving-event thresholds. These are heuristics derived from GPS speed deltas
// between periodic pings (~8s apart) — not true accelerometer-based detection
// (which would need phone/tablet sensor data we don't have access to here).
const LOC_HARD_BRAKE_MS2 = 2.5; // average deceleration over the interval
const LOC_RAPID_ACCEL_MS2 = 2.5; // average acceleration over the interval
const LOC_MAX_GAP_SEC = 25; // ignore deltas across gaps this large (offline periods, teleports)
const LOC_ARRIVAL_RADIUS_M = 120; // "at a stop" radius for place alerts
const LOC_PING_LOG_INTERVAL_MS = 60000; // location-history resolution for the replay timeline

function locHaversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function locLoadVehicle(base44, vehicleId) {
  if (!vehicleId) return null;
  try { return await base44.asServiceRole.entities.Vehicle.get(vehicleId); }
  catch (error) { if (error.status === 404) return null; throw error; }
}

// onDepartedStop(route, stopName, vehicle) sends the "one stop away" alert.
export async function applyLocationUpdate(base44, { vehicleId, companyId, companyName, body, onDepartedStop }) {
  const { lat, lng, speed, status, trail, log_speeding } = body;
  // Registered before the vehicle is read, so two requests that read the
  // same prior position still agree on which sample is the newer one.
  const sampleKey = 'vehicle-position:' + vehicleId;
  const registeredMs = body.recorded_at === undefined ? Date.now() : Date.parse(body.recorded_at);
  if (Number.isFinite(registeredMs)) registerStamp(sampleKey, registeredMs);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180)
    return Response.json({ error: 'lat and lng required' }, { status: 400 });
  const vehicle = await locLoadVehicle(base44, vehicleId);
  if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });

  const sampleMs=body.recorded_at===undefined ? Date.now() : Date.parse(body.recorded_at);
  if(!Number.isFinite(sampleMs) || sampleMs>Date.now()+60000 || sampleMs<Date.now()-72*3600_000) return Response.json({error:'Invalid GPS timestamp'},{status:400});
  if(speed!==undefined && (!Number.isFinite(speed) || speed<0 || speed>100)) return Response.json({error:'Invalid GPS speed'},{status:400});
  if(vehicle.company_id!==companyId) return Response.json({error:'Vehicle assignment mismatch'},{status:403});
  if(sampleMs<=Date.parse(vehicle.last_location_update||'')) return Response.json({ok:true,ignored:'stale sample'});
  // A newer sample already on its way (a live ping beside a queued one)
  // must win, even though both read the same older stored position.
  if(!isNewestStamp(sampleKey, sampleMs)) return Response.json({ok:true,ignored:'stale sample'});
  const now = new Date(sampleMs);
  const newSpeed = speed ?? 0;
  const prevSpeed = typeof vehicle.speed === 'number' ? vehicle.speed : null;
  const prevTime = vehicle.last_location_update ? new Date(vehicle.last_location_update).getTime() : null;
  const dtSec = prevTime ? (now.getTime() - prevTime) / 1000 : null;

  // Once a vehicle is in 'emergency' (SOS), the driver's own routine
  // location heartbeat must NOT silently clear it back to 'on_trip' —
  // that was the bug making the admin SOS alert vanish a few seconds
  // after firing. Emergency can only be cleared by an explicit admin
  // action (Vehicle.update from the dashboard), never by a heartbeat.
  if(status !== undefined && !['idle','on_trip','speeding','offline'].includes(status)) return Response.json({error:'Invalid tracking status'},{status:400});
  const routineStatus = status || 'on_trip';
  const update = { current_lat: lat, current_lng: lng, speed: newSpeed, status: vehicle.status === 'emergency' ? 'emergency' : routineStatus, last_location_update: now.toISOString() };
  if (Array.isArray(trail)) update.trail = trail.slice(-300).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180&&Number.isFinite(Date.parse(p.t))&&Date.parse(p.t)<=sampleMs).map(p=>({lat:p.lat,lng:p.lng,t:p.t}));

  // --- Driving-event detection: hard braking / rapid acceleration / possible crash ---
  // Heuristic only (GPS speed deltas between ~8s pings), not true accelerometer sensing.
  let drivingEvent = null;
  if (prevSpeed != null && dtSec != null && dtSec > 0.5 && dtSec <= LOC_MAX_GAP_SEC) {
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
    } else if (deltaMs2 <= -LOC_HARD_BRAKE_MS2) {
      drivingEvent = 'hard_brake';
    } else if (deltaMs2 >= LOC_RAPID_ACCEL_MS2) {
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
        const d = locHaversineMeters(lat, lng, s.lat, s.lng);
        if (d < nearestDist) { nearestDist = d; nearest = s; }
      });
      const prevNearId = vehicle.near_stop_id || '';
      const nowNearId = nearest && nearestDist <= LOC_ARRIVAL_RADIUS_M ? (nearest.name || '') : '';
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
          try { await onDepartedStop(route, prevNearId, vehicle); }
          catch { /* alerts are best-effort */ }
        }
      }
    }
  }

  await base44.asServiceRole.entities.Vehicle.update(vehicleId, update);

  // --- Location history, for the "replay this vehicle's day" timeline ---
  // Throttled to roughly once a minute so a day of history stays a manageable size.
  const lastPingAt = vehicle.last_ping_logged_at ? new Date(vehicle.last_ping_logged_at).getTime() : 0;
  if (now.getTime() - lastPingAt >= LOC_PING_LOG_INTERVAL_MS) {
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
