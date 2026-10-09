import {describe,it,expect} from 'vitest';
import {load,mock,request,digest} from './helpers';
describe('configured request budgets',()=>{
 it('shares decisions across handler workers and rejects a restarted caller after the cap',async()=>{
  const sdk=mock();
  const responses=await Promise.all(Array.from({length:20},()=>load('companyAccess',sdk).default(request({code:'JOIN12345678'}))));
  expect(responses.filter(r=>r.status===200)).toHaveLength(5);
  expect(responses.filter(r=>r.status===429)).toHaveLength(15);
  expect((await load('companyAccess',sdk).default(request({code:'JOIN12345678'}))).status).toBe(429);
  expect(sdk.tables.CompanyAccessGrant).toHaveLength(5);
  expect(sdk.atomicCalls).toHaveLength(21);
  expect(new Set(sdk.atomicCalls.map(c=>c.p_request_id)).size).toBe(21);
  expect(sdk.atomicCalls.every(c=>c.p_scope_hash===digest('request-budget:v1:company-code:caller'))).toBe(true);
  expect(sdk.reads.some(r=>r.name==='VerificationAttempt')).toBe(false);
  expect(sdk.writes.some(r=>r.name==='VerificationAttempt')).toBe(false);
 });
 for(const failure of ['missing-secret','publishable-key','network','http','invalid-response']) {
  it('stops company verification before writes on '+failure,async()=>{
   const sdk=mock();
   if(failure==='missing-secret')sdk.testSecrets={};
   if(failure==='publishable-key')sdk.testSecrets={TT_ATOMIC_STORE_URL:'https://example.supabase.co',TT_ATOMIC_SERVICE_ROLE_KEY:'sb_publishable_synthetic-test-key'};
   if(failure==='network')sdk.atomicFetch=async()=>{throw Error('PRIVATE provider details');};
   if(failure==='http')sdk.atomicFetch=async()=>Response.json({message:'PRIVATE provider details'},{status:500});
   if(failure==='invalid-response')sdk.atomicFetch=async()=>Response.json({allowed:true});
   const response=await load('companyAccess',sdk).default(request({code:'JOIN12345678'}));
   expect(response.status).toBe(503);
   expect(await response.text()).not.toContain('PRIVATE');
   expect(sdk.writes).toHaveLength(0);
   expect(sdk.emails).toHaveLength(0);
  });
 }
 it('does not spend a budget for an unsigned caller',async()=>{
  const sdk=mock(null);
  expect((await load('companyAccess',sdk).default(request({code:'JOIN12345678'}))).status).toBe(401);
  expect(sdk.atomicCalls??[]).toHaveLength(0);
 });
});
