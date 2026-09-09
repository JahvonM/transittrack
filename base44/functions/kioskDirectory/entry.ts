import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

async function resolveDevice(base44, deviceId) {
  if (!deviceId || typeof deviceId !== 'string') return null;
  try {
    const device = await base44.asServiceRole.entities.KioskDevice.get(deviceId);
    if (!device || !device.paired || device.status !== 'active') return null;
    return device;
  } catch {
    return null;
  }
}

function sanitizeContactFields(input) {
  const out = {};
  const allowed = [
    'name', 'phone', 'email', 'type', 'nfc_card_tag',
    'pickup_name', 'pickup_lat', 'pickup_lng',
    'dropoff_name', 'dropoff_lat', 'dropoff_lng'
  ];
  for (const key of allowed) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

export default async function(req) {
  try {
    const body = await req.json();
    const { device_id, action, contact_id, contact } = body;

    const base44 = createClientFromRequest(req);
    const device = await resolveDevice(base44, device_id);
    if (!device) {
      return Response.json({ error: 'Invalid or unpaired device' }, { status: 401 });
    }

    const companyId = device.company_id;
    const companyName = device.company_name;
    if (!companyId) {
      return Response.json({ error: 'Device has no company assigned' }, { status: 400 });
    }

    // Touch last_seen so the kiosk stays "online"
    await base44.asServiceRole.entities.KioskDevice.update(device_id, {
      last_seen: new Date().toISOString()
    });

    switch (action) {
      case 'list': {
        const contacts = await base44.asServiceRole.entities.Contact.filter(
          { company_id: companyId },
          '-updated_date',
          5000
        );
        return Response.json({ contacts });
      }

      case 'create': {
        if (!contact || typeof contact !== 'object') {
          return Response.json({ error: 'Contact data required' }, { status: 400 });
        }
        const fields = sanitizeContactFields(contact);
        if (!fields.name || !fields.type) {
          return Response.json({ error: 'Name and type are required' }, { status: 400 });
        }
        const record = await base44.asServiceRole.entities.Contact.create({
          ...fields,
          company_id: companyId,
          company_name: companyName
        });
        return Response.json({ contact: record });
      }

      case 'update': {
        if (!contact_id) {
          return Response.json({ error: 'contact_id required' }, { status: 400 });
        }
        const existing = await base44.asServiceRole.entities.Contact.get(contact_id);
        if (!existing || existing.company_id !== companyId) {
          return Response.json({ error: 'Contact not found in this company' }, { status: 404 });
        }
        const fields = sanitizeContactFields(contact || {});
        const updated = await base44.asServiceRole.entities.Contact.update(contact_id, fields);
        return Response.json({ contact: updated });
      }

      case 'delete': {
        if (!contact_id) {
          return Response.json({ error: 'contact_id required' }, { status: 400 });
        }
        const existing = await base44.asServiceRole.entities.Contact.get(contact_id);
        if (!existing || existing.company_id !== companyId) {
          return Response.json({ error: 'Contact not found in this company' }, { status: 404 });
        }
        await base44.asServiceRole.entities.Contact.delete(contact_id);
        return Response.json({ ok: true });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}