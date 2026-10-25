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
  expect((await res.json()).orphans).toEqual([{company_id:'removed',company_name:'',counts:{Driver:1},history:{}}]);expect(sdk.writes).toEqual([]);
 });
 it('lists history a removed company left, by the name it had',async()=>{
  const sdk=mock('admin');
  sdk.tables.Incident=[{id:'i1',company_id:'removed',company_name:'Old Co'}];
  sdk.tables.Trip=[{id:'t1',company_id:'removed'},{id:'t2',company_id:'a'}];
  const res=await call(sdk,{action:'orphans'},'companyCleanupPreview');
  expect((await res.json()).orphans).toEqual([{company_id:'removed',company_name:'Old Co',counts:{},history:{Trip:1,Incident:1}}]);
  expect(sdk.writes).toEqual([]);
 });
});

describe('deleting what a removed company left behind',()=>{
 const del=(sdk,entity,id)=>call(sdk,{entity,operation:'delete',id},'entityAccess');
 it.each([
  ['Incident',{company_id:'removed'}],['Trip',{company_id:'removed'}],['Broadcast',{company_id:'removed'}],
  ['Workplace',{company_id:'removed'}],['LostItemReport',{company_id:'removed'}],['NfcCard',{company_id:'removed',is_active:false}],
  // Its bus was unassigned when the company went.
  ['Inspection',{company_id:'removed',vehicle_id:'loose'}],
 ])('an administrator can delete a leftover %s',async(entity,row)=>{
  const sdk=mock('admin');sdk.tables.Vehicle.push({id:'loose',company_id:null});sdk.tables[entity]=[{id:'old',...row}];
  expect((await del(sdk,entity,'old')).status).toBe(200);
  expect(sdk.tables[entity]).toEqual([]);
 });
 it('invoices stay protected',async()=>{
  const sdk=mock('admin');sdk.tables.Invoice=[{id:'inv',company_id:'removed'}];
  expect((await del(sdk,'Invoice','inv')).status).toBe(403);
  expect(sdk.tables.Invoice).toHaveLength(1);
 });
 it('company managers still cannot delete them',async()=>{
  const sdk=mock('company');sdk.tables.Incident=[{id:'old',company_id:'removed'}];
  expect((await del(sdk,'Incident','old')).status).toBe(404);
  expect(sdk.tables.Incident).toHaveLength(1);
 });
});
