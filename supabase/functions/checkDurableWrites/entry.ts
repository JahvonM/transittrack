import { createClientFromRequest } from '../_shared/base44-compat.ts';
import { acquireOperation, durableWritesEnabled, operationHash } from '../_shared/durableOperation.ts';
// Explicit admin diagnostic. Synthetic private receipts only; never app/device writes.
export default async function(req) {
 if(req.method!=='POST') return Response.json({error:'POST required'},{status:405});
 const client=createClientFromRequest(req),user=await client.auth.me().catch(()=>null);
 if(user?.role!=='admin') return Response.json({error:'Admins only'},{status:403});
 try {
  const scope='diagnostic:'+crypto.randomUUID(),hash=await operationHash('synthetic-operation-check-v1');
  const claims=await Promise.all(Array.from({length:5},()=>acquireOperation(scope,hash)));
  const winners=claims.filter(c=>c.state.state==='acquired');
  if(winners.length!==1 || claims.some(c=>!['acquired','pending'].includes(c.state.state))) throw new Error('claim');
  const before=await winners[0].read();
  if(before.state!=='pending') throw new Error('reclaim');
  await winners[0].complete('diagnostic-only');
  const resumed=await acquireOperation(scope,hash);
  const ok=resumed.state.state==='done' && resumed.state.record_id==='diagnostic-only';
  if(!ok) throw new Error('replay');
  return Response.json({ok:true,accepted:1,total:5,replayStable:true,noAutomaticReclaim:true,applicationActivated:durableWritesEnabled()},
   {headers:{'Cache-Control':'no-store'}});
 } catch { return Response.json({error:'Durable write check unavailable or failed. Keep activation disabled.'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
