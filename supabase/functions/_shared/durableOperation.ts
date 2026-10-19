import { secrets } from './base44-compat.ts';
// Staged rollout: this secret is set only after migration + hosted acceptance.
// Unknown values fail closed. Explicitly absent/false preserves pre-migration development behavior.
export function durableWritesEnabled() {
 const value=secrets.get('TT_DURABLE_WRITES_ENABLED');
 if(value===undefined || value===null || value==='' || value==='false') return false;
 if(value!=='true') throw unavailable();
 return true;
}
function unavailable() { return Object.assign(new Error('Saved work is awaiting verification. Please retry later; do not reset the tablet.'),{status:503}); }
export async function operationHash(value:string) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
}
async function operationRpc(method:string,body:Record<string,unknown>) {
 try {
  const raw=secrets.get('TT_ATOMIC_STORE_URL')?.trim(), key=secrets.get('TT_ATOMIC_SERVICE_ROLE_KEY')?.trim();
  const u=new URL(raw || '');
  if(u.protocol!=='https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname) || u.port || u.username || u.password ||
   u.search || u.hash || (u.pathname!=='/' && u.pathname!=='') || !key || key.length<20 || /\s/.test(key) || key.startsWith('sb_publishable_')) throw unavailable();
  const response=await fetch(u.origin+'/rest/v1/rpc/'+method,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{'Content-Type':'application/json',apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key})},body:JSON.stringify(body)});
  if(!response.ok) throw unavailable();
  return await response.json();
 } catch { throw unavailable(); }
}
export async function acquireOperation(scope:string,payloadHash:string) {
 if(!scope || scope.length>1500 || !/^[a-f0-9]{64}$/.test(payloadHash)) throw unavailable();
 const fields={p_scope_hash:await operationHash('write:v1:'+scope),p_payload_hash:payloadHash,p_owner_id:crypto.randomUUID()};
 const read=async()=>{
  const result=await operationRpc('tt_operation_claim',fields);
  if(!result || !['acquired','pending','done','conflict'].includes(result.state) ||
   (result.state==='done' && !/^[A-Za-z0-9_-]{1,128}$/.test(result.record_id || ''))) throw unavailable();
  if(result.state==='conflict') throw Object.assign(new Error('Request ID reused with different data'),{status:409});
  return result;
 };
 return {state:await read(),read,complete:async(id:string)=>{
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id || '') || await operationRpc('tt_operation_complete',{...fields,p_record_id:id})!==true) throw unavailable();
 }};
}
// Prior rows are checked by callers after current authorization, before this guard.
// Only the first acquired response may invoke create. Uncertain writes are NEVER retried here.
export async function durableCreate(scope:string|null,payloadHash:string,create:()=>Promise<any>,get:(id:string)=>Promise<any>) {
 if(!durableWritesEnabled()) return create();
 if(!scope) throw Object.assign(new Error('A saved request ID is required'),{status:400});
 const op=await acquireOperation(scope,payloadHash);
 let state=op.state;
 if(state.state==='acquired') {
  try { const row=await create(); await op.complete(row?.id); return row; }
  catch { throw unavailable(); }
 }
 for(let i=0;state.state==='pending' && i<8;i++) {
  await new Promise(resolve=>setTimeout(resolve,100));
  state=await op.read();
  if(state.state==='acquired') throw unavailable();
 }
 if(state.state!=='done') throw unavailable();
 const row=await get(state.record_id).catch(()=>null);
 if(!row || row.id!==state.record_id) throw unavailable();
 return row;
}
