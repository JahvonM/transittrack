import {describe,it,expect} from 'vitest';
import {load,mock,request,digest} from '../../../security-tests/helpers.js';
describe('company workspace',()=>{
 it.each(['staff','company',null])('denies non-admin %s',async role=>{
  const client=mock(role),res=await load('companyWorkspace',client).default(request({company_id:'a'}));
  expect(res.status).toBe(role?403:401);expect(client.reads.some(r=>r.name==='Vehicle')).toBe(false);
 });
 it('checks current server role rather than session role',async()=>{
  const client=mock('staff');client.auth.me=async()=>({id:'caller',role:'admin'});
  expect((await load('companyWorkspace',client).default(request({company_id:'a'}))).status).toBe(403);
 });
 it('scopes reads and projects no credentials',async()=>{
  const client=mock('admin');
  client.tables.Driver=[{id:'da',company_id:'a',full_name:'A driver',nfc_card_uid:'SECRET'},{id:'db',company_id:'b',full_name:'B driver'}];
  const res=await load('companyWorkspace',client).default(request({company_id:'a'})),data=await res.json();
  expect(res.status).toBe(200);expect(data.vehicles.map(v=>v.id)).toEqual(['bus-a']);expect(data.drivers.map(d=>d.id)).toEqual(['da']);
  expect(JSON.stringify(data)).not.toContain('SECRET');expect(data.vehicles[0]).not.toHaveProperty('driver_pin');
  for(const read of client.reads.filter(r=>r.method==='filter' && r.name!=='User'))expect(read.query.company_id).toBe('a');
 });
 it('excludes revoked, expired manager, and inactive memberships',async()=>{
  const client=mock('admin');
  client.tables.User.push({id:'ok',full_name:'Approved'},{id:'revoked',full_name:'Revoked'},{id:'expired',full_name:'Expired'},{id:'inactive',full_name:'Inactive'});
  client.tables.CompanyMembership=[
   {id:'m1',user_id:'ok',company_id:'a',scope:'passenger',active:true},
   {id:'m2',user_id:'revoked',company_id:'a',scope:'passenger',active:true,code_hash:digest('old-code')},
   {id:'m3',user_id:'expired',company_id:'a',scope:'manager',active:true,expires_at:'2020-01-01',code_hash:digest('JOIN12345678')},
   {id:'m4',user_id:'inactive',company_id:'a',scope:'passenger',active:false}
  ];
  const data=await(await load('companyWorkspace',client).default(request({company_id:'a'}))).json();
  expect(data.people.map(p=>p.name)).toEqual(['Approved']);
 });
 it('rejects missing and invalid company selections',async()=>{
  const client=mock('admin'),handler=load('companyWorkspace',client).default;
  expect((await handler(request({company_id:{id:'a'}}))).status).toBe(400);
  expect((await handler(request({company_id:'missing'}))).status).toBe(404);
 });
 it('filters the pickup plan at the database boundary',async()=>{
  const client=mock('admin');
  const res=await load('routeStops',client).default(request({action:'plan',company_id:'a'})),data=await res.json();
  expect(res.status).toBe(200);expect(data.buses.map(b=>b.id)).toEqual(['bus-a']);
  expect(data.people.every(p=>p.company_id==='a')).toBe(true);
  for(const read of client.reads.filter(r=>['Vehicle','Route','Contact','NfcCard','CompanyMembership'].includes(r.name)))expect(read.query.company_id).toBe('a');
 });
});
