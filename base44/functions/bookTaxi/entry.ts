import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { reserveAttempt } from '../../shared/atomicOps.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => { const s = e?.status ?? e?.response?.status; if (s === 401 || s === 403) return null; throw e; }); // no session: signed out; an outage stays an error
    if (!user) {
      return Response.json({ error: 'Please sign in to book a taxi.' }, { status: 401 });
    }
    let body = {};
    try { body = await req.json(); } catch { /* empty body allowed */ }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Invalid booking request' }, { status: 400 });
    const action = body.action === undefined ? 'book' : body.action;
    if (!['list', 'book'].includes(action)) return Response.json({ error: 'Unsupported action' }, { status: 400 });

    // List of taxi operators (public info only).
    if (action === 'list') {
      const companies = await base44.asServiceRole.entities.Company.filter({});
      const taxi = companies
        .filter((c) => Array.isArray(c.service_types) && c.service_types.includes('taxi'))
        .map((c) => ({ id: c.id, name: c.name, phone: c.phone || null }));
      return Response.json({ companies: taxi });
    }

    // Booking — creates an unassigned taxi trip for the chosen operator.
    const { passenger_name, phone, pickup_name, dropoff_name, company_id, pickup_lat, pickup_lng } = body;
    if ([passenger_name, phone, pickup_name, dropoff_name, company_id].some(value => typeof value !== 'string' || !value.trim())) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const hasLat = pickup_lat !== undefined && pickup_lat !== null;
    const hasLng = pickup_lng !== undefined && pickup_lng !== null;
    if (hasLat !== hasLng || (hasLat && (!Number.isFinite(pickup_lat) || !Number.isFinite(pickup_lng) || Math.abs(pickup_lat) > 90 || Math.abs(pickup_lng) > 180))) return Response.json({ error: 'Invalid pickup coordinates' }, { status: 400 });
    const company = await base44.asServiceRole.entities.Company.get(company_id.trim());
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });
    if (!Array.isArray(company.service_types) || !company.service_types.includes('taxi')) return Response.json({ error: 'Company does not offer taxi service' }, { status: 403 });

    // A person can't flood an operator with bookings.
    if (!(await reserveAttempt(base44, 'taxi-booking:' + user.id, 10, 60 * 60_000))) return Response.json({ error: 'You have made several bookings in the last hour. Please call the operator.' }, { status: 429 });
    const trip = await base44.asServiceRole.entities.Trip.create({
      passenger_name: passenger_name.trim().slice(0, 80),
      passenger_phone: phone.trim().slice(0, 40),
      pickup_name: pickup_name.trim().slice(0, 120),
      dropoff_name: dropoff_name.trim().slice(0, 120),
      company_id: company.id,
      company_name: company.name,
      pickup_lat: typeof pickup_lat === 'number' ? pickup_lat : null,
      pickup_lng: typeof pickup_lng === 'number' ? pickup_lng : null,
      status: 'scheduled'
    });

    return Response.json({ success: true, trip_id: trip.id, company: company.name });
  } catch (error) {
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}