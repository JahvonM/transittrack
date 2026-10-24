import { createClientFromRequest } from '../_shared/base44-compat.ts';

// Supabase implements this extension as one database transaction. Base44 has
// no equivalent transaction API: never fall back to sequential entity writes.
export default async function(req: Request) {
  try {
    if (req.method !== 'POST') return Response.json({error:'POST required'}, {status:405});
    const api = createClientFromRequest(req);
    const actor = await api.auth.me();
    if (!actor || actor.role !== 'admin' || actor.disabled) return Response.json({error:'Admin required'}, {status:403});
    const body = await req.json();
    const {company_id, action = 'delete'} = body;
    if (typeof company_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(company_id) || !['delete','recover'].includes(action))
      return Response.json({error:'Valid company_id and action required'}, {status:400});
    const lifecycle = (api.asServiceRole as any).companyLifecycle;
    if (typeof lifecycle !== 'function') return Response.json({error:'Transactional company cleanup is unavailable on this backend'}, {status:503});
    return Response.json(await lifecycle(actor.id, company_id, action));
  } catch (error) {
    const status = Number((error as any)?.status) || 500;
    return Response.json({error:status < 500 ? (error as Error).message : 'Company cleanup was not confirmed. Refresh and retry; no partial cleanup is committed.'}, {status});
  }
}
