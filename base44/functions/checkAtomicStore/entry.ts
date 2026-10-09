import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { createDurableAttemptBudget } from '../../shared/durableAttemptBudget.ts';

// Setup diagnostic only. Does not activate application handlers.
// Each run leaves one policy and twenty synthetic reservation rows.
export function createCheckAtomicStoreHandler(deps: {
 clientFromRequest: typeof createClientFromRequest;
 getSecret: (name: string) => string | null | undefined;
 createBudget: typeof createDurableAttemptBudget;
}) {
 return async (req: Request) => {
  if (req.method !== 'POST') return Response.json({error:'POST required'}, {status:405});
  let user;
  try { user = await deps.clientFromRequest(req).auth.me(); }
  catch { return Response.json({error:'Sign in required'}, {status:401}); }
  if (!user) return Response.json({error:'Sign in required'}, {status:401});
  if (user.role !== 'admin') return Response.json({error:'Administrators only'}, {status:403});
  try {
   const url = deps.getSecret('TT_ATOMIC_STORE_URL');
   const serviceRoleKey = deps.getSecret('TT_ATOMIC_SERVICE_ROLE_KEY');
   if (!url || !serviceRoleKey) return Response.json({ok:false,error:'Missing atomic store backend secrets'}, {status:503});
   const config = {url,serviceRoleKey,timeoutMs:10000};
   // Generate the scope and UUIDs here; ignore all client-supplied test inputs.
   const scope = 'setup-check:'+crypto.randomUUID();
   const ids = Array.from({length:20},()=>crypto.randomUUID());
   const outcomes = await Promise.allSettled(ids.map(id=>deps.createBudget(config).reserve(scope,id,5,60000)));
   if (outcomes.some(r=>r.status === 'rejected')) throw new Error('Unavailable');
   const decisions = outcomes.map(r=>(r as PromiseFulfilledResult<boolean>).value);
   const accepted = decisions.filter(Boolean).length;
   const replay = await Promise.all(ids.map(id=>deps.createBudget(config).reserve(scope,id,5,60000)));
   const replayStable = replay.every((value,i)=>value===decisions[i]);
   const extraDenied = !(await deps.createBudget(config).reserve(scope,crypto.randomUUID(),5,60000));
   const ok = accepted===5 && replayStable && extraDenied;
   return Response.json({ok,accepted,total:20,replayStable,extraDenied,applicationActivated:false}, {status:ok?200:409});
  } catch {
   // Never return/log provider bodies or secret values.
   return Response.json({ok:false,error:'Atomic store check unavailable. Verify project URL, backend secret and SQL migration.'}, {status:503});
  }
 };
}
export default async function(req: Request) {
 return createCheckAtomicStoreHandler({
  clientFromRequest:createClientFromRequest,
  getSecret:name=>secrets.get(name),
  createBudget:createDurableAttemptBudget,
 })(req);
}
