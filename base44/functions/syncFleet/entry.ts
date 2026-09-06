import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

const KEY = 'MAINTENANCE_APP_API_KEY';
const BASE = 'MAINTENANCE_APP_BASE_URL';

async function remoteList(base, key, entity) {
  const url = `${base}/entities/${entity}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 404) return { ok: false, status: 404, entity, detail: 'entity not found at ' + url };
  if (res.status === 401) return { ok: false, status: 401, entity, detail: 'API key rejected' };
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, entity, detail: 'HTTP ' + res.status + ' from ' + url };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, entity, detail: 'Non-JSON response (likely wrong base URL) from ' + url };
  }
  return { ok: true, entity, records: Array.isArray(data) ? data : data.items || [] };
}

async function remoteCreate(base, key, entity, body) {
  const res = await fetch(`${base}/entities/${entity}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  return { ok: true, record: data };
}

function isNewer(remote, local) {
  if (!local) return true;
  const ru = remote.updated_date ? new Date(remote.updated_date).getTime() : 0;
  const lu = local.updated_date ? new Date(local.updated_date).getTime() : 0;
  return ru > lu;
}

function mapVehicle(v) {
  return {
    name: v.name,
    plate_number: v.plate_number,
    type: v.type || 'bus',
    capacity: v.capacity,
    company_id: v.company_id,
    company_name: v.company_name,
    driver_name: v.driver_name,
    driver_email: v.driver_email,
    current_odometer: v.current_odometer,
    status: v.status,
  };
}

function mapInspection(i) {
  return {
    driver_name: i.driver_name,
    driver_email: i.driver_email,
    vehicle_id: i.vehicle_id,
    vehicle_name: i.vehicle_name,
    company_id: i.company_id,
    company_name: i.company_name,
    date: i.date,
    status: i.status,
    checklist: i.checklist,
    odometer_reading: i.odometer_reading,
    fuel_level: i.fuel_level,
    needs_service: i.needs_service,
    service_notes: i.service_notes,
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin')
      return Response.json({ error: 'Admins only' }, { status: 403 });

    const apiKey = secrets.get(KEY);
    const base = secrets.get(BASE);
    if (!apiKey || !base)
      return Response.json({ error: 'Maintenance app secrets not configured' }, { status: 500 });

    let payload = {};
    try {
      payload = await req.json();
    } catch {
      /* no body */
    }
    const direction = payload.direction || 'both';
    const vehicleEntity = payload.vehicleEntity || 'Buses';
    const inspectionEntity = payload.inspectionEntity || 'Inspections';
    const admin = base44.asServiceRole;
    const summary = {
      pulled: { vehicles: 0, inspections: 0 },
      pushed: { vehicles: 0, inspections: 0 },
      errors: [],
      endpoints: { vehicle: `${base}/entities/${vehicleEntity}`, inspection: `${base}/entities/${inspectionEntity}` },
    };

    // Fetch remote once (used for both pull + push dedupe)
    const [remoteV, remoteI] = await Promise.all([
      remoteList(base, apiKey, vehicleEntity),
      remoteList(base, apiKey, inspectionEntity),
    ]);
    if (!remoteV.ok) summary.errors.push(`Vehicle remote (${vehicleEntity}): ${remoteV.detail || remoteV.status}`);
    if (!remoteI.ok) summary.errors.push(`Inspection remote (${inspectionEntity}): ${remoteI.detail || remoteI.status}`);

    // ---- PULL: maintenance -> TransitTrack ----
    if (direction !== 'push') {
      if (remoteV.ok) {
        const localV = await admin.entities.Vehicle.list('-updated_date', 5000);
        for (const rv of remoteV.records) {
          if (!rv.plate_number) continue;
          const match = localV.find((l) => l.plate_number === rv.plate_number);
          const body = mapVehicle(rv);
          if (match) {
            if (isNewer(rv, match)) await admin.entities.Vehicle.update(match.id, body);
          } else {
            await admin.entities.Vehicle.create(body);
          }
          summary.pulled.vehicles++;
        }
      }
      if (remoteI.ok) {
        const localI = await admin.entities.Inspection.list('-updated_date', 5000);
        for (const ri of remoteI.records) {
          const key = (ri.vehicle_name || '') + '|' + (ri.date || '');
          if (!ri.date) continue;
          const match = localI.find((l) => (l.vehicle_name || '') + '|' + (l.date || '') === key);
          const body = mapInspection(ri);
          if (match) {
            if (isNewer(ri, match)) await admin.entities.Inspection.update(match.id, body);
          } else {
            await admin.entities.Inspection.create(body);
          }
          summary.pulled.inspections++;
        }
      }
    }

    // ---- PUSH: TransitTrack -> maintenance (create only; dedupe by key) ----
    if (direction !== 'pull') {
      if (remoteV.ok) {
        const remotePlates = new Set(remoteV.records.map((v) => v.plate_number).filter(Boolean));
        const localV = await admin.entities.Vehicle.list('-updated_date', 5000);
        for (const lv of localV) {
          if (!lv.plate_number || remotePlates.has(lv.plate_number)) continue;
          const r = await remoteCreate(base, apiKey, vehicleEntity, mapVehicle(lv));
          if (r.ok) summary.pushed.vehicles++;
          else summary.errors.push(`Push vehicle ${lv.plate_number}: ${r.status}`);
        }
      }
      if (remoteI.ok) {
        const remoteKeys = new Set(
          remoteI.records.map((i) => (i.vehicle_name || '') + '|' + (i.date || ''))
        );
        const localI = await admin.entities.Inspection.list('-updated_date', 5000);
        for (const li of localI) {
          const k = (li.vehicle_name || '') + '|' + (li.date || '');
          if (!li.date || remoteKeys.has(k)) continue;
          const r = await remoteCreate(base, apiKey, inspectionEntity, mapInspection(li));
          if (r.ok) summary.pushed.inspections++;
          else summary.errors.push(`Push inspection ${k}: ${r.status}`);
        }
      }
    }

    return Response.json({ ok: true, summary });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}