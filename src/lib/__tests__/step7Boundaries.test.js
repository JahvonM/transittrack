import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
import {load,mock,request} from '../../../security-tests/helpers';
describe('Step 7 security boundaries',()=>{
 const protectedEntities=['DeviceCredential','DriverPinCredential','VerificationGrant','VerificationAttempt','PassengerAccessCredential','PassengerOneTimeCredential','CompanyAccessGrant','CompanyMembership','JobRun'];
 for(const role of [null,'staff','passenger','driver','company','mechanic','admin']) it(String(role)+' cannot expose credential ledgers through generic entity access',async()=>{
  const sdk=mock(role),handler=load('entityAccess',sdk).default;
  for(const entity of protectedEntities) for(const operation of ['list','get','create','update','delete','bulkCreate']) {
   const response=await handler(request({entity,operation,id:'anything',data:operation==='bulkCreate'?[]:{}}));
   expect(response.status,entity+' '+operation).toBe(403);
  }
  expect(sdk.reads).toEqual([]);expect(sdk.writes).toEqual([]);
 });
 for(const job of ['weeklyReport','inspectionAlerts','maintenanceAlerts','learnTravelTimes']) for(const role of [null,'staff','passenger','driver','company']) it(job+' rejects '+String(role)+' before reading data or causing side effects',async()=>{
  const sdk=mock(role);
  const response=await load(job,sdk).default(request({role:'admin',scheduled:true,company_id:'b',action:'run'}));
  expect(response.status).toBe(401);
  expect(sdk.reads).toEqual([]);expect(sdk.writes).toEqual([]);expect(sdk.emails).toEqual([]);
 });
 it('keeps public Advertisement reads but blocks every anonymous write operation',async()=>{
  const sdk=mock(null),handler=load('entityAccess',sdk).default;
  for(const operation of ['get','list','filter']) {
   const response=await handler(request({entity:'Advertisement',operation,id:'ad',query:{active:true}}));
   expect(response.status).toBe(200);expect(JSON.stringify(await response.json())).toContain('Public');
  }
  for(const operation of ['create','update','delete','bulkCreate']) {
   expect((await handler(request({entity:'Advertisement',operation,id:'ad',data:operation==='bulkCreate'?[{title:'Injected'}]:{title:'Injected'}}))).status).toBe(401);
  }
  expect(sdk.writes).toEqual([]);
 });
 it('keeps all custom entity direct reads and writes closed except public ad reads',()=>{
  const dir=new URL('../../../base44/entities/',import.meta.url);
  for(const file of fs.readdirSync(dir).filter(file=>file.endsWith('.jsonc')&&file!=='User.jsonc')) {
   const schema=JSON.parse(fs.readFileSync(new URL(file,dir),'utf8'));
   for(const operation of ['read','create','update','delete']) expect(schema.rls[operation],file+' '+operation).toEqual(file==='Advertisement.jsonc'&&operation==='read'?{}:{user_condition:{role:'admin'}});
  }
 });
 it('ignores role and company spoofing in a request body',async()=>{
  const sdk=mock('staff'),handler=load('entityAccess',sdk).default;
  const response=await handler(request({entity:'Vehicle',operation:'delete',id:'bus-b',role:'admin',company_id:'b',user:{role:'admin'}}));
  expect([403,404]).toContain(response.status);expect(sdk.writes).toEqual([]);
 });
 it('rejects nested credential predicates before querying the database',async()=>{
  const sdk=mock('mechanic'),handler=load('entityAccess',sdk).default;
  const response=await handler(request({entity:'Vehicle',operation:'filter',query:{$or:[{name:'Bus A'},{$and:[{driver_pin:'1234'}]}]}}));
  expect(response.status).toBe(400);
  expect(sdk.reads.filter(r=>r.name==='Vehicle')).toEqual([]);
 });
 it('refuses creating, assigning or deleting users as a mechanic',async()=>{
  const sdk=mock('mechanic'),handler=load('entityAccess',sdk).default;
  for(const body of [{operation:'create',data:{role:'admin'}},{operation:'update',id:'caller',data:{role:'admin'}},{operation:'update',id:'caller',data:{company_id:'b'}},{operation:'delete',id:'caller'}]) {
   expect([403,404]).toContain((await handler(request({entity:'User',...body}))).status);
  }
  expect(sdk.writes).toEqual([]);
 });
});
