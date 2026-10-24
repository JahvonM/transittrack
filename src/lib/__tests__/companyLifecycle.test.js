import {describe,it,expect} from 'vitest';
import {load,mock,request} from '../../../security-tests/helpers.js';
const call=(sdk,body,name='deleteCompanySafely')=>load(name,sdk).default(request(body));
describe('company lifecycle boundary',()=>{
 it.each([null,'company','driver','staff','mechanic'])('denies %s before inventory or writes',async role=>{
  const sdk=mock(role);
  expect((await call(sdk,{company_id:'a'})).status).toBe(403);
  expect(sdk.writes).toEqual([]);
 });
 it('fails closed on a backend without transactions',async()=>{
  const sdk=mock('admin');expect((await call(sdk,{company_id:'a'})).status).toBe(503);expect(sdk.writes).toEqual([]);
 });
 it('uses the authenticated actor, not a caller-supplied administrator',async()=>{
  const sdk=mock('admin');let args;
  sdk.asServiceRole.companyLifecycle=async(...a)=>{args=a;return {ok:true};};
  expect((await call(sdk,{company_id:'a',actor_id:'someone-else',action:'recover'})).status).toBe(200);
  expect(args).toEqual(['caller','a','recover']);expect(sdk.writes).toEqual([]);
 });
 it('does not expose database errors or attempt sequential fallback',async()=>{
  const sdk=mock('admin');sdk.asServiceRole.companyLifecycle=async()=>{throw Error('private database details');};
  const res=await call(sdk,{company_id:'a'});expect(res.status).toBe(500);expect(JSON.stringify(await res.json())).not.toContain('private database');expect(sdk.writes).toEqual([]);
 });
 it.each([{company_id:''},{company_id:'a',action:'erase_all'},{company_id:12}])('rejects malformed requests %j',async body=>{
  expect((await call(mock('admin'),body)).status).toBe(400);
 });
 it('blocks the generic company delete bypass',async()=>{
  const sdk=mock('admin');expect((await call(sdk,{entity:'Company',operation:'delete',id:'a'},'entityAccess')).status).toBe(409);expect(sdk.writes).toEqual([]);
 });
 it.each(['Driver','Route','Vehicle'])('allows admin deletion of an unassigned %s',async entity=>{
  const sdk=mock('admin');sdk.tables[entity]=[{id:'unassigned',company_id:null}];
  expect((await call(sdk,{entity,operation:'delete',id:'unassigned'},'entityAccess')).status).toBe(200);
 });
 it('finds old orphan company ids without mutating data',async()=>{
  const sdk=mock('admin');sdk.tables.Driver=[{id:'driver',company_id:'removed'}];
  const res=await call(sdk,{action:'orphans'},'companyCleanupPreview');expect(res.status).toBe(200);
  expect((await res.json()).orphans).toEqual([{company_id:'removed',counts:{Driver:1}}]);expect(sdk.writes).toEqual([]);
 });
});
