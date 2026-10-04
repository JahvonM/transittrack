
import {describe,it,expect} from 'vitest';
import {load,mock,request,digest} from '../../../security-tests/helpers.js';
const call=(sdk,body,name='entityAccess')=>load(name,sdk).default(request(body));
describe('approved permanent access and ownership policy',()=>{
 it.each(['update','delete'])('denies company %s of foreign and global advertisements',async operation=>{
  const sdk=mock('company');sdk.tables.Advertisement=[{id:'foreign',title:'Other',company_id:'b'},{id:'global',title:'Global'}];
  for(const id of ['foreign','global'])expect((await call(sdk,{entity:'Advertisement',operation,id,data:{title:'Changed'}})).status).toBe(403);
  expect(sdk.writes).toEqual([]);
 });
 it('scopes new company advertisements and refuses ownership transfer',async()=>{
  const sdk=mock('company');const res=await call(sdk,{entity:'Advertisement',operation:'create',data:{title:'Owned'}});expect(res.status).toBe(200);
  const ad=sdk.tables.Advertisement.find(a=>a.title==='Owned');expect(ad.company_id).toBe('a');
  expect((await call(sdk,{entity:'Advertisement',operation:'update',id:ad.id,data:{company_id:'b'}})).status).toBe(403);
  expect((await call(sdk,{entity:'Advertisement',operation:'delete',id:ad.id})).status).toBe(200);
 });
 it('lets admins manage global and company advertisements and assign ownership',async()=>{
  const sdk=mock('admin');
  expect((await call(sdk,{entity:'Advertisement',operation:'update',id:'ad',data:{company_id:'b',title:'Assigned'}})).status).toBe(200);
  expect((await call(sdk,{entity:'Advertisement',operation:'delete',id:'ad'})).status).toBe(200);
 });
 it('keeps all advertisements publicly readable while public writes fail',async()=>{
  const sdk=mock(null);sdk.tables.Advertisement.push({id:'owned',title:'Owned',company_id:'a'});
  const read=await call(sdk,{entity:'Advertisement',operation:'list'});expect(read.status).toBe(200);expect((await read.json()).result).toHaveLength(2);
  for(const operation of ['create','update','delete','bulkCreate'])expect((await call(sdk,{entity:'Advertisement',operation,id:'ad',data:operation==='bulkCreate'?[{title:'Bad'}]:{title:'Bad'}})).status).toBe(401);
 });
 it.each(['mechanic','company'])('makes maintenance deletion admin-only for %s',async role=>{
  const sdk=mock(role);
  for(const entity of ['Fault','Inspection','InspectionResult','Part','MaintenanceSchedule','MaintenanceSettings','InspectionTemplate','Vehicle']){
   sdk.tables[entity]=[{id:'record',company_id:'a'}];expect([403,404]).toContain((await call(sdk,{entity,operation:'delete',id:'record'})).status);
  }expect(sdk.writes).toEqual([]);
 });
 it('retains global mechanic maintenance reads and edits',async()=>{
  const sdk=mock('mechanic');sdk.tables.Fault=[{id:'a-fault',company_id:'a'},{id:'b-fault',company_id:'b'}];
  expect((await (await call(sdk,{entity:'Fault',operation:'list'})).json()).result).toHaveLength(2);
  expect((await call(sdk,{entity:'Fault',operation:'update',id:'b-fault',data:{status:'resolved'}})).status).toBe(200);
 });
 it('allows admins to delete maintenance records across companies',async()=>{
  const sdk=mock('admin');sdk.tables.Fault=[{id:'foreign',company_id:'b'}];expect((await call(sdk,{entity:'Fault',operation:'delete',id:'foreign'})).status).toBe(200);
 });
 it('keeps a company code stable and permits only explicit admin rotation',async()=>{
  const sdk=mock('company');const before=sdk.tables.Company[0].access_code;
  for(let i=0;i<2;i++){const res=await call(sdk,{action:'issue_company',company_id:'a'},'manageAccessCodes');expect((await res.json()).code).toBe(before);}
  expect(sdk.writes).toEqual([]);
  expect((await call(sdk,{action:'issue_company',company_id:'a',rotate:true},'manageAccessCodes')).status).toBe(403);
  sdk.tables.User[0].role='admin';const rotated=await call(sdk,{action:'issue_company',company_id:'a',rotate:true},'manageAccessCodes');expect(rotated.status).toBe(200);expect((await rotated.json()).code).not.toBe(before);
 });
 it('preserves existing expired code grants and memberships while code is unchanged',async()=>{
  const sdk=mock('staff'),grant='a'.repeat(64);
  sdk.tables.CompanyMembership[0].code_hash=digest('JOIN12345678');sdk.tables.CompanyMembership[0].expires_at='2000-01-01';
  sdk.tables.CompanyAccessGrant=[{id:'grant',user_id:'caller',company_id:'a',token_hash:digest(grant),code_hash:digest('JOIN12345678'),expires_at:'2000-01-01'}];
  expect((await call(sdk,{action:'context',grant},'companyAccess')).status).toBe(200);
  expect((await (await call(sdk,{entity:'Vehicle',operation:'list'})).json()).result).toHaveLength(1);
  sdk.tables.CompanyMembership[0].active=false;expect((await call(sdk,{action:'context',grant},'companyAccess')).status).toBe(401);expect(sdk.tables.CompanyMembership[0].active).toBe(false);
 });
 it('creates nonexpiring passenger grants without changing user roles',async()=>{
  const sdk=mock('staff');const res=await call(sdk,{action:'verify',code:'JOIN12345678'},'companyAccess');expect(res.status).toBe(200);
  expect(sdk.tables.CompanyAccessGrant[0].expires_at).toBeUndefined();
  const member=sdk.tables.CompanyMembership.find(m=>m.code_hash);expect(member.expires_at).toBeUndefined();expect(member.scope).toBe('passenger');expect(sdk.tables.User[0].role).toBe('staff');
 });
 it.each(['driverSession','kioskCheckIn','generateOneTimeCode','nfcCards','busAssistant','adminCopilot','maintenanceAlerts','notifyAdminMessage','notifyStaffPickup'])('%s consistently applies permanent passenger access but still checks the code',async name=>{
  const sdk=mock();const row={scope:'passenger',company_id:'a',expires_at:'2000-01-01',code_hash:digest('JOIN12345678')};
  const {liveMembership}=load(name,sdk,['liveMembership']);expect(await liveMembership(name==='maintenanceAlerts'?sdk.asServiceRole.entities:sdk,row)).toBe(true);
  expect(await liveMembership(name==='maintenanceAlerts'?sdk.asServiceRole.entities:sdk,{...row,scope:'manager'})).toBe(false);
  sdk.tables.Company[0].access_code='DIFFERENT';expect(await liveMembership(name==='maintenanceAlerts'?sdk.asServiceRole.entities:sdk,row)).toBe(false);
 });
});
