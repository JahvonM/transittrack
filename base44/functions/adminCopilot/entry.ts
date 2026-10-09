import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';


async function liveMembership(base44, row) {
 if (!row.expires_at && !row.code_hash) return true; // Explicit admin approval.
 if (!row.code_hash || (row.scope !== 'passenger' && !(Date.parse(row.expires_at) > Date.now()))) return false;
 const company=await base44.asServiceRole.entities.Company.get(row.company_id).catch(()=>null);
 if(!company) return false;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(company.access_code || ''));
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return row.code_hash===hash;
}

async function approvedCompanies(base44, user, scope) {
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ user_id: user.id, active: true }, '-updated_date', 100);
  const approved=[];
  for(const row of rows) if(row.scope === (scope || (user.role === 'company' ? 'manager' : 'passenger')) && await liveMembership(base44,row)) approved.push(row.company_id);
  return approved;
}
async function approvedStaffIds(base44, companyId) {
  const rows = await base44.asServiceRole.entities.CompanyMembership.filter({ company_id: companyId, active: true, scope: 'passenger' }, '-updated_date', 5000);
  const ids=new Set();
  for(const row of rows) if(await liveMembership(base44,row)) ids.add(row.user_id);
  return ids;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => { const s = e?.status ?? e?.response?.status; if (s === 401 || s === 403) return null; throw e; }); // no session: signed out; an outage stays an error
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'company') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const approved = await approvedCompanies(base44, user);
    if (user.role === 'company' && !approved.length) return Response.json({ error: 'Approved company membership required' }, { status: 403 });
    const scope = user.role === 'admin' ? {} : { company_id: { $in: approved } };
    const [vehicles, trips, broadcasts] = await Promise.all([
      base44.asServiceRole.entities.Vehicle.filter(scope),
      base44.asServiceRole.entities.Trip.filter(scope),
      base44.asServiceRole.entities.Broadcast.filter(scope),
    ]);

    const now = new Date().toISOString();
    const activeTrips = trips.filter((t) =>
      ['scheduled', 'on_the_way', 'arrived'].includes(t.status)
    );

    const snapshot = {
      generated_at: now,
      totals: {
        vehicles: vehicles.length,
        active_trips: activeTrips.length,
        broadcasts: broadcasts.length,
      },
      vehicles: vehicles.map((v) => ({
        name: v.name,
        type: v.type,
        plate: v.plate_number,
        status: v.status,
        company: v.company_name,
        driver: v.driver_name || null,
        last_update: v.last_location_update || null,
      })),
      active_trips: activeTrips.map((t) => ({
        passenger: t.passenger_name,
        route: t.route_name || t.pickup_name,
        status: t.status,
        driver: t.driver_name || null,
        vehicle: t.vehicle_name || null,
        scheduled: t.scheduled_time || null,
      })),
      anomalies: {
        offline_vehicles: vehicles.filter((v) => v.status === 'offline').map((v) => v.name),
        unassigned_vehicles: vehicles.filter((v) => !v.driver_email).map((v) => v.name),
      },
    };

    const prompt = `You are the operations copilot for a transit fleet platform. Analyze the live fleet snapshot below and produce a concise briefing for the fleet manager.

- Summarize today's fleet activity in 2-3 sentences.
- Flag anomalies (offline vehicles, delayed or long-scheduled trips, vehicles without assigned drivers).
- Suggest 1-3 concrete next actions.
- Draft a short broadcast alert message if one is warranted (otherwise return an empty string).

Respond strictly as JSON matching the schema.

FLEET SNAPSHOT:
${JSON.stringify(snapshot)}`;

    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        flags: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
              title: { type: 'string' },
              detail: { type: 'string' },
            },
            required: ['severity', 'title', 'detail'],
          },
        },
        suggested_actions: {
          type: 'array',
          items: { type: 'string' },
        },
        draft_broadcast: { type: 'string' },
      },
      required: ['summary', 'flags', 'suggested_actions', 'draft_broadcast'],
    };

    const briefing = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: schema,
    });

    return Response.json({ briefing, generated_at: now });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}