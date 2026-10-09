import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { reserveAttempt } from '../../shared/atomicOps.ts';


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
    const body = await req.json().catch(() => ({}));
    const { question, company_id, user_lat, user_lng } = body || {};
    if (!question || typeof question !== 'string') return Response.json({ error: 'Question required' }, { status: 400 });
    if (question.length > 500) return Response.json({ error: 'Please ask a shorter question.' }, { status: 400 });
    if (!(await reserveAttempt(base44, 'bus-assistant:' + user.id, 30, 60 * 60_000))) return Response.json({ error: 'You have asked a lot of questions this hour. Try again later.' }, { status: 429 });

    const approved = await approvedCompanies(base44, user);
    if (user.role !== 'admin' && (!company_id || !approved.includes(company_id))) return Response.json({ error: 'Company access denied' }, { status: 403 });
    const scope = company_id ? { company_id } : {};
    const vehicles = await base44.asServiceRole.entities.Vehicle.filter(scope);
    const routes = await base44.asServiceRole.entities.Route.filter(scope);

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
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}