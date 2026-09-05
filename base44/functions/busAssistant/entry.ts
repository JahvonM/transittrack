import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { question, company_id, user_lat, user_lng } = body || {};
    if (!question) return Response.json({ error: 'Question required' }, { status: 400 });

    const vehicles = company_id
      ? await base44.entities.Vehicle.filter({ company_id })
      : await base44.entities.Vehicle.list();
    const routes = company_id
      ? await base44.entities.Route.filter({ company_id })
      : await base44.entities.Route.list();

    const live = vehicles.filter((v) => v.current_lat != null && v.status !== 'offline');
    const context = {
      user_location: user_lat != null ? { lat: user_lat, lng: user_lng } : null,
      live_vehicles: live.map((v) => ({
        name: v.name,
        type: v.type,
        plate: v.plate_number,
        status: v.status,
        company: v.company_name,
        driver: v.driver_name || null,
        lat: v.current_lat,
        lng: v.current_lng,
        speed: v.speed || 0,
      })),
      routes: routes.map((r) => ({ name: r.name, stops: r.stops || [] })),
    };

    const prompt = `You are a helpful transit assistant for passengers. A passenger asks: "${question}"

Using the live fleet data below, answer in friendly, concise language (1-2 sentences). If they ask how far a bus is, estimate the distance and travel time to the user's location (or the relevant stop). Mention the bus name and route if relevant. If you can't determine it, say so briefly.

LIVE FLEET:
${JSON.stringify(context)}`;

    const answer = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt });
    return Response.json({ answer });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}