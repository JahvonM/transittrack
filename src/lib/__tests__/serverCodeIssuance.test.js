
import {describe,it,expect} from 'vitest';
import {webcrypto} from 'node:crypto';
import {load,mock,request,digest} from '../../../security-tests/helpers.js';
const call=(sdk,body,name='manageAccessCodes',random)=>load(name,sdk,[],random).default(request(body));
describe('server code issuance',()=>{
 it.each(['staff','mechanic',null])('rejects %s code management without writes',async role=>{
  const sdk=mock(role);expect((await call(sdk,{action:'issue_company',company_id:'a'})).status).toBeGreaterThanOrEqual(400);expect(sdk.writes).toEqual([]);
 });
 it('refreshes the role rather than trusting the login snapshot',async()=>{
  const sdk=mock('admin');sdk.auth.me=async()=>({id:'caller',role:'admin'});sdk.tables.User[0].role='staff';
  expect((await call(sdk,{action:'issue_company',company_id:'a'})).status).toBe(403);expect(sdk.writes).toEqual([]);
 });
 it('scopes managers through approved membership',async()=>{
  const sdk=mock('company');expect((await call(sdk,{action:'issue_company',company_id:'b'})).status).toBe(403);
  const res=await call(sdk,{action:'issue_company',company_id:'a',code:'AAAA'});expect(res.status).toBe(200);
  const data=await res.json();expect(data.code).toMatch(/^[A-Z2-9]{12}$/);expect(Date.parse(data.expires_at)-Date.now()).toBeGreaterThan(29*86400000);expect(sdk.tables.Company[0].access_code).toBe(data.code);
 });
 it('does not replace a paired tablet without explicit confirmation',async()=>{
  const sdk=mock('admin');expect((await call(sdk,{action:'issue_pairing',device_id:'tablet'})).status).toBe(409);expect(sdk.writes).toEqual([]);
 });
 it('issues a server pairing code with a fifteen-minute expiry',async()=>{
  const sdk=mock('company');sdk.tables.KioskDevice[0].paired=false;
  const res=await call(sdk,{action:'issue_pairing',device_id:'tablet',code:'AAAA',expires_at:'2099-01-01'});expect(res.status).toBe(200);
  const data=await res.json();expect(data.code).toMatch(/^[A-Z2-9]{12}$/);expect(Date.parse(data.expires_at)-Date.now()).toBeLessThanOrEqual(900000);expect(Date.parse(data.expires_at)-Date.now()).toBeGreaterThan(890000);
 });
 it('leaves existing codes unchanged when collision allocation is exhausted',async()=>{
  const sdk=mock('admin');sdk.tables.Company[1].access_code='AAAAAAAAAAAA';
  const fixed={subtle:webcrypto.subtle,getRandomValues:a=>a.fill(0)};
  expect((await call(sdk,{action:'issue_company',company_id:'a'},'manageAccessCodes',fixed)).status).toBe(503);expect(sdk.writes).toEqual([]);
 });
 it.each(['admin','company'])('denies generic credential field writes for %s',async role=>{
  const sdk=mock(role);
  for(const body of [{entity:'Company',id:'a',data:{access_code:'CUSTOMCODE12'}},{entity:'KioskDevice',id:'tablet',data:{paired:false}},{entity:'KioskDevice',id:'tablet',data:{status:'revoked'}}]){
   expect((await call(sdk,{...body,operation:'update'},'entityAccess')).status).toBe(403);
  }expect(sdk.writes).toEqual([]);
 });
 it('mints company codes during admin creation',async()=>{
  const sdk=mock('admin');const res=await call(sdk,{entity:'Company',operation:'create',data:{name:'New'}},'entityAccess');expect(res.status).toBe(200);
  const created=sdk.tables.Company.find(c=>c.name==='New');expect(created.access_code).toMatch(/^[A-Z2-9]{12}$/);expect(Date.parse(created.access_code_expires_at)).toBeGreaterThan(Date.now());
 });
 it.each([null,new Date(Date.now()+1800000).toISOString(),'2000-01-01'])('rejects a valid-format pairing code with invalid expiry %s',async expiry=>{
  const sdk=mock(null);Object.assign(sdk.tables.KioskDevice[0],{paired:false,pairing_expires_at:expiry});
  const res=await call(sdk,{pairing_code:'PAIR12345678'},'pairKioskDevice');expect(res.status).toBeGreaterThanOrEqual(400);expect(sdk.writes).toEqual([]);
 });
 it('rejects expired join codes even when the code matches',async()=>{
  const sdk=mock('staff');sdk.tables.Company[0].access_code_expires_at='2000-01-01';
  expect((await call(sdk,{action:'verify',code:'JOIN12345678'},'companyAccess')).status).toBe(403);
 });
 it.each(['kioskCheckIn','nfcCards'])('%s stores Contact keypad codes only as fingerprints',async name=>{
  const sdk=mock('admin');
  const body=name==='kioskCheckIn'?{action:'generate_access_code',company_id:'a',staff_id:'rider'}:{action:'keypad_code',person_key:'contact:rider'};
  const res=await call(sdk,body,name);expect(res.status).toBe(200);const data=await res.json();
  expect(data.code).toMatch(/^\d{12}$/);
  expect(sdk.tables.Contact[0].access_code).toBe('');
  expect(sdk.tables.PassengerAccessCredential[0]).toMatchObject({contact_id:'rider',company_id:'a',token_hash:digest(data.code)});
  expect(JSON.stringify(sdk.tables.PassengerAccessCredential)).not.toContain(data.code);
 });
 it('looks up a newly hashed Contact code and hides it from the issuing directory',async()=>{
  const sdk=mock('admin');const issued=await call(sdk,{action:'keypad_code',person_key:'contact:rider'},'nfcCards');expect(issued.status).toBe(200);const {code}=await issued.json();
  const directory=await (await call(sdk,{action:'people'},'nfcCards')).json();
  expect(JSON.stringify(directory)).not.toContain(code);
  sdk.auth.me=async()=>null;
  const lookup=await call(sdk,{action:'lookup_code',device_id:'tablet',code},'kioskCheckIn');
  expect(lookup.status).toBe(200);expect((await lookup.json()).staff.id).toBe('rider');
 });
 it('mints pairing credentials when registering a device',async()=>{
  const sdk=mock('admin');const res=await call(sdk,{entity:'KioskDevice',operation:'create',data:{label:'New',company_id:'a',kiosk_type:'driver',vehicle_id:'bus-a'}},'entityAccess');expect(res.status).toBe(200);
  const row=sdk.tables.KioskDevice.find(d=>d.label==='New');expect(row.pairing_code).toMatch(/^[A-Z2-9]{12}$/);expect(row.paired).toBe(false);expect(Date.parse(row.pairing_expires_at)-Date.now()).toBeLessThanOrEqual(900000);
 });
 it('preserves existing company context when only join-code expiry has elapsed',async()=>{
  const sdk=mock('staff');sdk.tables.Company[0].access_code_expires_at=new Date(Date.now()+60000).toISOString();
  const verify=await call(sdk,{action:'verify',code:'JOIN12345678'},'companyAccess');expect(verify.status).toBe(200);const {grant}=await verify.json();
  sdk.tables.Company[0].access_code_expires_at='2000-01-01';
  expect((await call(sdk,{action:'context',grant},'companyAccess')).status).toBe(200);
 });
 it('rejects protected and legacy code ambiguity before issuing a grant',async()=>{
  const sdk=mock(null);sdk.tables.DeviceCredential=[{id:'cred',device_id:'tablet',token_hash:digest('a'.repeat(64)),expires_at:new Date(Date.now()+86400000).toISOString(),company_id:'a',vehicle_id:'bus-a',kiosk_type:'bus_boarding',pairing_code_hash:digest('PAIR12345678')}];sdk.tables.PassengerAccessCredential=[{id:'held',company_id:'a',contact_id:'rider',token_hash:digest('12345')}];
  expect((await call(sdk,{action:'lookup_code',device_id:'tablet',device_token:'a'.repeat(64),code:'12345'},'kioskCheckIn')).status).toBe(409);
  expect(sdk.tables.VerificationGrant||[]).toEqual([]);
 });
});
