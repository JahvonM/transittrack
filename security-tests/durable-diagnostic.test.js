import {it,expect} from 'vitest';
import {mock,load,request} from './helpers';
it('durable write diagnostic rejects non-admins without any storage operation',async()=>{
 for(const role of [null,'staff','company','driver','mechanic']) {
  const c=mock(role),r=await load('checkDurableWrites',c).default(request({}));
  expect(r.status).toBe(403);expect(c.reads).toHaveLength(0);expect(c.writes).toHaveLength(0);expect(c.operationCalls).toBeUndefined();
 }
});
it('checks synthetic storage before activation without touching app records',async()=>{
 const c=mock('admin');c.testSecrets={TT_DURABLE_WRITES_ENABLED:'false',TT_ATOMIC_STORE_URL:'https://example.supabase.co',TT_ATOMIC_SERVICE_ROLE_KEY:'sb_secret_synthetic-test-key-never-real'};
 const r=await load('checkDurableWrites',c).default(request({}));
 expect(r.status).toBe(200);
 expect(await r.json()).toEqual({ok:true,accepted:1,total:5,replayStable:true,noAutomaticReclaim:true,applicationActivated:false});
 expect(c.writes).toHaveLength(0);expect(c.emails).toHaveLength(0);expect(c.operationRows.size).toBe(1);
});
it('does not report success when the RPC is missing or the provider fails',async()=>{
 const c=mock('admin');c.atomicFetch=async()=>Response.json({code:'PGRST202'},{status:404});
 const r=await load('checkDurableWrites',c).default(request({}));
 expect(r.status).toBe(503);expect(await r.text()).not.toContain('supabase');
 expect(c.writes).toHaveLength(0);
});
