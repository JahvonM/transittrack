import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
function load(name, client) {
 const source = fs.readFileSync(new URL(`../../../base44/functions/${name}/entry.ts`, import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '') + (['driverSession','kioskCheckIn'].includes(name) ? '\nexport { reserveAttempt, issueGrant, validGrant };' : '');
 const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const exports = {};
 new Function('exports', 'createClientFromRequest', 'crypto', 'secrets', js)(exports, () => client, webcrypto, {});
 return exports;
}
const device = { id: 'tablet', created_date: '2026-10-02', paired: true, status: 'active', company_id: 'company', vehicle_id: 'bus', kiosk_type: 'driver', pairing_code: 'PAIR' };
const vehicle = { id: 'bus', company_id: 'company', driver_pin: '1234' };
function mock(role='staff') {
 const tables = { CompanyMembership: [{id:'membership',user_id:'staff',company_id:'company',scope:'passenger',active:true}], KioskDevice: [structuredClone(device)], Vehicle: [structuredClone(vehicle)], User: [{ id:'staff', role:'staff', company_id:'company', email:'staff@test.local', full_name:'Rider' }], Contact: [{ id:'contact', email:'staff@test.local', type:'staff', company_id:'company', vehicle_id:'bus', name:'Rider', nfc_card_tag:'CARD-SENTINEL', access_code:'12345' }], Company:[{id:'company', access_code:'JOIN1234', name:'Company', phone:'555'}] };
 const entities = new Proxy({}, { get: (_, name) => ({
  filter: async (query, _sort, limit, offset=0) => (tables[name] || []).filter(r => Object.entries(query).every(([k,v])=>r[k]===v)).slice().reverse().slice(offset,limit===undefined?undefined:offset+limit),
  list: async () => tables[name] || [],
  get: async id => (tables[name] || []).find(r=>r.id===id),
  create: async data => { const row={id:'row-'+Object.values(tables).flat().length,created_date:new Date().toISOString(),...data}; (tables[name] ||= []).push(row); return row; },
  bulkCreate: async data => { const rows=data.map((d,i)=>({id:'bulk-'+i,...d})); (tables[name] ||= []).push(...rows); return rows; },
  update: async (id,data) => Object.assign((tables[name] || []).find(r=>r.id===id),data),
 }) });
 return { tables, asServiceRole:{entities}, auth:{me:async()=>({id:'staff',role,company_id:'company'})} };
}
const req = body => new Request('https://test.local', { method:'POST', body:JSON.stringify(body) });
describe('offline replay backend contracts',()=>{
 it('acknowledges a completed boarding retry even after its grant expires',async()=>{
  const sdk=mock();sdk.tables.KioskDevice[0].kiosk_type='bus_boarding';
  const api=load('kioskCheckIn',sdk),handler=api.default;
  const grant=await api.issueGrant(sdk,sdk.tables.KioskDevice[0],'boarding','contact',60000);
  const body={device_id:'tablet',action:'check_in',staff_id:'contact',method:'nfc',status:'boarded',verification_grant:grant,client_request_id:'request-123',occurred_at:new Date().toISOString()};
  expect((await handler(req(body))).status).toBe(200);
  sdk.tables.VerificationGrant[0].expires_at='2000-01-01';
  const again=await handler(req(body));expect(again.status).toBe(200);expect((await again.json()).deduplicated).toBe(true);
  expect(sdk.tables.StaffCheckIn).toHaveLength(1);
  expect((await handler(req({...body,status:'off_board'}))).status).toBe(409);
  expect((await handler(req({...body,client_request_id:'request-456'}))).status).toBe(403);
 });
 it('requires explicit status and validates timestamp on new idempotent check-ins',async()=>{
  const sdk=mock();sdk.tables.KioskDevice[0].kiosk_type='bus_boarding';const handler=load('kioskCheckIn',sdk).default;
  const body={device_id:'tablet',action:'check_in',staff_name:'Manual',method:'manual',client_request_id:'request-123'};
  expect((await handler(req(body))).status).toBe(400);
  expect((await handler(req({...body,status:'boarded',occurred_at:'bad'}))).status).toBe(400);
  expect(sdk.tables.StaffCheckIn).toBeUndefined();
 });
 async function driver() {
  const sdk=mock(),api=load('driverSession',sdk);
  const grant=await api.issueGrant(sdk,device,'driver','bus',60000);
  return {sdk,send:body=>api.default(req({device_id:'tablet',driver_grant:grant,...body}))};
 }
 it('does not move the live position backward when an old sample arrives',async()=>{
  const {sdk,send}=await driver();const now=Date.now();sdk.tables.Vehicle[0].last_location_update=new Date(now).toISOString();sdk.tables.Vehicle[0].current_lat=18;
  const response=await send({action:'update_location',lat:19,lng:-76,speed:4,recorded_at:new Date(now-60000).toISOString()});
  expect(await response.json()).toMatchObject({ignored:'stale sample'});expect(sdk.tables.Vehicle[0].current_lat).toBe(18);
 });
 it('rejects a whole invalid GPS batch without acknowledging or writing points',async()=>{
  const {sdk,send}=await driver();const t=new Date().toISOString();
  const response=await send({action:'upload_track',points:[{t,lat:18,lng:-76},{t,lat:null,lng:-76}]});
  expect(response.status).toBe(400);expect(sdk.tables.LocationPing).toBeUndefined();
 });
 it('deduplicates a sequential GPS batch retry and keeps newer live position',async()=>{
  const {sdk,send}=await driver();const now=Date.now();sdk.tables.Vehicle[0].last_location_update=new Date(now).toISOString();sdk.tables.Vehicle[0].current_lat=20;
  const body={action:'upload_track',points:[{t:new Date(now-120000).toISOString(),lat:18,lng:-76,speed:4}]};
  expect((await (await send(body)).json()).stored).toBe(1);
  expect((await (await send(body)).json()).stored).toBe(0);
  expect(sdk.tables.LocationPing).toHaveLength(1);expect(sdk.tables.Vehicle[0].current_lat).toBe(20);
 });
 it('resumes a failed pre-trip fault write without duplicating the inspection',async()=>{
  const sdk=mock(), original=sdk.asServiceRole.entities;let fail=true;
  sdk.asServiceRole.entities=new Proxy(original,{get:(target,name)=>{
    const table=target[name];
    if(name!=='Fault') return table;
    return {...table,create:async data=>{if(fail) throw new Error('unavailable');return table.create(data);}};
  }});
  const api=load('driverSession',sdk), grant=await api.issueGrant(sdk,device,'driver','bus',60000);
  const body={device_id:'tablet',driver_grant:grant,action:'submit_inspection',client_request_id:'inspection-123',status:'failed',service_notes:'Tyre'};
  expect((await api.default(req(body))).status).toBe(503);
  expect(sdk.tables.Inspection).toHaveLength(1);
  fail=false;
  expect((await api.default(req({...body,expected_vehicle_id:'bus',expected_company_id:'company'}))).status).toBe(200);
  expect((await api.default(req(body))).status).toBe(200);
  expect(sdk.tables.Inspection).toHaveLength(1);expect(sdk.tables.Fault).toHaveLength(1);
  expect((await api.default(req({...body,service_notes:'Different'}))).status).toBe(409);
 });
 it('retries template child rows without duplicating the parent or earlier results',async()=>{
  const sdk=mock();sdk.tables.InspectionTemplate=[{id:'template',name:'Daily',audience:'driver',company_id:'company'}];
  const original=sdk.asServiceRole.entities;let fail=true;
  sdk.asServiceRole.entities=new Proxy(original,{get:(target,name)=>{
    const table=target[name];
    if(name!=='InspectionResult')return table;
    return {...table,create:async data=>{if(fail && data.inspection_item==='second')throw new Error('lost');return table.create(data);}};
  }});
  const api=load('driverSession',sdk),grant=await api.issueGrant(sdk,device,'driver','bus',60000);
  const body={device_id:'tablet',driver_grant:grant,action:'submit_template_inspection',client_request_id:'template-123',template_id:'template',results:[{item_name:'first',condition:'GOOD'},{item_name:'second',condition:'FAILED'}]};
  expect((await api.default(req(body))).status).toBe(500);
  expect(sdk.tables.Inspection).toHaveLength(1);expect(sdk.tables.InspectionResult).toHaveLength(1);
  fail=false;expect((await api.default(req(body))).status).toBe(200);
  expect((await api.default(req(body))).status).toBe(200);
  expect(sdk.tables.Inspection).toHaveLength(1);expect(sdk.tables.InspectionResult).toHaveLength(2);expect(sdk.tables.Fault).toHaveLength(1);
 });
 it('does not end a new shift when replaying an already completed end request',async()=>{
  const sdk=mock(),api=load('driverSession',sdk),grant=await api.issueGrant(sdk,device,'driver','bus',60000);
  const send=body=>api.default(req({device_id:'tablet',driver_grant:grant,...body}));
  const time=new Date().toISOString();
  await send({action:'start_shift',client_request_id:'start-123',occurred_at:time});
  const end={action:'end_shift',client_request_id:'end-12345',occurred_at:time};
  expect((await send(end)).status).toBe(200);
  await send({action:'start_shift',client_request_id:'start-456',occurred_at:time});
  expect((await (await send(end)).json()).deduplicated).toBe(true);
  expect(sdk.tables.DriverShift).toHaveLength(2);expect(sdk.tables.DriverShift[1].ended_at).toBeUndefined();
 });

 it('rejects queued boarding work from another tablet assignment',async()=>{
  const sdk=mock();sdk.tables.KioskDevice[0].kiosk_type='bus_boarding';
  const response=await load('kioskCheckIn',sdk).default(req({device_id:'tablet',action:'check_in',staff_name:'Manual',method:'manual',status:'boarded',client_request_id:'request-123',expected_company_id:'other'}));
  expect(response.status).toBe(409);expect(sdk.tables.StaffCheckIn).toBeUndefined();
 });
 it('rejects a GPS batch containing a point from another vehicle assignment',async()=>{
  const {sdk,send}=await driver();
  const response=await send({action:'upload_track',points:[{t:new Date().toISOString(),lat:18,lng:-76,expected_vehicle_id:'other'}]});
  expect(response.status).toBe(409);expect(sdk.tables.LocationPing).toBeUndefined();
 });

});
