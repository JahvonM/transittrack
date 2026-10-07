import {describe,it,expect} from 'vitest';
import {load,mock,request,digest} from '../../../security-tests/helpers.js';
const call=(sdk,body,name='companyAccess')=>load(name,sdk).default(request(body));

describe('staff keeping their company on a device with no saved pass',()=>{
 it('puts an approved member back into their company without the code',async()=>{
  const sdk=mock('staff');
  const res=await call(sdk,{action:'context',grant:null,restore:true});
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.company.id).toBe('a');
  expect(body.grant).toMatch(/^[a-f0-9]{64}$/);
  // The pass it hands back works on its own from then on.
  expect((await call(sdk,{action:'context',grant:body.grant,restore:true})).status).toBe(200);
 });
 it('restores a member whose membership was made by the current code',async()=>{
  const sdk=mock('staff');
  sdk.tables.CompanyMembership[0].code_hash=digest('JOIN12345678');
  const res=await call(sdk,{action:'context',grant:null,restore:true});
  expect(res.status).toBe(200);
  expect((await res.json()).company.id).toBe('a');
 });
 it('still asks for the code once the operator changes it',async()=>{
  const sdk=mock('staff');
  sdk.tables.CompanyMembership[0].code_hash=digest('OLDCODE12345');
  const res=await call(sdk,{action:'context',grant:null,restore:true});
  expect(res.status).toBe(401);
  expect((await res.json()).code).toBe('COMPANY_ACCESS_REQUIRED');
 });
 it('never restores someone whose membership was removed',async()=>{
  const sdk=mock('staff');
  sdk.tables.CompanyMembership[0].active=false;
  expect((await call(sdk,{action:'context',grant:null,restore:true})).status).toBe(401);
 });
 it('never restores an expired admin approval',async()=>{
  const sdk=mock('staff');
  sdk.tables.CompanyMembership[0].expires_at='2000-01-01';
  expect((await call(sdk,{action:'context',grant:null,restore:true})).status).toBe(401);
 });
 it('asks for the code when the app does not request a restore',async()=>{
  const sdk=mock('staff');
  expect((await call(sdk,{action:'context',grant:null})).status).toBe(401);
 });
 it('never restores a company into a privileged role',async()=>{
  for(const role of ['admin','company'])expect((await call(mock(role),{action:'context',grant:null,restore:true})).status).toBe(401);
 });
 it('refuses both the stale pass and the stale membership once the code changes',async()=>{
  const sdk=mock('staff'),grant='a'.repeat(64);
  sdk.tables.CompanyMembership[0].code_hash=digest('OLDCODE12345');
  sdk.tables.CompanyAccessGrant=[{id:'grant',user_id:'caller',company_id:'a',token_hash:digest(grant),code_hash:digest('OLDCODE12345')}];
  expect((await call(sdk,{action:'context',grant,restore:true})).status).toBe(401);
 });
 it('hands a fresh pass to a member whose saved pass went stale on its own',async()=>{
  const sdk=mock('staff'),grant='a'.repeat(64);
  sdk.tables.CompanyMembership[0].code_hash=digest('JOIN12345678');
  sdk.tables.CompanyAccessGrant=[{id:'gone',user_id:'caller',company_id:'a',token_hash:digest(grant),code_hash:digest('JOIN12345678')}];
  const res=await call(sdk,{action:'context',grant:'b'.repeat(64),restore:true});
  expect(res.status).toBe(200);
  expect((await res.json()).grant).toMatch(/^[a-f0-9]{64}$/);
 });
});