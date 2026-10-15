import { describe, it, expect } from 'vitest';
import { load, mock, request, budgetFetchFixture, digest } from './helpers';
const secrets={TT_DURABLE_WRITES_ENABLED:'true',TT_ATOMIC_STORE_URL:'https://example.supabase.co',TT_ATOMIC_SERVICE_ROLE_KEY:'sb_secret_synthetic-test-key-never-real'};
const resultBody={entity:'InspectionResult',operation:'create',data:{vehicle_id:'bus-a',company_id:'a',inspection_item:'Tyre',condition:'GOOD',client_request_id:'durable-result-123'}};
const send=(c,b=resultBody)=>load('entityAccess',c).default(request(b));
describe('durable application writes across recreated backend workers',()=>{
 it('creates one mechanic record across independent workers and recovers it after restart',async()=>{
  const c=mock('mechanic');
  const responses=await Promise.all(Array.from({length:8},()=>send(c)));
  expect(responses.every(r=>r.status===200)).toBe(true);
  expect(c.tables.InspectionResult).toHaveLength(1);
  const ids=await Promise.all(responses.map(async r=>(await r.json()).result.id));
  expect(new Set(ids).size).toBe(1);
  expect((await send(c)).status).toBe(200);
  expect(c.tables.InspectionResult).toHaveLength(1);
  expect((await send(c,{...resultBody,data:{...resultBody.data,condition:'FAILED'}})).status).toBe(409);
 });
 it('pairs once across separate workers and never returns a saved raw token to a duplicate',async()=>{
  const c=mock(null);Object.assign(c.tables.KioskDevice[0],{paired:false,pairing_expires_at:new Date(Date.now()+60000).toISOString()});
  const sendPair=()=>load('pairKioskDevice',c).default(request({pairing_code:'PAIR12345678'}));
  const replies=await Promise.all(Array.from({length:8},sendPair));
  expect(replies.filter(r=>r.status===200)).toHaveLength(1);expect(c.tables.DeviceCredential).toHaveLength(1);
  const bodies=await Promise.all(replies.map(r=>r.json()));
  expect(bodies.filter(b=>b.device_token)).toHaveLength(1);
  expect(JSON.stringify([...c.operationRows.values()])).not.toContain(c.tables.DeviceCredential[0].token_hash);
  expect((await sendPair()).status).toBe(409);
 });
 it('shares shift and inspection identities across workers',async()=>{
  for(const action of ['start_shift','submit_inspection']) {
   const c=mock(null);c.tables.KioskDevice[0].kiosk_type='driver';
   const grant=await load('driverSession',c,['issueGrant']).issueGrant(c,c.tables.KioskDevice[0],'driver','bus-a',60000);
   const body={device_id:'tablet',driver_grant:grant,action,client_request_id:'workers-request',occurred_at:new Date().toISOString(),status:'passed'};
   const replies=await Promise.all(Array.from({length:5},()=>load('driverSession',c).default(request(body))));
   expect(replies.every(r=>r.status===200)).toBe(true);
   expect(c.tables[action==='start_shift'?'DriverShift':'Inspection']).toHaveLength(1);
  }
 });
 it('retains a committed row after a lost create response and reconciles on retry',async()=>{
  const c=mock('mechanic'),original=c.asServiceRole.entities;
  c.asServiceRole.entities=new Proxy(original,{get:(target,name)=>{
   const table=target[name];if(name!=='InspectionResult')return table;
   return {...table,create:async data=>{await table.create(data);throw new Error('response lost');}};
  }});
  expect((await send(c)).status).toBe(503);expect(c.tables.InspectionResult).toHaveLength(1);
  expect((await send(c)).status).toBe(200);expect(c.tables.InspectionResult).toHaveLength(1);
 });
 it('never reclaims an uncertain claim when no record can yet be found',async()=>{
  const c=mock('mechanic'),original=c.asServiceRole.entities;let calls=0;
  c.asServiceRole.entities=new Proxy(original,{get:(target,name)=>{
   const table=target[name];if(name!=='InspectionResult')return table;
   return {...table,create:async()=>{calls++;throw new Error('unknown write outcome');}};
  }});
  expect((await send(c)).status).toBe(503);
  expect((await send(c)).status).toBe(503);
  expect(calls).toBe(1);expect(c.tables.InspectionResult||[]).toHaveLength(0);
 });
 it('recovers an existing row after a lost completion response',async()=>{
  const c=mock('mechanic'),rpc=budgetFetchFixture(c);
  c.atomicFetch=async(url,init)=>{const result=await rpc(url,init);if(url.endsWith('tt_operation_complete'))throw new Error('lost');return result;};
  expect((await send(c)).status).toBe(503);expect(c.tables.InspectionResult).toHaveLength(1);
  expect((await send(c)).status).toBe(200);expect(c.tables.InspectionResult).toHaveLength(1);
 });
 it('stops before writes on absent RPC, bad credentials, or malformed responses',async()=>{
  for(const mode of ['missing','bad-key','malformed']) {
   const c=mock('mechanic');c.testSecrets={...secrets};
   if(mode==='bad-key')c.testSecrets.TT_ATOMIC_SERVICE_ROLE_KEY='sb_publishable_not-a-backend-key';
   c.atomicFetch=async()=>mode==='malformed'?Response.json({state:'approve-anything'}):Response.json({code:'PGRST202'},{status:404});
   expect((await send(c)).status).toBe(503);expect(c.writes).toHaveLength(0);
  }
 });
 it('does not activate the staged RPC merely by shipping code; invalid flags fail closed',async()=>{
  const c=mock('mechanic');c.testSecrets={...secrets,TT_DURABLE_WRITES_ENABLED:'false'};
  expect((await send(c)).status).toBe(200);expect(c.operationCalls).toBeUndefined();
  const bad=mock('mechanic');bad.testSecrets={...secrets,TT_DURABLE_WRITES_ENABLED:'tru'};
  expect((await send(bad)).status).toBe(503);expect(bad.writes).toHaveLength(0);
 });
 it('caps actual emails across independent workers with several admin recipients',async()=>{
  const c=mock(null);
  c.tables.User=Array.from({length:3},(_,i)=>({id:'admin-'+i,role:'admin',email:'admin'+i+'@test.invalid'}));
  const responses=await Promise.all(Array.from({length:12},(_,i)=>load('reportClientError',c).default(request({message:'Different crash '+i}))));
  expect(responses.every(r=>r.status===200)).toBe(true);
  expect(c.emails.length).toBe(5);
  expect(c.tables.NotificationLog.reduce((n,r)=>n+r.sent,0)).toBe(5);
  expect(c.tables.NotificationLog.some(r=>r.skipped>0)).toBe(true);
 });
 it('does not send or record anonymous reports if durable budget storage is unavailable',async()=>{
  const c=mock(null);c.atomicFetch=async()=>{throw new Error('offline');};
  expect((await load('reportClientError',c).default(request({message:'Test'}))).status).toBe(500);
  expect(c.emails).toHaveLength(0);expect(c.writes).toHaveLength(0);
 });
});
