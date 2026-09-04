import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'company') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [vehicles, trips, broadcasts] = await Promise.all([
      base44.entities.Vehicle.list(),
      base44.entities.Trip.list(),
      base44.entities.Broadcast.list(),
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