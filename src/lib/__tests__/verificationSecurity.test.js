import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import { inlineShared, budgetFetchFixture, TEST_ATOMIC_SECRETS } from '../../../security-tests/helpers.js';
function load(name, client) {
 const source = inlineShared(fs.readFileSync(new URL(`../../../base44/functions/${name}/entry.ts`, import.meta.url), 'utf8')).replace(/^import .*;\s*$/gm, '') + (['driverSession','kioskCheckIn'].includes(name) ? '\nexport { reserveAttempt, issueGrant, validGrant };' : '');
 const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const exports = {};
 new Function('exports', 'createClientFromRequest', 'crypto', 'secrets', 'fetch', js)(exports, () => client, webcrypto, TEST_ATOMIC_SECRETS, client.atomicFetch ?? budgetFetchFixture(client));
 return exports;
}
const device = { id: 'tablet', created_date: '2026-10-02', paired: true, status: 'active', company_id: 'company', vehicle_id: 'bus', kiosk_type: 'driver', pairing_code: 'PAIR' };
const vehicle = { id: 'bus', company_id: 'company', driver_pin: '1234' };
function mock(role='staff') {
 const tables = { CompanyMembership: [{id:'membership',user_id:'staff',company_id:'company',scope:'passenger',active:true}], KioskDevice: [structuredClone(device)], Vehicle: [structuredClone(vehicle)], User: [{ id:'staff', role:'staff', company_id:'company', email:'staff@test.local', full_name:'Rider' }], Contact: [{ id:'contact', email:'staff@test.local', type:'staff', company_id:'company', vehicle_id:'bus', name:'Rider', nfc_card_tag:'CARD-SENTINEL', access_code:'12345' }], Company:[{id:'company', access_code:'JOIN12345678', access_code_expires_at:new Date(Date.now()+86400000).toISOString(), name:'Company', phone:'555'}] };
 const entities = new Proxy({}, { get: (_, name) => ({
  filter: async (query, _sort, limit) => (tables[name] || []).filter(r => Object.entries(query).every(([k,v])=>r[k]===v)).slice().reverse().slice(0,limit),
  list: async () => tables[name] || [],
  get: async id => (tables[name] || []).find(r=>r.id===id),
  create: async data => { const row={id:'row-'+Object.values(tables).flat().length,created_date:new Date().toISOString(),...data}; (tables[name] ||= []).push(row); return row; },
  update: async (id,data) => Object.assign((tables[name] || []).find(r=>r.id===id),data),
 }) });
 return { tables, asServiceRole:{entities}, auth:{me:async()=>({id:'staff',role,company_id:'company'})} };
}
const req = body => new Request('https://test.local', { method:'POST', body:JSON.stringify(body) });
describe('verification and credential protection', () => {
 for (const name of ['driverSession','kioskCheckIn']) {
  it(`${name} persists attempt limits and ages them out`, async()=>{
   const sdk=mock(), {reserveAttempt}=load(name,sdk);
   for(let i=0;i<5;i++) expect(await reserveAttempt(sdk,'scope',5,60_000)).toBe(true);
   expect(await reserveAttempt(sdk,'scope',5,60_000)).toBe(false);
   // Kept in the shared attempt store (not app tables), under a hashed scope only.
   expect(sdk.tables.VerificationAttempt ?? []).toHaveLength(0);
   expect(sdk.atomicCalls.every(c=>/^[a-f0-9]{64}$/.test(c.p_scope_hash))).toBe(true);
   expect(JSON.stringify(sdk.atomicCalls)).not.toContain('scope');
   const [policy]=[...sdk.atomicRows.values()];
   expect([...policy.rows.values()].filter(r=>r.allowed)).toHaveLength(5);
   // Attempts older than the window no longer count.
   policy.rows.forEach(r=>{r.at=Date.parse('2000-01-01');});
   expect(await reserveAttempt(sdk,'scope',5,60_000)).toBe(true);
  });
  it(`${name} binds expiring grants to device, company, vehicle, purpose and pairing`, async()=>{
   const sdk=mock(), {issueGrant,validGrant}=load(name,sdk);
   const token=await issueGrant(sdk,device,'boarding','person',60000);
   expect(await validGrant(sdk,device,token,'boarding','person')).toBe(true);
   expect(JSON.stringify(sdk.tables.VerificationGrant)).not.toContain(token);
   for(const change of [{id:'other'},{company_id:'other'},{vehicle_id:'other'},{pairing_code:'new'}]) expect(await validGrant(sdk,{...device,...change},token,'boarding','person')).toBe(false);
   expect(await validGrant(sdk,device,token,'driver','person')).toBe(false);
   expect(await validGrant(sdk,device,token,'boarding','other')).toBe(false);
   sdk.tables.VerificationGrant[0].expires_at='2000-01-01';
   expect(await validGrant(sdk,device,token,'boarding','person')).toBe(false);
  });
 }
 it('migrates a verified development PIN into salted PBKDF2 and blocks further attempts', async()=>{
  const sdk=mock(), handler=load('driverSession',sdk).default;
  const success=await handler(req({device_id:'tablet',action:'verify_pin',pin:'1234'}));
  expect(success.status).toBe(200);
  expect((await success.json()).driver_grant).toMatch(/^[a-f0-9]{64}$/);
  expect(sdk.tables.Vehicle[0].driver_pin).toBe('');
  expect(sdk.tables.DriverPinCredential[0].pin_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(sdk.tables.DriverPinCredential)).not.toContain('1234');
  // Wrong tries are still limited...
  for(let i=0;i<4;i++) expect((await handler(req({device_id:'tablet',action:'verify_pin',pin:'0000'}))).status).toBe(403);
  // ...but the right PIN is never refused just because the tablet asked for it
  // again — only wrong tries may count against the limit.
  expect((await handler(req({device_id:'tablet',action:'verify_pin',pin:'1234'}))).status).toBe(200);
  // The fifth wrong try is the last one allowed; the next is refused.
  expect((await handler(req({device_id:'tablet',action:'verify_pin',pin:'0000'}))).status).toBe(403);
  expect((await handler(req({device_id:'tablet',action:'verify_pin',pin:'1234'}))).status).toBe(429);
 });
 it('rejects driver mutations without a verified PIN grant', async()=>{
  const handler=load('driverSession',mock()).default;
  expect((await handler(req({device_id:'tablet',action:'start_tracking',driver_grant:'a'.repeat(64)}))).status).toBe(401);
 });
 it('issues hashed temporary codes only to staff and limits issuance', async()=>{
  const sdk=mock(), handler=load('generateOneTimeCode',sdk).default;
  for(let i=0;i<3;i++) {
   const response=await handler(req({}));
   expect(response.status).toBe(200);
   const data=await response.json();
   expect(data.code).toMatch(/^\d{6}$/);
   expect(JSON.stringify(sdk.tables.PassengerOneTimeCredential)).not.toContain(data.code);
   expect(sdk.tables.User[0].one_time_code).toBeUndefined();
  }
  expect((await handler(req({}))).status).toBe(429);
  expect((await load('generateOneTimeCode',mock('mechanic')).default(req({}))).status).toBe(401);
 });
 it('keeps offline directories credential-free and requires a boarding grant', async()=>{
  const sdk=mock(); sdk.tables.KioskDevice[0].kiosk_type='bus_boarding';
  const handler=load('kioskCheckIn',sdk).default;
  const response=await handler(req({device_id:'tablet',action:'offline_directory'}));
  const directory=await response.json();
  expect(directory).toMatchObject({version:1,vehicle_id:'bus'});
  expect(JSON.stringify(directory)).not.toContain('CARD-SENTINEL');
  expect(directory.staff[0].card_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect((await handler(req({device_id:'tablet',action:'check_in',staff_id:'contact',method:'nfc',status:'boarded'}))).status).toBe(403);
  const lookup=await handler(req({device_id:'tablet',action:'lookup_tag',card_tag:'CARD-SENTINEL'}));
  const data=await lookup.json();
  expect(JSON.stringify(data)).not.toContain('CARD-SENTINEL');
  expect(data.verification_grant).toMatch(/^[a-f0-9]{64}$/);
  const saved=await handler(req({device_id:'tablet',action:'check_in',staff_id:'contact',method:'nfc',status:'boarded',verification_grant:data.verification_grant}));
  expect(saved.status).toBe(200);
 });
 it('consumes temporary codes at online verification and ignores self-edited legacy codes', async()=>{
  const sdk=mock(); sdk.tables.KioskDevice[0].kiosk_type='bus_boarding';
  const code=await (await load('generateOneTimeCode',sdk).default(req({}))).json();
  const handler=load('kioskCheckIn',sdk).default;
  expect((await handler(req({device_id:'tablet',action:'lookup_code',code:code.code}))).status).toBe(200);
  expect((await handler(req({device_id:'tablet',action:'lookup_code',code:code.code}))).status).toBe(404);
  sdk.tables.User[0].one_time_code='999999'; sdk.tables.User[0].one_time_code_expires_at='2099-01-01';
  expect((await handler(req({device_id:'tablet',action:'lookup_code',code:'999999'}))).status).toBe(404);
 });
 it('verifies company codes without changing roles or membership or returning the code', async()=>{
  const sdk=mock(), handler=load('companyAccess',sdk).default;
  const response=await handler(req({action:'verify',code:'JOIN12345678'}));
  expect(response.status).toBe(200);
  const data=await response.json();
  expect(JSON.stringify(data)).not.toContain('JOIN12345678');
  expect(sdk.tables.User[0].company_id).toBe('company');
  expect(sdk.tables.User[0].role).toBe('staff');
  expect((await handler(req({action:'context',grant:data.grant}))).status).toBe(200);
  sdk.tables.Company[0].access_code='NEWCODE';
  expect((await handler(req({action:'context',grant:data.grant}))).status).toBe(401);
 });
 it('allows only admins to set driver PINs',async()=>{
  expect((await load('manageDriverPin',mock('mechanic')).default(req({vehicle_id:'bus',pin:'1234'}))).status).toBe(403);
  const sdk=mock('admin');
  expect((await load('manageDriverPin',sdk).default(req({vehicle_id:'bus',pin:'5678'}))).status).toBe(200);
  expect(sdk.tables.Vehicle[0].driver_pin).toBe('');
 });
});


it("reports a safe PIN storage reference without exposing credential material",async()=>{
 const sdk=mock("admin");
 const original=sdk.asServiceRole.entities;
 sdk.asServiceRole.entities=new Proxy(original,{get:(target,name)=>name==="DriverPinCredential"?{...target[name],create:async()=>{throw new Error("SECRET_DATABASE_DETAIL");}}:target[name]});
 const response=await load("manageDriverPin",sdk).default(req({vehicle_id:"bus",pin:"5678"}));
 expect(response.status).toBe(500);
 const data=await response.json();
 expect(data.code).toBe("PIN_STORE_WRITE");
 expect(JSON.stringify(data)).not.toMatch(/5678|SECRET_DATABASE_DETAIL|pin_hash|salt/);
});