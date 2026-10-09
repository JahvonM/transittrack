import {describe,it,expect} from 'vitest';
import {load,mock,request} from './helpers';

function setup(role='admin',overrides={}) {
 const factory=load('checkAtomicStore',mock(role),['createCheckAtomicStoreHandler']).createCheckAtomicStoreHandler;
 let secretReads=0,networkCalls=0;
 const decisions=new Map();
 let accepted=0;
 const deps={
  clientFromRequest:()=>mock(role),
  getSecret:name=>{secretReads++;return name.endsWith('URL')?'https://example.supabase.co':'sb_secret_synthetic-never-real-key';},
  createBudget:()=>({reserve:async(_scope,id)=>{networkCalls++;if(!decisions.has(id))decisions.set(id,accepted<5?(accepted++,true):false);return decisions.get(id);}}),
  ...overrides,
 };
 return {handler:factory(deps),counts:()=>({secretReads,networkCalls})};
}
describe('admin atomic storage diagnostic',()=>{
 for(const role of [null,'passenger','company','mechanic'])it('denies '+role+' before secrets or network access',async()=>{
  const check=setup(role),response=await check.handler(request({}));
  expect(response.status).toBe(role?403:401);
  expect(check.counts()).toEqual({secretReads:0,networkCalls:0});
 });
 it('accepts POST only',async()=>{
  const check=setup(),response=await check.handler(new Request('https://isolated.test'));
  expect(response.status).toBe(405);expect(check.counts().secretReads).toBe(0);
 });
 it('reports the five-attempt cap and recovered decisions without activating the app',async()=>{
  const check=setup(),response=await check.handler(request({scope:'forged',limit:10000,url:'https://evil.test'}));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ok:true,accepted:5,total:20,replayStable:true,extraDenied:true,applicationActivated:false});
  expect(check.counts().networkCalls).toBe(41);
 });
 it('reports missing configuration without accessing the database',async()=>{
  const check=setup('admin',{getSecret:()=>null}),response=await check.handler(request({}));
  expect(response.status).toBe(503);expect(check.counts().networkCalls).toBe(0);
 });
 it('hides credential/provider details on failure',async()=>{
  const check=setup('admin',{createBudget:()=>{throw Error('sb_secret_PRIVATE_PROVIDER_DETAIL');}});
  const response=await check.handler(request({}));
  expect(response.status).toBe(503);expect(await response.text()).not.toContain('PRIVATE_PROVIDER_DETAIL');
 });
 it('rejects a store that admits every request',async()=>{
  const check=setup('admin',{createBudget:()=>({reserve:async()=>true})});
  const response=await check.handler(request({}));
  expect(response.status).toBe(409);expect((await response.json()).ok).toBe(false);
 });
});
