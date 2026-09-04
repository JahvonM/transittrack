import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch { /* empty body allowed */ }
    const action = body.action || 'book';

    // Public list of taxi operators — no account needed to browse.
    if (action === 'list') {
      const companies = await base44.asServiceRole.entities.Company.filter({});
      const taxi = companies
        .filter((c) => Array.isArray(c.service_types) && c.service_types.includes('taxi'))
        .map((c) => ({ id: c.id, name: c.name, phone: c.phone || null }));
      return Response.json({ companies: taxi });
    }

    // Public booking — creates an unassigned taxi trip for the chosen operator.
    const { passenger_name, phone, pickup_name, dropoff_name, company_id, pickup_lat, pickup_lng } = body;
    if (!passenger_name || !phone || !pickup_name || !dropoff_name || !company_id) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const company = await base44.asServiceRole.entities.Company.get(String(company_id));
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    const trip = await base44.asServiceRole.entities.Trip.create({
      passenger_name: String(passenger_name).slice(0, 80),
      passenger_phone: String(phone).slice(0, 40),
      pickup_name: String(pickup_name).slice(0, 120),
      dropoff_name: String(dropoff_name).slice(0, 120),
      company_id: String(company_id),
      company_name: company.name,
      pickup_lat: typeof pickup_lat === 'number' ? pickup_lat : null,
      pickup_lng: typeof pickup_lng === 'number' ? pickup_lng : null,
      status: 'scheduled'
    });

    return Response.json({ success: true, trip_id: trip.id, company: company.name });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}