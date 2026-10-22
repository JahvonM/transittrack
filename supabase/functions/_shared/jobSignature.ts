import { notifyJobProgress } from './jobNotifications.ts';
// Jobs on a bus, as the bus's tablets see and sign them: the driver tablet
// (driverSession) and the guest-facing signing tablet (jobSigning).

function jobFields(row: any, fields: string[]) {
  return Object.fromEntries(fields.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]));
}

// What the driver needs to do a job. Prices, invoices and the signature files
// stay with dispatch; the signing time tells the tablet it was signed.
export function tabletTrip(row: any) {
  const out: any = jobFields(row, ['id', 'job_type', 'status', 'vehicle_id', 'vehicle_name', 'plate_number', 'route_id', 'route_name', 'company_id', 'company_name',
    'driver_name', 'passenger_name', 'passenger_phone', 'client_name', 'pickup_name', 'pickup_address', 'pickup_lat', 'pickup_lng', 'dropoff_name',
    'dropoff_address', 'dropoff_lat', 'dropoff_lng', 'scheduled_time', 'end_time', 'flight_number', 'flight_time', 'guests', 'luggage', 'notes',
    'started_at', 'arrived_at', 'completed_at', 'pickup_signed_by', 'pickup_signed_role', 'pickup_signed_at', 'dropoff_signed_by', 'dropoff_signed_role', 'dropoff_signed_at',
    'driver_accepted_at','pickup_arrived_at','created_date', 'updated_date']);
  out.stops = Array.isArray(row.stops) ? row.stops.map((s: any) => jobFields(s || {}, ['name', 'address', 'lat', 'lng', 'reached_at'])) : [];
  return out;
}

// What the guests see on the signing tablet: where they're going and who for,
// never the driver's notes, phone numbers, client or price.
export function guestTrip(row: any) {
  return jobFields(row, ['id', 'job_type', 'status', 'passenger_name', 'pickup_name', 'dropoff_name', 'scheduled_time', 'flight_number', 'guests',
    'pickup_signed_at', 'dropoff_signed_at', 'updated_date']);
}

export const JOB_STEPS = ['scheduled', 'on_the_way', 'arrived', 'completed'];

// When a step saved offline really happened; anything implausible (more than a
// minute ahead, or older than 3 days) falls back to now.
export function jobStepTime(body: any) {
  const now = Date.now();
  if (!body.queue_replay) return new Date(now).toISOString();
  const t = body.occurred_at ? new Date(body.occurred_at).getTime() : NaN;
  if (!Number.isFinite(t) || t > now + 60_000 || t < now - 72 * 3600_000) return new Date(now).toISOString();
  return new Date(Math.min(t, now)).toISOString();
}

// The job a step is for, if it is still this bus's. A step saved offline for a
// job dispatch has since moved or cancelled is let go instead of being held
// for review, which would hold back the tablet's other saved work too.
export async function jobForBus(base44: any, body: any, companyId: string, vehicleId: string) {
  if (!body.trip_id || typeof body.trip_id !== 'string') return { reply: Response.json({ error: 'trip_id required' }, { status: 400 }) };
  const trip = await base44.asServiceRole.entities.Trip.get(body.trip_id).catch((e: any) => {
    if ([400, 404].includes(e?.status ?? e?.response?.status)) return null;
    throw e;
  });
  const gone = !trip ? 'Job not found'
    : trip.company_id !== companyId || trip.vehicle_id !== vehicleId ? 'This job is no longer on this bus'
    : trip.status === 'cancelled' ? 'Dispatch cancelled this job' : '';
  if (gone && body.queue_replay) return { reply: Response.json({ skipped: true, reason: gone }) };
  if (gone) return { reply: Response.json({ error: gone, code: 'JOB_GONE' }, { status: !trip ? 404 : trip.status === 'cancelled' ? 409 : 403 }) };
  return { trip };
}

const MAX_JOB_SIGNATURE_BYTES = 1024 * 1024;
const jobText = (value: unknown) => (value == null ? '' : String(value).replace(/[\u0000-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim());

// A pickup or drop-off signature: who signed (a guest, or the hotel's front
// desk confirming the guests were picked up or dropped off there), how many
// guests, where and when.
// The picture is a private file only an administrator can open (jobBilling).
// view: how the reply shows the job (tabletTrip for the driver, guestTrip for
// the signing tablet).
export async function signJob(base44: any, body: any, companyId: string, vehicleId: string, view: (row: any) => any = tabletTrip) {
  const { mode, data_base64, mime_type, signed_by } = body;
  if (!['pickup', 'dropoff'].includes(mode)) return Response.json({ error: 'trip_id and mode required' }, { status: 400 });
  if (!data_base64 || typeof data_base64 !== 'string') return Response.json({ error: 'data_base64 required' }, { status: 400 });
  if (mime_type && String(mime_type).split(';')[0].trim().toLowerCase() !== 'image/png') return Response.json({ error: 'Signatures must be PNG images' }, { status: 400 });
  const b64 = data_base64.replace(/^data:image\/png;base64,/, '');
  if (b64.length > Math.ceil(MAX_JOB_SIGNATURE_BYTES / 3) * 4 + 4) return Response.json({ error: 'Signature is too large' }, { status: 413 });
  const hasGuests = body.guests !== undefined && body.guests !== null && body.guests !== '';
  const guests = hasGuests ? Number(body.guests) : null;
  if (hasGuests && (!Number.isInteger(guests) || (guests as number) < 0 || (guests as number) > 500)) return Response.json({ error: 'Invalid number of guests' }, { status: 400 });
  const requestId = typeof body.client_request_id === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(body.client_request_id) ? body.client_request_id : '';
  const { trip: existing, reply } = await jobForBus(base44, body, companyId, vehicleId);
  if (reply) return reply;
  // Sent again after being offline: it is already saved.
  if (requestId && existing[`${mode}_signature_request_id`] === requestId) return Response.json({ trip: view(existing) });
  if (existing[`${mode}_signed_at`]) {
    if (body.queue_replay) return Response.json({ skipped: true, reason: 'Already signed' });
    return Response.json({ error: 'This job is already signed', code: 'ALREADY_SIGNED' }, { status: 409 });
  }
  let fileUri = '';
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], `signature-${mode}-${Date.now()}.png`, { type: 'image/png' });
    fileUri = (await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file }))?.file_uri || '';
  } catch { fileUri = ''; }
  if (!fileUri) return Response.json({ error: 'The signature could not be saved. Try again.' }, { status: 502 });
  // Where it was signed, when the tablet knows (best effort: a missing or bad
  // position never stops the signature).
  const lat = Number(body.lat), lng = Number(body.lng);
  const located = body.lat != null && body.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const at = jobStepTime(body);
  const update: any = {
    [`${mode}_signature_uri`]: fileUri, [`${mode}_signed_by`]: jobText(signed_by).slice(0, 120), [`${mode}_signed_at`]: at,
    [`${mode}_signed_role`]: body.signed_role === 'reception' ? 'reception' : 'guest',
    [`${mode}_signed_guests`]: guests, [`${mode}_signed_lat`]: located ? lat : null, [`${mode}_signed_lng`]: located ? lng : null,
    ...(requestId ? { [`${mode}_signature_request_id`]: requestId } : {}),
  };
  if (mode === 'pickup' && existing.status === 'scheduled') Object.assign(update, { status: 'on_the_way', started_at: at });
  if (mode === 'dropoff' && existing.status !== 'completed') Object.assign(update, { status: 'completed', completed_at: at });
  const trip = await base44.asServiceRole.entities.Trip.update(existing.id, update);
  if (mode === 'dropoff') await base44.asServiceRole.entities.Vehicle.update(vehicleId, { status: 'idle' });
  await notifyJobProgress(base44,trip,mode);
  return Response.json({ trip: view(trip) });
}
