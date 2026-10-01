import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

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
    if (!device || device.status !== 'active' || !device.paired) {
      return Response.json({ error: 'Device not found, inactive, or unpaired' }, { status: 404 });
    }

    // Update last_seen — kiosk is unauthenticated, use service role
    const helperHealth = cleanHelperHealth(body.helper_health);
    await base44.asServiceRole.entities.KioskDevice.update(device_id, {
      last_seen: new Date().toISOString(),
      ...(helperHealth ? { helper_health: helperHealth } : {}),
    });

    let company_logo_url = '';
    if (device.company_id) {
      try {
        const company = await base44.asServiceRole.entities.Company.get(device.company_id);
        company_logo_url = company?.logo_url || '';
      } catch { /* company may have been removed */ }
    }

    return Response.json({
      ok: true,
      device_id: device.id,
      label: device.label,
      company_id: device.company_id,
      company_name: device.company_name,
      company_logo_url,
      vehicle_id: device.vehicle_id,
      vehicle_name: device.vehicle_name,
      kiosk_type: device.kiosk_type,
      paired: device.paired,
      directory_sent_at: device.directory_sent_at || null
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}