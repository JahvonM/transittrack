import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

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
        const [staff, broadcasts, checkIns] = await Promise.all([
          loadStaff(base44, companyId),
          base44.asServiceRole.entities.Broadcast.filter({}, '-created_date', 20),
          base44.asServiceRole.entities.StaffCheckIn.filter({ vehicle_id: vehicleId }, '-created_date', 20),
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
        const update = { current_lat: lat, current_lng: lng, speed: speed || 0, status: status || 'on_trip', last_location_update: new Date().toISOString() };
        if (trail) update.trail = trail;
        await base44.asServiceRole.entities.Vehicle.update(vehicleId, update);
        if (log_speeding) {
          await base44.asServiceRole.entities.Incident.create({
            vehicle_id: vehicleId, vehicle_name: vehicle.name, company_id: companyId, company_name: companyName,
            driver_name: vehicle.driver_name || '', driver_email: vehicle.driver_email || '',
            type: 'speeding', details: `Speed recorded at ${Math.round((speed || 0) * 3.6)} km/h`, occurred_at: new Date().toISOString(),
          });
        }
        return Response.json({ ok: true });
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
        return Response.json({ incident });
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
        if (recipient && recipient.company_id && vehicle.company_id && recipient.company_id !== vehicle.company_id)
          return Response.json({ error: 'Recipient not in your company' }, { status: 403 });
        const subject = `Your bus is approaching — ${sanitize(vehicle.name)}`;
        const msg = `Hello,\n\n${sanitize(vehicle.name)}${sanitize(vehicle.driver_name) ? ` (driver ${sanitize(vehicle.driver_name)})` : ''} is near your pickup location${sanitize(vehicle.company_name) ? ` for ${sanitize(vehicle.company_name)}` : ''} and will arrive shortly. Please get ready to board.\n\n— TransitTrack`;
        await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body: msg });
        return Response.json({ ok: true });
      }

      case 'update_trip_status': {
        const { trip_id, status } = body;
        if (!trip_id) return Response.json({ error: 'trip_id required' }, { status: 400 });
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